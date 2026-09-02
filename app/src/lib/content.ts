/**
 * Deciding what the app knows about wherever you switched it on.
 *
 * Three sources, tried in order, each a fallback for the one before:
 *
 *   1. A shipped pack. Hand-authored, fact-checked, works offline, has
 *      footpaths and photos. Only exists where somebody built one.
 *   2. Gemini, live, from Wikipedia extracts. Needs a key and a signal.
 *      Sounds like the corpus because it is given the same persona.
 *   3. Wikipedia extracts, sliced up with no model at all. Works everywhere,
 *      costs nothing, and reads like an encyclopedia.
 *
 * Beyond the fallback chain there is *augmentation*, which is the thing that
 * makes an ordinary residential street work. Whatever the base content turns
 * out to be, the resolver also builds coarse subjects for the neighbourhood and
 * the city from a reverse geocode. Those sit in the outer scale tiers, so the
 * director ignores them entirely while there is a building worth discussing and
 * reaches for them the moment there is not.
 */

import { distanceM } from "./geo";
import {
  classifyByTitle,
  geosearchOutward,
  intros,
  isDisambiguation,
  introsByTitle,
  placeLabel,
  reverseGeocode,
} from "./discover";
import type { PlaceName } from "./discover";
import {
  areaSubject,
  articleSubject,
  geminiBeats,
  geminiPlaceBeats,
  wikipediaBeats,
} from "./live";
import { SCALES, SCALE_DEFAULT_RADIUS_M, scaleOf } from "./types";
import type {
  AreaIndex,
  AreaPack,
  Beat,
  Content,
  LonLat,
  Subject,
} from "./types";

/**
 * How far outside a pack's centre we still consider you to be "in" it. Packs
 * carry a clip box, but a walker two streets past the corner of it is much
 * better served by the pack than by a cold Wikipedia lookup.
 */
const PACK_SLACK_M = 400;

/** Live site subjects further away than this are not things you can look at. */
const LIVE_SITE_RADIUS_M = 110;

const KEY_STORAGE = "dweller.geminiKey";
const CACHE_PREFIX = "dweller.cache.";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------ the key --- */

/**
 * The Gemini key lives in this browser's local storage and nowhere else. It is
 * never committed and never sent anywhere except Google's endpoint.
 *
 * A static site cannot keep a secret, so there is no arrangement in which this
 * key is protected from someone holding the unlocked phone. That is an accepted
 * trade for a personal app with no backend; anyone sharing this more widely
 * should proxy the call instead.
 */
export function geminiKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

/**
 * Adopt a key passed as `?key=` on the URL, then scrub it from the address bar.
 *
 * Local storage is per-origin, so every new tunnel or host starts with no key
 * and silently drops to the Wikipedia-only rung. Typing a forty-character
 * secret into a phone keyboard before a walk is the kind of friction that ends
 * with the walk happening without the app, so a one-tap link is worth having.
 *
 * The key does end up in a URL, which is worse than not being in one: it can
 * land in history and in whatever messaged the link. That is the same accepted
 * trade as `geminiKey` above — a static site cannot hold a secret — so the
 * mitigation is only to keep it short-lived: it is moved into storage on first
 * load and removed from the visible URL immediately.
 */
export function adoptKeyFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    const key = url.searchParams.get("key");
    if (!key) return;
    setGeminiKey(key);
    url.searchParams.delete("key");
    window.history.replaceState(null, "", url.toString());
  } catch {
    // A malformed URL is not worth failing to start over.
  }
}

export function setGeminiKey(key: string | null): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Private browsing; live generation just stays off for this session.
  }
}

/* ------------------------------------------------------------- caching --- */

/**
 * Generated beats are cached by subject so a second walk down the same street
 * costs nothing and works with the phone in aeroplane mode. Local storage is
 * the right size of tool here: beats are a few hundred bytes of text each.
 */
function cacheGet(key: string): Beat[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { at: number; beats: Beat[] };
    if (Date.now() - entry.at > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.beats;
  } catch {
    return null;
  }
}

function cachePut(key: string, beats: Beat[]): void {
  try {
    localStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ at: Date.now(), beats }),
    );
  } catch {
    // Quota exceeded. Drop the oldest half rather than failing the walk.
    pruneCache();
  }
}

function pruneCache(): void {
  try {
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith(CACHE_PREFIX),
    );
    for (const k of keys.slice(0, Math.ceil(keys.length / 2))) {
      localStorage.removeItem(k);
    }
  } catch {
    // Nothing further to try.
  }
}

