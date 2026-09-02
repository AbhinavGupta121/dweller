/**
 * Drive the estimator, director and a silent narrator through a simulated walk
 * and print the transcript.
 *
 * This is the only way to know whether the director is any good without being
 * in Cambridge. It checks the things that are easy to get wrong and invisible in
 * a screenshot: does it talk at the right moments, does it ever announce the
 * same subject twice, does dwelling actually escalate to deeper material, and
 * does it stay inside its talk budget.
 *
 *   npx tsx scripts/verify-walk.ts [sparse|steady|chatty]
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Estimator } from "../src/lib/estimator";
import { Director, DEFAULT_LENS } from "../src/lib/director";
import {
  HARVARD_YARD_WALK,
  simulateWalk,
  routeStats,
} from "../src/lib/simulate";
import type { AreaPack, Beat, Settings, TalkDensity } from "../src/lib/types";

const here = dirname(fileURLToPath(import.meta.url));
const pack: AreaPack = JSON.parse(
  readFileSync(
    join(here, "..", "public", "areas", "harvard-yard.json"),
    "utf8",
  ),
);

const density = (process.argv[2] as TalkDensity) ?? "steady";
if (!["sparse", "steady", "chatty"].includes(density)) {
  console.error(`unknown density "${density}"`);
  process.exit(1);
}

const settings: Settings = {
  density,
  lens: DEFAULT_LENS,
  captions: true,
  voiceRate: 1,
};

const estimator = new Estimator({
  subjects: pack.subjects,
  paths: pack.paths,
});
const director = new Director({ beats: pack.beats, settings });

const samples = simulateWalk({
  route: HARVARD_YARD_WALK,
  fixIntervalSec: 1,
  noiseM: 8,
  seed: 11,
  startAt: 0,
});

const stats = routeStats(HARVARD_YARD_WALK);
console.log(
  `\n${HARVARD_YARD_WALK.name}\n` +
    `${Math.round(stats.distanceM)} m, ` +
    `${fmt(stats.movingSec)} walking + ${fmt(stats.pausedSec)} standing ` +
    `= ${fmt(stats.movingSec + stats.pausedSec)} total\n` +
    `density: ${density}\n`,
);

/* --------------------------------------------------------- the loop --- */

interface Spoken {
  atSec: number;
  endsAtSec: number;
  beat: Beat;
  preamble: string | null;
  legLabel: string;
  /** What the estimator believed at the moment the beat was chosen. */
  motionAtStart: string;
  dwellAtStart: number;
  /** Distance to the subject when the beat started and when it finished. */
  distanceAtStart: number;
  distanceAtEnd: number | null;
  /** When a wind-down was requested, if it was. */
  windDownAtSec: number | null;
  /** How long the beat actually ran, which is shorter if it wound down. */
  actualSec: number;
  why: string;
}

/** Assumed time to reach the end of the current sentence after a wind-down. */
const SENTENCE_TAIL_SEC = 5;

const transcript: Spoken[] = [];
let busyUntilSec = -1;
let inFlight: Spoken | null = null;
let lastLeg = "";
const accuracyErrors: number[] = [];

for (const sample of samples) {
  const nowMs = sample.fix.at;
  const nowSec = sample.elapsedSec;

  estimator.pushHeading(sample.fix.headingDeg, nowMs);
  const est = estimator.push(sample.fix);

  if (est) {
    // How far the estimate is from ground truth, to keep the noise honest.
    accuracyErrors.push(
      Math.hypot(
        (est.coord[0] - sample.truth[0]) *
          111320 *
          Math.cos((sample.truth[1] * Math.PI) / 180),
        (est.coord[1] - sample.truth[1]) * 110574,
      ),
    );
  }

  // The real narrator stops at the next sentence boundary, so model a wind-down
  // as finishing a few seconds later rather than instantly.
  if (
    inFlight &&
    inFlight.windDownAtSec == null &&
    director.shouldWindDown(est, inFlight.beat)
  ) {
    inFlight.windDownAtSec = nowSec;
    busyUntilSec = Math.min(busyUntilSec, nowSec + SENTENCE_TAIL_SEC);
  }

  if (inFlight && nowSec >= busyUntilSec) {
    // Record how far away the subject was by the time we stopped talking — this
    // is what tells us whether a beat outlived its own relevance.
    inFlight.distanceAtEnd =
      est?.nearby.find((p) => p.subject.id === inFlight!.beat.subject)
        ?.distanceM ?? Infinity;
    inFlight.actualSec = nowSec - inFlight.atSec;
    director.noteSpoken(inFlight.beat, nowMs, inFlight.actualSec);
    inFlight = null;
  }

  const busy = inFlight != null;
  const decision = director.decide(est, busy, nowMs);

  if (sample.legLabel !== lastLeg) {
    lastLeg = sample.legLabel;
    console.log(`\n── ${pad(nowSec)} ${sample.legLabel} ──`);
  }

  if (decision.speak && est) {
    const proximity = est.nearby.find(
      (p) => p.subject.id === decision.speak!.beat.subject,
    );
    const spoken: Spoken = {
      atSec: nowSec,
      endsAtSec: nowSec + decision.speak.beat.sec,
      beat: decision.speak.beat,
      preamble: decision.speak.preamble,
      legLabel: sample.legLabel,
      motionAtStart: est.motion,
      dwellAtStart: est.dwellSec,
      distanceAtStart: proximity?.distanceM ?? Infinity,
      distanceAtEnd: null,
      windDownAtSec: null,
      actualSec: decision.speak.beat.sec,
      why: decision.speak.why,
    };
    transcript.push(spoken);
    inFlight = spoken;
    busyUntilSec = spoken.endsAtSec;

    const subject = pack.subjects.find((s) => s.id === spoken.beat.subject);
    const head =
      `${pad(nowSec)} ${est.motion === "still" ? "◼" : "▸"} ` +
      `${subject?.name ?? spoken.beat.subject}` +
      `  [${spoken.beat.angle} d${spoken.beat.depth} ${spoken.beat.sec}s]`;
    console.log(head);
    console.log(`        ${spoken.why}`);
    const line =
      (spoken.preamble ? spoken.preamble + " " : "") + spoken.beat.text;
    console.log(wrap(line, 92, "        "));
  }
}

