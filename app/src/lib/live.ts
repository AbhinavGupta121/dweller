/**
 * Making beats for places nobody authored.
 *
 * Two writers, in descending order of quality:
 *
 * - `geminiBeats` asks a model to write in the narrator's voice from a supplied
 *   Wikipedia extract. Needs a key. Good prose, and the same voice as the
 *   hand-authored corpus because it is given the same persona brief.
 * - `wikipediaBeats` slices the extract into speakable chunks with no model at
 *   all. Works offline-ish, worldwide, free, forever. Reads like an
 *   encyclopedia, because it is one.
 *
 * Both are clearly marked in `Beat.origin` so the UI can tell the walker which
 * one they are hearing. That matters: a fact-checked corpus beat and a model's
 * unverified paraphrase should not look identical on screen.
 */

import { BROAD_GUIDE, PERSONA, UNSOURCED_GUIDE } from "./persona";
import type { NearbyArticle, PlaceName } from "./discover";
import type { Angle, Beat, Depth, Subject } from "./types";

/** Everything the model gets told about an unsourced location. */
export type PlaceContext = PlaceName;

/** Matches the corpus duration model so the director's gates behave the same. */
const WORDS_PER_SEC = 2.6;

function estimateSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / WORDS_PER_SEC);
}

/**
 * Depth is a duration band, mirroring `tools/corpus/schema.mjs`: 1 is 6–20s,
 * 2 is 16–42s, 3 is 34–95s. Depth 1 is what may be said while you are still
 * walking, so it stays short by definition.
 */
const DEPTH_CEILINGS: [number, Depth][] = [
  [20, 1],
  [42, 2],
];

/**
 * The depth a piece of text actually belongs to.
 *
 * Live beats are not run through the corpus validator, so nothing otherwise
 * stops a model labelling a seventy-second story as depth 2. That mislabelling
 * is not cosmetic: depth 2 is offered while you are walking, the duration-fit
 * gate then rejects it every time for being too long, and the subject goes
 * quiet for a reason nothing reports. Sorting by measured length keeps the
 * director's gates meaningful.
 */
function depthFor(sec: number): Depth {
  for (const [ceiling, depth] of DEPTH_CEILINGS) {
    if (sec <= ceiling) return depth;
  }
  return 3;
}

/**
 * Split into sentences without a full parser. Abbreviations will occasionally
 * split early, which costs a slightly clipped caption and nothing else.
 */
function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 24);
}

/**
 * Strip the parts of an encyclopedia lead that are unspeakable: pronunciation
 * guides, birth-and-death parentheticals, and reference cruft.
 */
function speakable(text: string): string {
  return text
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------ wikipedia --- */

/**
 * Target length for a chunk of encyclopedia prose, in seconds.
 *
 * Comfortably inside the depth-3 band. An earlier version capped the whole
 * body at three sentences on the theory that unedited encyclopedia prose gets
 * tiring when heard rather than read, which is true but was the wrong fix: it
 * threw away most of the lead and left the app with almost nothing to say in
 * the places that have no authored pack and no model key. Chunking the lead
 * into several beats keeps each one a manageable listen while making all of it
 * available.
 */
const WIKI_CHUNK_SEC = 46;
const WIKI_CHUNK_MAX_SEC = 88;

/**
 * Beats straight from an extract, no model involved.
 *
 * The first sentence of a Wikipedia lead is almost always a definition, which
 * is exactly what an arrival beat needs to be, so it maps over cleanly. The
 * remainder is grouped into as many beats as the lead supports.
 */
export function wikipediaBeats(subject: Subject, extract: string): Beat[] {
  const parts = sentences(speakable(extract));
  if (!parts.length) return [];

  const source = `wikipedia:${subject.wikipedia?.title ?? subject.name}`;
  const out: Beat[] = [
    makeBeat({
      id: `${subject.id}:wiki-arrival`,
      subject: subject.id,
      angle: "history",
      depth: 1,
      text: parts[0],
      arrival: true,
      origin: "wikipedia",
      sources: [source],
    }),
  ];

  chunk(parts.slice(1)).forEach((text, i) => {
    out.push(
      makeBeat({
        id: `${subject.id}:wiki-body-${i}`,
        subject: subject.id,
        angle: "history",
        depth: depthFor(estimateSeconds(text)),
        text,
        arrival: false,
        origin: "wikipedia",
        sources: [source],
      }),
    );
  });

  return out;
}

/**
 * Group sentences into beat-sized runs.
 *
 * A trailing run shorter than half the target is folded back into the previous
 * one rather than shipped as a stub, unless doing so would push that beat past
 * the depth-3 ceiling.
 */
function chunk(parts: string[]): string[] {
  const out: string[] = [];
  let current: string[] = [];

  for (const part of parts) {
    current.push(part);
    if (estimateSeconds(current.join(" ")) >= WIKI_CHUNK_SEC) {
      out.push(current.join(" "));
      current = [];
    }
  }

  if (current.length) {
    const tail = current.join(" ");
    const last = out[out.length - 1];
    if (
      last &&
      estimateSeconds(tail) < WIKI_CHUNK_SEC / 2 &&
      estimateSeconds(`${last} ${tail}`) <= WIKI_CHUNK_MAX_SEC
    ) {
      out[out.length - 1] = `${last} ${tail}`;
    } else {
      out.push(tail);
    }
  }

  return out;
}

/* --------------------------------------------------------------- gemini --- */

/**
 * Tried in order, best first. The list is longer than fault tolerance needs
 * because the free tier meters per model per day — twenty requests each — so
 * rotating on exhaustion is what buys a day's walking rather than a day's worth
 * of one model. Anything retired for new keys is left out: it costs a round
 * trip to learn that, every time.
 */
const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
];