/* --------------------------------------------------------------- packs --- */

/**
 * Fill in fields that packs built before scale tiers existed do not carry, so
 * old and new packs are indistinguishable to everything downstream.
 */
function normalizePack(pack: AreaPack): AreaPack {
  return {
    ...pack,
    subjects: pack.subjects.map((s) => ({ ...s, scale: s.scale ?? "site" })),
    beats: pack.beats.map((b) => ({ ...b, origin: b.origin ?? "corpus" })),
  };
}

export async function loadAreaIndex(): Promise<AreaIndex | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}areas/index.json`);
    if (!res.ok) return null;
    return (await res.json()) as AreaIndex;
  } catch {
    return null;
  }
}

export async function loadPack(areaId: string): Promise<AreaPack> {
  const res = await fetch(`${import.meta.env.BASE_URL}areas/${areaId}.json`);
  if (!res.ok) throw new Error(`area ${areaId} not found (${res.status})`);
  return normalizePack((await res.json()) as AreaPack);
}

/** Nearest shipped area to a point, with the distance to its edge. */
export function nearestArea(
  index: AreaIndex,
  coord: LonLat,
): { area: AreaIndex["areas"][number]; distanceM: number } | null {
  let best: { area: AreaIndex["areas"][number]; distanceM: number } | null =
    null;
  for (const area of index.areas) {
    const d = distanceToClip(coord, area.clip, area.center);
    if (!best || d < best.distanceM) best = { area, distanceM: d };
  }
  return best;
}

/**
 * Distance to a pack's clip box, or zero inside it. Falls back to the centre
 * distance for packs written without a clip.
 */
function distanceToClip(coord: LonLat, clip: number[], center: LonLat): number {
  if (!clip || clip.length !== 4) return distanceM(coord, center);
  const [minLat, minLon, maxLat, maxLon] = clip;
  const [lon, lat] = coord;
  const clampedLat = Math.min(Math.max(lat, minLat), maxLat);
  const clampedLon = Math.min(Math.max(lon, minLon), maxLon);
  return distanceM(coord, [clampedLon, clampedLat]);
}

/* ---------------------------------------------------------------- live --- */

/**
 * A coarse subject plus the article titles it might be filed under, most
 * qualified first. The queries travel with the subject because working out what
 * Wikipedia calls a neighbourhood needs the containing city and county, and
 * those are known here and nowhere downstream.
 */
interface Coarse {
  subject: Subject;
  queries: string[];
  /** Broadest known container, used to reject a same-named place elsewhere. */
  within: string | null;
}

interface LiveOptions {
  /** Called as work completes so the UI can narrate the wait. */
  onProgress?: (message: string) => void;
  /** Skip the model even when a key is present. */
  wikipediaOnly?: boolean;
  /**
   * Ceiling on model calls for one resolve. Exists because the free tier is
   * metered per day: eight is a reasonable spend for a real walk and far too
   * slow for a test that resolves several places in a row.
   */
  maxModelCalls?: number;
}

/**
 * Build subjects and beats for an arbitrary point.
 *
 * Deliberately sequential and modest: one geosearch, one batch of extracts, one
 * reverse geocode, then at most a handful of model calls for the nearest few
 * subjects. Writing beats for forty articles the walker will never reach is
 * both slow and, on a free tier, a waste of the day's quota.
 */
export async function resolveLive(
  coord: LonLat,
  opts: LiveOptions = {},
): Promise<Content> {
  const progress = opts.onProgress ?? (() => {});
  const key = opts.wikipediaOnly ? null : geminiKey();
  const callBudget = opts.maxModelCalls ?? 8;

  progress("Looking up where you are");
  const [place, found] = await Promise.all([
    reverseGeocode(coord),
    geosearchOutward(coord).catch(() => ({ articles: [], radiusM: 0 })),
  ]);

  // What kind of thing each article is. Without this a park, a campus and the
  // article about the neighbourhood itself would all be filed as buildings, and
  // the last of those — the single most useful article for an unremarkable
  // street — would sit permanently out of range.
  progress("Working out what is around you");
  const classified = await classifyByTitle(
    found.articles.slice(0, 30).map((a) => a.title),
  );

  const sites: Subject[] = [];
  const wide: Subject[] = [];
  for (const article of found.articles.slice(0, 30)) {
    const scale = classified.get(article.title) ?? "site";
    const radiusM =
      scale === "site" ? LIVE_SITE_RADIUS_M : SCALE_DEFAULT_RADIUS_M[scale];
    // Keep only what you are inside or could plausibly reach on this walk.
    if (article.distanceM > radiusM * 2.5) continue;
    const subject = articleSubject(article, radiusM, scale);
    if (scale === "site") sites.push(subject);
    else wide.push(subject);
  }

  // The geocoder's names for the neighbourhood and the city, minus anything
  // Wikipedia already gave us an article for at the same scale.
  const named = coarseSubjects(coord, place, wide);

  const coarse = [...wide, ...named.map((c) => c.subject)].sort(
    (a, b) => SCALES.indexOf(a.scale) - SCALES.indexOf(b.scale),
  );
  const subjects: Subject[] = [...sites.slice(0, 12), ...coarse];

  if (!subjects.length) {
    return {
      origin: "none",
      label: placeLabel(place),
      subjects: [],
      beats: [],
      paths: null,
      note: "Nothing in Wikipedia or OpenStreetMap near this point.",
    };
  }

  progress("Reading up");
  const pageids = subjects
    .map((s) => s.wikipedia?.pageid)
    .filter((id): id is number => typeof id === "number");
  const texts = await intros(pageids);

  // Subjects named by the geocoder have no page id, because their titles are
  // guesses rather than geosearch results. These take the slower path.
  const bySubjectId = await coarseExtracts(named);

  const beats: Beat[] = [];
  let usedGemini = false;
  let geminiError: string | null = null;

  // Writing order matters on a metered key: nearest first, coarse tiers last,
  // so a quota that runs out mid-resolve costs the least useful material.
  let modelCalls = 0;

  for (const subject of subjects) {
    const extract =
      (subject.wikipedia?.pageid != null
        ? texts.get(subject.wikipedia.pageid)
        : null) ??
      bySubjectId.get(subject.id) ??
      null;
    const grounded = extract && !isDisambiguation(extract) ? extract : null;

    // A subject with no article is only worth talking about if a model can say
    // something about the region. There is nothing to read out otherwise.
    if (!grounded && (!key || scaleOf(subject) === "site")) continue;

    const cacheKey = `${subject.id}:${key ? (grounded ? "ai" : "gen") : "wiki"}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      beats.push(...cached);
      if (key) usedGemini = true;
      continue;
    }

    if (key && modelCalls < callBudget) {
      try {
        progress(`Writing about ${subject.name}`);
        modelCalls += 1;
        const written = grounded
          ? await geminiBeats(subject, grounded, key, kindOf(subject))
          : await geminiPlaceBeats(subject, placeFor(subject, place), key);
        cachePut(cacheKey, written);
        beats.push(...written);
        usedGemini = true;
        continue;
      } catch (err) {
        geminiError = err instanceof Error ? err.message : String(err);
        // Fall through to the encyclopedia. A key that has hit its daily quota
        // should degrade the prose, not end the walk.
      }
    }

    if (!grounded) continue;
    const plain = wikipediaBeats(subject, grounded);
    cachePut(`${subject.id}:wiki`, plain);
    beats.push(...plain);
  }

  const origin = usedGemini ? "gemini" : beats.length ? "wikipedia" : "none";
  return {
    origin,
    label: placeLabel(place),
    subjects,
    beats,
    paths: null,
    note: noteFor(origin, key != null, geminiError),
  };
}

