#!/usr/bin/env tsx
/**
 * Prove the app says something, anywhere.
 *
 * The walk simulator covers the other half of the system: it replays a shipped
 * pack and checks the director's pacing. This covers the half that depends on
 * the outside world — what Wikipedia, Wikidata and OpenStreetMap actually
 * return for a coordinate, and whether that is enough for the director to open
 * its mouth.
 *
 * The sample points are chosen so that the interesting one is last. A dense
 * campus was never the problem. An ordinary residential street with no
 * landmarks on it is the case the Harvard-only build answered with silence, and
 * an empty rural road is the case that has to degrade to "you are in Nevada"
 * rather than to nothing.
 *
 * Runs against live APIs, so it needs a network and is not hermetic. Exits
 * non-zero if any sample point would leave the walker in silence.
 */

import { Director, DEFAULT_LENS } from "../src/lib/director";
import { Estimator } from "../src/lib/estimator";
import { resolveLive } from "../src/lib/content";
import { scaleOf } from "../src/lib/types";
import type { Fix, LonLat, Settings } from "../src/lib/types";

/* Local storage is used for the beat cache and the key. Neither is interesting
 * here, but the module reads it at import time on some paths, so it is shimmed
 * rather than guarded against in the app. */
/**
 * Pass `--wikipedia-only` to check the no-key floor, which is what a walker
 * without a Gemini key gets. Otherwise the key from the environment is used and
 * the full chain is exercised, including the unsourced path that only a model
 * can serve.
 */
const WIKI_ONLY = process.argv.includes("--wikipedia-only");

/** `--only=cambridge` narrows to one sample point, which is what makes the
 * model path testable: the full set with a real budget takes many minutes. */
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? null;

/** Model calls per location. Low by default so this stays runnable. */
const BUDGET = Number(
  process.argv.find((a) => a.startsWith("--calls="))?.slice(8) ?? 2,
);

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};

// The app reads the key from local storage, where the user pastes it. Under Node
// it comes from the environment so this can run in CI without a browser.
if (!WIKI_ONLY && process.env.GEMINI_API_KEY) {
  store.set("dweller.geminiKey", process.env.GEMINI_API_KEY);
}

const PLACES: { name: string; coord: LonLat }[] = [
  { name: "Harvard Yard (dense, and packed)", coord: [-71.1169, 42.3744] },
  { name: "Cambridgeport back street", coord: [-71.109, 42.3585] },
  { name: "Suburban Ohio cul-de-sac", coord: [-83.0958, 39.9612] },
  { name: "Rural Nevada, nothing for miles", coord: [-117.0, 39.5] },
];

const SETTINGS: Settings = {
  density: "steady",
  lens: DEFAULT_LENS,
  captions: true,
  voiceRate: 1,
};

/**
 * Stand still at a point for a while and collect whatever gets said.
 *
 * Standing still is the right test posture: it removes the duration-fit gate as
 * a confound, so a silent result means "nothing to say here" rather than "no
 * time to say it".
 */
function listen(
  coord: LonLat,
  subjects: Parameters<typeof Estimator>[0] extends never
    ? never
    : ConstructorParameters<typeof Estimator>[0]["subjects"],
  beats: ConstructorParameters<typeof Director>[0]["beats"],
  seconds: number,
): { at: number; name: string; scale: string; text: string }[] {
  const estimator = new Estimator({ subjects, paths: null });
  const director = new Director({ beats, settings: SETTINGS });
  const byId = new Map(subjects.map((s) => [s.id, s]));

  const spoken: { at: number; name: string; scale: string; text: string }[] =
    [];
  const t0 = 1_700_000_000_000;
  let busyUntil = 0;

  for (let sec = 0; sec < seconds; sec++) {
    const now = t0 + sec * 1000;
    const fix: Fix = {
      at: now,
      coord,
      accuracyM: 8,
      speedMps: 0,
      headingDeg: null,
    };
    const est = estimator.push(fix);
    const decision = director.decide(est, sec < busyUntil, now);
    if (!decision.speak) continue;

    const beat = decision.speak.beat;
    const subject = byId.get(beat.subject);
    spoken.push({
      at: sec,
      name: subject?.name ?? beat.subject,
      scale: subject ? scaleOf(subject) : "?",
      text: beat.text,
    });
    busyUntil = sec + beat.sec;
    director.noteSpoken(beat, now + beat.sec * 1000, beat.sec);
  }
  return spoken;
}

let failures = 0;
let first = true;

for (const place of PLACES) {
  if (ONLY && !place.name.toLowerCase().includes(ONLY.toLowerCase())) continue;

  // A real walk resolves one location. This resolves four back to back, which
  // is enough to get the whole IP rate limited and produce failures that say
  // nothing about the app. The pause is a property of the test, not the code.
  if (!first) await new Promise((r) => setTimeout(r, 3000));
  first = false;

  console.log(`\n${"─".repeat(72)}\n${place.name}`);
  console.log(`  ${place.coord[1].toFixed(4)}, ${place.coord[0].toFixed(4)}`);

  const content = await resolveLive(place.coord, {
    wikipediaOnly: WIKI_ONLY,
    maxModelCalls: BUDGET,
  });

  console.log(`  where        ${content.label}`);
  console.log(`  origin       ${content.origin}`);
  console.log(`  note         ${content.note ?? "—"}`);

  const byScale = new Map<string, number>();
  for (const s of content.subjects) {
    byScale.set(scaleOf(s), (byScale.get(scaleOf(s)) ?? 0) + 1);
  }
  console.log(
    `  subjects     ${content.subjects.length} ` +
      `(${[...byScale].map(([k, v]) => `${v} ${k}`).join(", ") || "none"})`,
  );
  console.log(`  beats        ${content.beats.length}`);

  if (!content.beats.length) {
    console.log("  ! NO BEATS — the walker would get silence here");
    failures += 1;
    continue;
  }

  // Ten minutes of standing still. Long enough for the director to work through
  // the fine tier and fall back outward if it runs dry.
  const heard = listen(place.coord, content.subjects, content.beats, 600);
  console.log(`  said         ${heard.length} beats in ten minutes standing`);
  for (const line of heard.slice(0, 5)) {
    console.log(
      `    ${String(line.at).padStart(4)}s ${line.scale.padEnd(9)} ` +
        `${line.name.slice(0, 34).padEnd(34)} ${line.text.slice(0, 60)}…`,
    );
  }

  if (!heard.length) {
    console.log("  ! content resolved but the director never spoke");
    failures += 1;
    continue;
  }

  // The point of the scale tiers: somewhere with no landmarks still has a
  // neighbourhood, and the director must be willing to talk about it.
  const scalesHeard = new Set(heard.map((h) => h.scale));
  console.log(`  scales heard ${[...scalesHeard].join(", ")}`);
}

console.log(`\n${"═".repeat(72)}`);
if (failures) {
  console.log(`${failures} problem${failures === 1 ? "" : "s"} found`);
  process.exit(1);
}
console.log("every sample point produces narration");