/* ----------------------------------------------------------- report --- */

const totalSec = samples.length;
const spokenSec = transcript.reduce((t, s) => t + s.actualSec, 0);
const meanError =
  accuracyErrors.reduce((a, b) => a + b, 0) / (accuracyErrors.length || 1);

console.log(`\n${"═".repeat(60)}\n`);
console.log(`walk length        ${fmt(totalSec)}`);
console.log(
  `spoken             ${fmt(spokenSec)}  (${Math.round((spokenSec / totalSec) * 100)}% of the walk)`,
);
console.log(`beats used         ${transcript.length} of ${pack.beats.length}`);
console.log(
  `subjects covered   ${new Set(transcript.map((s) => s.beat.subject)).size} of ${pack.subjects.length}`,
);
console.log(
  `mean position error ${meanError.toFixed(1)} m (injected noise, unfiltered)`,
);

const gaps: number[] = [];
for (let i = 1; i < transcript.length; i++) {
  gaps.push(transcript[i].atSec - (transcript[i - 1].atSec + transcript[i - 1].actualSec));
}
if (gaps.length) {
  const longest = Math.max(...gaps);
  const shortest = Math.min(...gaps);
  console.log(
    `silence gaps       shortest ${shortest.toFixed(0)}s, longest ${longest.toFixed(0)}s`,
  );
}

const depthCounts = [1, 2, 3].map(
  (d) => transcript.filter((s) => s.beat.depth === d).length,
);
console.log(
  `depths used        d1 ${depthCounts[0]}, d2 ${depthCounts[1]}, d3 ${depthCounts[2]}`,
);

const whileMoving = transcript.filter((s) => s.motionAtStart !== "still");
const deepWhileMoving = whileMoving.filter((s) => s.beat.depth === 3);
console.log(
  `while moving       ${whileMoving.length} beats, ${deepWhileMoving.length} of them deep`,
);

// A beat that ends with its subject far behind you is one that outlived its own
// relevance. This tracks how the pacing actually feels better than any other
// single number, because it is the moment a listener thinks "why is it still
// talking about that".
const radiusOf = (id: string) =>
  pack.subjects.find((s) => s.id === id)?.radiusM ?? 50;
const outlived = transcript.filter(
  (s) =>
    s.distanceAtEnd != null && s.distanceAtEnd > radiusOf(s.beat.subject) * 2,
);
console.log(
  `outlived subject   ${outlived.length} beats ended well past their subject`,
);

/* ------------------------------------------------------------ checks --- */

const problems: string[] = [];

const seen = new Set<string>();
for (const s of transcript) {
  if (seen.has(s.beat.id)) problems.push(`beat ${s.beat.id} played twice`);
  seen.add(s.beat.id);
}

const arrivalsBySubject = new Map<string, number>();
for (const s of transcript) {
  if (!s.beat.arrival) continue;
  arrivalsBySubject.set(
    s.beat.subject,
    (arrivalsBySubject.get(s.beat.subject) ?? 0) + 1,
  );
}
for (const [subject, n] of arrivalsBySubject) {
  if (n > 1) problems.push(`${subject} was introduced ${n} times`);
}

for (const s of transcript) {
  for (const req of s.beat.requires) {
    const reqIndex = transcript.findIndex((t) => t.beat.id === req);
    const myIndex = transcript.findIndex((t) => t.beat.id === s.beat.id);
    if (reqIndex === -1 || reqIndex > myIndex) {
      problems.push(`${s.beat.id} played before its prerequisite ${req}`);
    }
  }
}

for (let i = 1; i < transcript.length; i++) {
  if (transcript[i].atSec < transcript[i - 1].atSec + transcript[i - 1].actualSec) {
    problems.push(
      `${transcript[i].beat.id} started while ${transcript[i - 1].beat.id} was still speaking`,
    );
  }
}

for (const s of deepWhileMoving) {
  problems.push(
    `${s.beat.id} (depth 3, ${s.beat.sec}s) started while ${s.motionAtStart}`,
  );
}
for (const s of outlived) {
  problems.push(
    `${s.beat.id} ended ${Math.round(s.distanceAtEnd!)} m from its subject ` +
      `(radius ${radiusOf(s.beat.subject)} m)`,
  );
}

console.log("");
if (problems.length) {
  console.log(`${problems.length} problems:`);
  for (const p of problems) console.log(`  ! ${p}`);
  process.exitCode = 1;
} else {
  console.log("no problems found");
}

const untouched = pack.subjects.filter(
  (s) => !transcript.some((t) => t.beat.subject === s.id),
);
if (untouched.length) {
  console.log(
    `\nnot reached on this route: ${untouched.map((s) => s.id).join(", ")}`,
  );
}
console.log("");

/* ---------------------------------------------------------- helpers --- */

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

function pad(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function wrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) {
      lines.push(indent + line.trim());
      line = w;
    } else {
      line += " " + w;
    }
  }
  if (line.trim()) lines.push(indent + line.trim());
  return lines.join("\n");
}