function noteFor(
  origin: Content["origin"],
  hasKey: boolean,
  geminiError: string | null,
): string | null {
  if (origin === "none") return "Nothing found near this point.";
  if (origin === "gemini") return "Written just now, and not fact-checked.";
  if (!hasKey) {
    return "Read from Wikipedia. Add a Gemini key for better writing.";
  }
  return geminiError
    ? `Wikipedia only — Gemini failed: ${geminiError}`
    : "Read from Wikipedia.";
}

/**
 * The place description handed to the model when there is no article.
 *
 * Narrowed to the subject's own scale so the prompt and the subject agree: a
 * district subject should not be told the city's name as though that were what
 * it is, or the model writes about the wrong thing.
 */
function placeFor(subject: Subject, place: PlaceName | null): PlaceName {
  const base: PlaceName = {
    neighbourhood: null,
    city: null,
    county: place?.county ?? null,
    region: place?.region ?? null,
    country: place?.country ?? null,
    road: null,
  };
  if (scaleOf(subject) === "district") {
    return { ...base, neighbourhood: subject.name, city: place?.city ?? null };
  }
  if (scaleOf(subject) === "region") {
    return { ...base, city: subject.name };
  }
  return { ...base, road: place?.road ?? null, city: place?.city ?? null };
}

function kindOf(subject: Subject): string {
  switch (subject.scale) {
    case "district":
      return "a neighbourhood";
    case "region":
      return "a city or town";
    case "place":
      return "a square, park or street";
    default:
      return "a building or landmark";
  }
}

