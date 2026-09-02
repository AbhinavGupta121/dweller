/**
 * A synthetic walk, used two ways: headless from Node to verify the director,
 * and in the app as a demo mode so the thing can be shown to someone who is not
 * standing in Cambridge.
 *
 * The simulator injects realistic GPS error rather than perfect positions,
 * because the failure modes worth catching — announcing arrival twice, dwell
 * never triggering, subjects flapping between approaching and leaving — only
 * appear under noise.
 */

import { distanceM, bearingDeg, lerpCoord } from "./geo";
import type { Fix, LonLat } from "./types";

export interface Leg {
  label: string;
  to: LonLat;
  /** Walking speed for this leg, m/s. Normal walking is about 1.35. */
  speedMps?: number;
  /** Seconds to stand still on arrival. */
  pauseSec?: number;
}

export interface WalkRoute {
  name: string;
  start: LonLat;
  legs: Leg[];
}

/**
 * The route I would actually walk: in at Johnston Gate, anticlockwise around the
 * Old Yard, across to the statue, into Tercentenary Theatre, then out past the
 * Science Center to Memorial Hall.
 */
export const HARVARD_YARD_WALK: WalkRoute = {
  name: "Harvard Yard, the long way round",
  start: [-71.11889, 42.37361],
  legs: [
    { label: "up to Johnston Gate", to: [-71.11849, 42.37468], pauseSec: 25 },
    { label: "into the Old Yard", to: [-71.11835, 42.37442], pauseSec: 20 },
    {
      label: "north past Harvard Hall",
      to: [-71.1182, 42.37492],
      pauseSec: 15,
    },
    { label: "to Holden Chapel", to: [-71.118, 42.37522], pauseSec: 35 },
    {
      label: "across to University Hall",
      to: [-71.1176, 42.37447],
      pauseSec: 20,
    },
    {
      label: "to the John Harvard statue",
      to: [-71.11694, 42.37444],
      pauseSec: 70,
    },
    {
      label: "into Tercentenary Theatre",
      to: [-71.11633, 42.37414],
      pauseSec: 20,
    },
    { label: "to the Widener steps", to: [-71.11662, 42.37395], pauseSec: 50 },
    { label: "east to Sever Hall", to: [-71.11547, 42.37436], pauseSec: 45 },
    {
      label: "north to Memorial Church",
      to: [-71.11616, 42.37491],
      pauseSec: 30,
    },
    {
      label: "out to the Science Center",
      to: [-71.1163, 42.3764],
      pauseSec: 25,
    },
    { label: "east to Memorial Hall", to: [-71.1149, 42.3759], pauseSec: 40 },
  ],
};

export interface SimOptions {
  route: WalkRoute;
  /** Seconds between emitted fixes. Phones typically manage about one. */
  fixIntervalSec?: number;
  /** Standard deviation of injected horizontal error, metres. */
  noiseM?: number;
  /** Reported accuracy value, which the estimator gates on. */
  reportedAccuracyM?: number;
  /** Deterministic seed so runs are comparable. */
  seed?: number;
  startAt?: number;
}

export interface SimSample {
  fix: Fix;
  /** True position, before noise. Useful for scoring the estimator. */
  truth: LonLat;
  /** Which leg we are on, and whether we are pausing. */
  legLabel: string;
  paused: boolean;
  elapsedSec: number;
}

/** Small deterministic PRNG so simulated runs are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller, so the injected error is Gaussian rather than uniform. */
function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Generate the whole walk as a list of samples. Returning an array rather than
 * streaming keeps the headless verifier simple; the app's demo mode replays it
 * on a timer.
 */
export function simulateWalk(opts: SimOptions): SimSample[] {
  const {
    route,
    fixIntervalSec = 1,
    noiseM = 8,
    reportedAccuracyM = 12,
    seed = 7,
    startAt = Date.now(),
  } = opts;

  const rand = mulberry32(seed);
  const samples: SimSample[] = [];

  let position = route.start;
  let elapsed = 0;

  const emit = (
    truth: LonLat,
    legLabel: string,
    paused: boolean,
    speed: number,
    heading: number | null,
  ) => {
    // Convert metre-space noise back into degrees at this latitude.
    const eastM = gaussian(rand) * noiseM;
    const northM = gaussian(rand) * noiseM;
    const mPerLonHere = 111320 * Math.cos((truth[1] * Math.PI) / 180);
    const noisy: LonLat = [
      truth[0] + eastM / mPerLonHere,
      truth[1] + northM / 110574,
    ];

    samples.push({
      fix: {
        at: startAt + elapsed * 1000,
        coord: noisy,
        accuracyM: reportedAccuracyM,
        speedMps: paused ? 0 : speed,
        headingDeg: paused ? null : heading,
      },
      truth,
      legLabel,
      paused,
      elapsedSec: elapsed,
    });
  };

  for (const leg of route.legs) {
    const speed = leg.speedMps ?? 1.35;
    const from = position;
    const legDistance = distanceM(from, leg.to);
    const legDuration = legDistance / speed;
    const heading = bearingDeg(from, leg.to);

    for (let t = 0; t < legDuration; t += fixIntervalSec) {
      emit(
        lerpCoord(from, leg.to, t / legDuration),
        leg.label,
        false,
        speed,
        heading,
      );
      elapsed += fixIntervalSec;
    }

    position = leg.to;

    const pause = leg.pauseSec ?? 0;
    for (let t = 0; t < pause; t += fixIntervalSec) {
      emit(position, leg.label, true, 0, null);
      elapsed += fixIntervalSec;
    }
  }

  return samples;
}

/**
 * Total walk length and duration, so the route can be sanity-checked against
 * how long you actually have.
 */
export function routeStats(route: WalkRoute): {
  distanceM: number;
  movingSec: number;
  pausedSec: number;
} {
  let position = route.start;
  let distance = 0;
  let moving = 0;
  let paused = 0;
  for (const leg of route.legs) {
    const d = distanceM(position, leg.to);
    distance += d;
    moving += d / (leg.speedMps ?? 1.35);
    paused += leg.pauseSec ?? 0;
    position = leg.to;
  }
  return { distanceM: distance, movingSec: moving, pausedSec: paused };
}