interface GeminiBeatDraft {
  angle?: string;
  depth?: number;
  text?: string;
  arrival?: boolean;
  look?: string | null;
  tags?: string[];
}

const ANGLES: Angle[] = [
  "history",
  "architecture",
  "science",
  "people",
  "mythbust",
  "present",
  "detail",
];

/** The shared shape of every beat request, minus the source material. */
function taskFor(subject: Subject, kind: string): string {
  return `TASK
Write beats for ${kind} called "${subject.name}".

Return JSON only: an array of objects with keys angle, depth, text, arrival,
look, tags.

- angle: one of ${ANGLES.join(", ")}
- depth: how long the beat is spoken for.
    1 is ten to twenty seconds, and is what gets said while the listener is
      still walking, so it must stand alone.
    2 is thirty to forty seconds.
    3 is fifty to ninety seconds, and only ever plays when the listener has
      stopped, so it can take its time and follow a thread properly.
- arrival: exactly one beat must be true, and it must work as the first thing
  ever said about this. Make it depth 1.
- look: a physical thing to point the listener at, or null
- tags: two or three lowercase topic words

LENGTH
Write to the top of each band, not the bottom. A beat that stops after one
sentence is a headline, and a walk made of headlines is exhausting: the
listener gets a fact, then silence, then an unrelated fact. Develop one idea —
state it, give the detail that makes it true, then say why it matters or what
it led to. Depth 3 especially should feel like a story being told, not an entry
being read.

Write five beats: one depth 1 arrival, one more depth 1, two depth 2, and one
depth 3.`;
}

/** Grounded in a supplied article. The strongest form, so preferred. */
function sourcedBrief(subject: Subject, extract: string, kind: string): string {
  const broad = subject.scale === "site" ? "" : `\n\n${BROAD_GUIDE}`;
  return `${PERSONA}${broad}

${taskFor(subject, kind)}

Every claim must come from the source text below. If the source is thin, write
fewer beats rather than padding them.

SOURCE
${extract.slice(0, 6000)}`;
}

/**
 * No article, so the model writes from what it knows about the region.
 *
 * This is the rung that makes the app work on an ordinary street. The trade is
 * explicit: less specific than a sourced beat, and permitted to be, because the
 * alternative on most of the planet is silence.
 */