/**
 * Neighbourhood and city subjects, centred on the walker.
 *
 * They are centred on you rather than on the real centroid of the place because
 * we do not know the real centroid, and it does not matter: these tiers exist
 * to be in range for as long as you are plausibly inside them, and a radius
 * around your starting point does that well enough.
 *
 * `existing` is whatever the geosearch already produced at these scales, so a
 * place Wikipedia knows by name is not also added blind from the geocoder.
 */
function coarseSubjects(
  coord: LonLat,
  place: PlaceName | null,
  existing: Subject[],
): Coarse[] {
  const out: Coarse[] = [];
  // Matched on the leading segment, so "Cambridgeport" is recognised as already
  // covered by the article titled "Cambridgeport, Cambridge, Massachusetts".
  const seen = new Set(
    existing.map((s) => s.name.split(",")[0].trim().toLowerCase()),
  );

  const add = (
    name: string | null,
    scale: "place" | "district" | "region",
    qualifiers: (string | null)[],
  ) => {
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());

    // Wikipedia titles places by their containers, but which containers varies:
    // "Cambridgeport, Cambridge, Massachusetts", "Franklin Township, Franklin
    // County, Ohio", "Cambridge, Massachusetts", and plain "Nevada" are all
    // correct. Rather than encode those conventions, offer every ordered subset
    // of the qualifiers, most-qualified first, and let the batch decide.
    //
    // Subsets rather than prefixes because the conventions skip levels: US
    // cities are titled by state, omitting the county the geocoder reports, so
    // dropping only from the end never produces "Cambridge, Massachusetts" and
    // the guess falls through to bare "Cambridge" — the one in England.
    const parts = qualifiers.filter((q): q is string => !!q);
    const queries = subsets(parts)
      .sort((a, b) => b.length - a.length)
      .map((chain) => [name, ...chain].join(", "));

    out.push({
      subject: areaSubject(
        `area-${scale}-${slug(name)}`,
        name,
        coord,
        SCALE_DEFAULT_RADIUS_M[scale],
        scale,
        queries[0],
      ),
      queries: [...new Set(queries)],
      // The broadest container we know of. Used to reject a same-named place
      // somewhere else in the world.
      within: parts.length ? parts[parts.length - 1] : null,
    });
  };

  if (place) {
    add(place.neighbourhood, "district", [place.city, place.region]);
    add(place.city, "region", [place.county, place.region]);
    // With no neighbourhood and no city, the state is better than silence.
    if (!place.neighbourhood && !place.city) {
      add(place.region, "region", [place.country]);
    }
  }

  return out;
}

/** Ordered subsets of `parts`, preserving order within each. */
function subsets(parts: string[]): string[][] {
  let out: string[][] = [[]];
  for (const part of parts) {
    out = [...out, ...out.map((chain) => [...chain, part])];
  }
  return out;
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Extracts for the coarse tiers, whose titles are guesses from a geocoder.
 *
 * Tries the guess first because it is free when it works, then falls back to
 * Wikipedia's own search. Keyed by subject id rather than title so the caller
 * does not have to care which attempt succeeded.
 */
async function coarseExtracts(coarse: Coarse[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!coarse.length) return out;

  // Every plausible title for every subject, in one batched call. Wikipedia's
  // naming conventions for places vary — "Cambridgeport, Cambridge,
  // Massachusetts", "Franklin Township, Franklin County, Ohio", plain "Nevada"
  // — so all the qualified forms go in and the best answer is picked from what
  // comes back. An earlier version resolved these through the search endpoint
  // instead, which guessed worse and rate limited hard; when no title lands
  // there is now a better answer than a cleverer query, which is to let the
  // model write from the place's name.
  const asked = coarse.flatMap((c) => c.queries);
  const found = await introsByTitle([...new Set(asked)]);

  for (const { subject, queries, within } of coarse) {
    for (const query of queries) {
      const extract = found.get(query);
      if (!extract || !usable(extract, subject.name, within)) continue;
      out.set(subject.id, extract);
      if (subject.wikipedia) {
        subject.wikipedia.title = query;
        subject.wikipedia.url = `https://en.wikipedia.org/wiki/${encodeURIComponent(
          query.replace(/ /g, "_"),
        )}`;
      }
      break;
    }
  }

  return out;
}

/**
 * Long enough to say something, actually about the place asked for, and not a
 * list of things the name might mean.
 *
 * The name check matters because a title guess can land on a container rather
 * than its contents: ask about "Cambridge, Middlesex County, Massachusetts" and
 * you can get the article on Middlesex County, which would then be narrated as
 * though it were the city underfoot.
 *
 * `within` guards the other direction. Place names repeat across the world, and
 * an unqualified title lands on whichever is most famous, so an extract that
 * never mentions the state or country you are standing in is about a different
 * place of the same name.
 */
function usable(extract: string, name: string, within: string | null): boolean {
  if (extract.length < 80) return false;
  if (isDisambiguation(extract)) return false;
  const head = extract.slice(0, 300).toLowerCase();
  if (!head.includes(name.toLowerCase())) return false;
  return !within || extract.toLowerCase().includes(within.toLowerCase());
}

/* ------------------------------------------------------------- resolve --- */

export interface Resolved {
  content: Content;
  /** The pack in play, when one is. Carries footpaths and photos. */
  pack: AreaPack | null;
  /** Set when a pack exists nearby but you are not in it. */
  nearestPack: { name: string; distanceM: number; center: LonLat } | null;
}

/**
 * The entry point. Prefers a shipped pack, falls back to live content, and
 * reports the nearest pack either way so the UI can point at it.
 */
export async function resolveContent(
  coord: LonLat,
  opts: LiveOptions = {},
): Promise<Resolved> {
  const index = await loadAreaIndex();
  const near = index ? nearestArea(index, coord) : null;

  if (near && near.distanceM <= PACK_SLACK_M) {
    try {
      const pack = await loadPack(near.area.id);
      return {
        pack,
        nearestPack: null,
        content: {
          origin: "pack",
          label: pack.area.name,
          subjects: pack.subjects,
          beats: pack.beats,
          paths: pack.paths,
          note: null,
        },
      };
    } catch {
      // A pack that will not load is no better than no pack.
    }
  }

  const content = await resolveLive(coord, opts);
  return {
    pack: null,
    content,
    nearestPack: near
      ? {
          name: near.area.name,
          distanceM: near.distanceM,
          center: near.area.center,
        }
      : null,
  };
}

/**
 * Coarse tiers only, for augmenting a pack mid-walk.
 *
 * Called after a pack-based walk has already started, so that running out of
 * authored material falls through to the neighbourhood rather than to silence.
 * Cheap by construction: one geocode and at most two subjects.
 */
export async function resolveBroad(
  coord: LonLat,
  opts: LiveOptions = {},
): Promise<{ subjects: Subject[]; beats: Beat[] }> {
  const key = opts.wikipediaOnly ? null : geminiKey();
  const place = await reverseGeocode(coord);
  const coarse = coarseSubjects(coord, place, []);
  if (!coarse.length) return { subjects: [], beats: [] };

  const texts = await coarseExtracts(coarse);
  const subjects = coarse.map((c) => c.subject);

  const beats: Beat[] = [];
  for (const subject of subjects) {
    const extract = texts.get(subject.id);
    if (!extract) continue;

    const cacheKey = `${subject.id}:${key ? "ai" : "wiki"}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      beats.push(...cached);
      continue;
    }
    if (key) {
      try {
        const written = await geminiBeats(
          subject,
          extract,
          key,
          kindOf(subject),
        );
        cachePut(cacheKey, written);
        beats.push(...written);
        continue;
      } catch {
        // Encyclopedia prose about the neighbourhood beats nothing about it.
      }
    }
    const plain = wikipediaBeats(subject, extract);
    cachePut(`${subject.id}:wiki`, plain);
    beats.push(...plain);
  }

  // Coarse subjects with no article at all still get covered, since knowing the
  // name of the neighbourhood is enough for the model to place it.
  if (key) {
    for (const subject of subjects) {
      if (texts.has(subject.id)) continue;
      const cacheKey = `${subject.id}:gen`;
      const cached = cacheGet(cacheKey);
      if (cached) {
        beats.push(...cached);
        continue;
      }
      try {
        const written = await geminiPlaceBeats(
          subject,
          placeFor(subject, place),
          key,
        );
        cachePut(cacheKey, written);
        beats.push(...written);
      } catch {
        // Nothing left to try for this tier.
      }
    }
  }

  return { subjects, beats };
}