function unsourcedBrief(subject: Subject, place: PlaceContext): string {
  const where = [
    place.road && `street: ${place.road}`,
    place.neighbourhood && `neighbourhood: ${place.neighbourhood}`,
    place.city && `town or city: ${place.city}`,
    place.county && `county: ${place.county}`,
    place.region && `state or region: ${place.region}`,
    place.country && `country: ${place.country}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `${PERSONA}

${UNSOURCED_GUIDE}

${BROAD_GUIDE}

${taskFor(subject, "the area around the listener")}

WHERE THE LISTENER IS
${where}`;
}

/** Pull the first JSON array out of a model response that may be fenced. */
function parseDrafts(raw: string): GeminiBeatDraft[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return Array.isArray(parsed) ? (parsed as GeminiBeatDraft[]) : [];
  } catch {
    return [];
  }
}

/** Grounded beats, written from a supplied article. */
export function geminiBeats(
  subject: Subject,
  extract: string,
  apiKey: string,
  kind = "a place",
): Promise<Beat[]> {
  return callGemini(
    subject,
    sourcedBrief(subject, extract, kind),
    apiKey,
    "ai",
  );
}

/**
 * Beats for a place with no article, written from the model's own knowledge of
 * the region. Marked with a distinct id prefix so the cache never serves one
 * kind where the other was expected.
 */
export function geminiPlaceBeats(
  subject: Subject,
  place: PlaceContext,
  apiKey: string,
): Promise<Beat[]> {
  return callGemini(subject, unsourcedBrief(subject, place), apiKey, "gen");
}

async function callGemini(
  subject: Subject,
  prompt: string,
  apiKey: string,
  idPrefix: string,
): Promise<Beat[]> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.85, maxOutputTokens: 2048 },
  });

  let lastError: unknown = null;
  let exhausted = 0;
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body,
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!res.ok) {
        // A missing or revoked key will fail identically on every model, so
        // there is no point rotating through them.
        if (res.status === 400 || res.status === 403) {
          throw new Error(`Gemini rejected the key (${res.status})`);
        }
        // Daily per-model quota. Worth counting separately: every model being
        // spent is a wait-until-tomorrow, not a bug to chase.
        if (res.status === 429) exhausted++;
        lastError = new Error(`${model}: ${res.status}`);
        continue;
      }
      interface Response {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      }
      const data = (await res.json()) as Response;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const beats = draftsToBeats(subject, parseDrafts(text), idPrefix);
      if (beats.length) return beats;
      lastError = new Error(`${model}: no usable beats`);
    } catch (err) {
      if (err instanceof Error && err.message.includes("rejected the key")) {
        throw err;
      }
      lastError = err;
    }
  }
  if (exhausted === GEMINI_MODELS.length) {
    throw new Error("daily Gemini quota spent on every model");
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini failed");
}

function draftsToBeats(
  subject: Subject,
  drafts: GeminiBeatDraft[],
  idPrefix: string,
): Beat[] {
  const out: Beat[] = [];
  let hasArrival = false;

  drafts.forEach((d, i) => {
    const text = speakable(String(d.text ?? ""));
    if (text.length < 30) return;

    const angle = ANGLES.includes(d.angle as Angle)
      ? (d.angle as Angle)
      : "history";

    // Exactly one arrival, and it has to be short enough to survive being said
    // while the listener is still moving.
    const arrival = !hasArrival && (d.arrival === true || i === 0);
    if (arrival) hasArrival = true;

    // Measured length wins over the label. Models are asked for a band and
    // write to whatever length the sentence wanted, and a beat filed under a
    // band it does not fit is a beat the director will offer at the wrong
    // moment and then silently refuse.
    const depth = depthFor(estimateSeconds(text));

    out.push(
      makeBeat({
        id: `${subject.id}:${idPrefix}-${i}`,
        subject: subject.id,
        angle,
        // An arrival stays depth 1 whatever its length: depth 1 is the only
        // band offered while moving, and a subject whose opener cannot play
        // while you walk past it never opens at all.
        depth: arrival ? 1 : depth,
        text,
        arrival,
        look: d.look ?? null,
        tags: (d.tags ?? []).map((t) => String(t).toLowerCase()).slice(0, 4),
        origin: "gemini",
        sources: [`wikipedia:${subject.wikipedia?.title ?? subject.name}`],
      }),
    );
  });

  // The director refuses to say anything about a subject whose first beat is
  // not an arrival, so a set without one is worse than useless.
  if (!out.some((b) => b.arrival)) return [];
  return out;
}

/* ---------------------------------------------------------------- shared --- */

function makeBeat(
  partial: Pick<Beat, "id" | "subject" | "angle" | "depth" | "text"> &
    Partial<Beat>,
): Beat {
  return {
    look: null,
    tags: [],
    requires: [],
    excludes: [],
    sources: [],
    arrival: false,
    origin: "wikipedia",
    ...partial,
    sec: estimateSeconds(partial.text),
  };
}

/**
 * A synthetic subject for a named area. Used for the neighbourhood and city
 * tiers, which have no footprint and no photo — only a name and a centre.
 */
export function areaSubject(
  id: string,
  name: string,
  center: Subject["center"],
  radiusM: number,
  scale: Subject["scale"],
  wikipediaTitle: string | null = null,
): Subject {
  return {
    id,
    name,
    center,
    radiusM,
    scale,
    footprint: null,
    facadeLengthM: null,
    osm: null,
    tags: null,
    wikipedia: wikipediaTitle
      ? {
          title: wikipediaTitle,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(
            wikipediaTitle.replace(/ /g, "_"),
          )}`,
          pageid: null,
        }
      : null,
    wikidata: null,
    photo: null,
    claims: null,
  };
}

/** Turn a geosearch hit into a subject at whatever scale it was classified as. */
export function articleSubject(
  article: NearbyArticle,
  radiusM: number,
  scale: Subject["scale"] = "site",
): Subject {
  return {
    ...areaSubject(
      `wiki-${article.pageid}`,
      article.title,
      article.coord,
      radiusM,
      scale,
      article.title,
    ),
    wikipedia: {
      title: article.title,
      url: `https://en.wikipedia.org/?curid=${article.pageid}`,
      pageid: article.pageid,
    },
  };
}
