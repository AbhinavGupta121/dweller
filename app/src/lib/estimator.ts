/**
 * Turns a stream of noisy position fixes into a stable Estimate.
 *
 * The hard problem is not location, it is *stability*. Raw phone GPS in a
 * courtyard surrounded by four-storey brick jumps around by ten to thirty
 * metres, and a naive implementation will announce that you have arrived at
 * Widener four times while you stand still. Everything here exists to stop
 * that: speed is smoothed, dwell is measured from a displacement anchor rather
 * than from instantaneous speed, and proximity trends are hysteretic.
 *
 * Pure class with an explicit `push`. No timers, no React, no globals, so the
 * walk simulator can drive it at any rate it likes.
 */

import {
  bearingDeg,
  distanceM,
  distanceToSubject,
  angleDelta,
  relativeDirection,
  pointToSegment,
  mPerLon,
  M_PER_LAT,
} from "./geo";
import type {
  Estimate,
  Fix,
  LonLat,
  PathGraph,
  Subject,
  SubjectProximity,
} from "./types";

/** Fixes worse than this are ignored outright; they do more harm than good. */
const MAX_USABLE_ACCURACY_M = 45;

/** Speed smoothing time constant. Long enough to ride out GPS jitter. */
const SPEED_TAU_SEC = 6;

/**
 * A second, faster speed estimate used only to classify motion.
 *
 * Motion detection has to be asymmetric. Deciding you have started walking must
 * happen fast, because the director uses stillness to unlock long beats and
 * starting a seventy-second story as you walk away is the worst case. Deciding
 * you have stopped can be slow, because the cost of waiting is only a few
 * seconds of silence. Taking the maximum of a fast and a slow estimate gives
 * exactly that: quick to rise, reluctant to fall.
 */
const FAST_SPEED_TAU_SEC = 1.2;

/**
 * Ceiling on a believable speed for someone on foot, with margin for a jog or a
 * bike. Position differencing turns a single GPS jump — routine between tall
 * brick buildings, which is most of Harvard Yard — into an implied speed of
 * tens of metres per second. Left unclamped that pins the estimate high and the
 * director withholds anything longer than a glance for the next several
 * seconds, so one bad fix buys a stretch of unexplained silence.
 *
 * Clamping cannot tell a jump from genuine speed, and does not try to: the
 * position filter already handles the outlier. It only bounds how much damage a
 * bad fix does to the pacing, turning tens of seconds of recovery into one or
 * two.
 */
const PLAUSIBLE_MAX_SPEED_MPS = 8;

/**
 * You are "dwelling" once you have stayed within this radius of an anchor.
 *
 * This is applied to the *filtered* position. Applying it to raw fixes does not
 * work: with eight metres of per-axis noise the radial error averages about ten
 * metres, so a raw position crosses any useful threshold constantly and dwell
 * never accumulates. That bug is why the filter below exists.
 */
const DWELL_RADIUS_M = 10;

/**
 * Assumed velocity error, in m/s, used as the filter's process noise. This is
 * how wrong the prediction step might be, not how fast you are going, which is
 * why it stays small even at walking pace.
 */
const VELOCITY_UNCERTAINTY_MPS = 0.45;

/** Velocity smoothing time constant. Shorter than speed, to keep lag low. */
const VELOCITY_TAU_SEC = 2.5;

/** Below this smoothed speed we treat you as stopped regardless of drift. */
const STILL_SPEED_MPS = 0.35;

const MOTION_BANDS: { motion: Estimate["motion"]; upTo: number }[] = [
  { motion: "still", upTo: STILL_SPEED_MPS },
  { motion: "strolling", upTo: 0.9 },
  { motion: "walking", upTo: 1.6 },
  { motion: "brisk", upTo: Infinity },
];

/**
 * Approach/leave is classified from the *rate* at which distance is changing,
 * not from the per-fix delta. A per-fix threshold cannot work: at walking pace
 * with one fix per second the distance only changes by about 1.3 m per sample,
 * so any threshold large enough to survive GPS noise is also large enough that
 * a trend never registers at all.
 */
const TREND_RATE_MPS = 0.35;

/** Smoothing on the closing rate, in seconds. */
const TREND_TAU_SEC = 3;

export interface EstimatorOptions {
  subjects: Subject[];
  paths?: PathGraph | null;
  /**
   * How far beyond a subject's own radius to still report it. The director
   * wants a little lookahead so it can prepare rather than react.
   */
  lookaheadM?: number;
}

interface Tracked {
  lastDistanceM: number;
  lastAt: number;
  /** Smoothed closing rate in m/s. Negative means getting closer. */
  rateMps: number;
  trend: SubjectProximity["trend"];
}

export class Estimator {
  private subjects: Subject[];
  private readonly paths: PathGraph | null;
  private readonly lookaheadM: number;

  private last: Fix | null = null;
  private speedMps = 0;
  private fastSpeedMps = 0;

  /**
   * Filtered position and its variance, in metres-squared.
   *
   * A scalar Kalman filter per axis, but with a velocity-driven prediction step.
   * Without prediction the filter has to choose between noise and lag: enough
   * smoothing to kill ten metres of jitter also puts the estimate about ten
   * metres behind a walking user, which delays every arrival. Predicting forward
   * with the estimated velocity removes the lag, so the process noise only has
   * to cover *changes* in velocity and can be small.
   */
  private filtered: LonLat | null = null;
  private varianceM2 = 0;

  /** Smoothed velocity in m/s, east and north, used for the prediction step. */
  private velEast = 0;
  private velNorth = 0;

  /** Anchor for dwell: the position you have been hovering around. */
  private dwellAnchor: LonLat | null = null;
  private dwellSince = 0;

  private compassDeg: number | null = null;
  private compassAt = 0;

  private tracked = new Map<string, Tracked>();

  constructor(opts: EstimatorOptions) {
    this.subjects = opts.subjects;
    this.paths = opts.paths ?? null;
    this.lookaheadM = opts.lookaheadM ?? 35;
  }

  /** Track additional subjects that showed up after the walk began. */
  addSubjects(subjects: Subject[]): void {
    const known = new Set(this.subjects.map((s) => s.id));
    this.subjects = [
      ...this.subjects,
      ...subjects.filter((s) => !known.has(s.id)),
    ];
  }

  /**
   * Feed a compass reading. Kept separate from position because orientation
   * arrives far more often than fixes and from a different sensor.
   */
  pushHeading(deg: number | null, at = Date.now()): void {
    if (deg == null || Number.isNaN(deg)) return;
    this.compassDeg = ((deg % 360) + 360) % 360;
    this.compassAt = at;
  }

  /** Feed a position fix. Returns null while there is nothing usable yet. */
  push(fix: Fix): Estimate | null {
    if (fix.accuracyM > MAX_USABLE_ACCURACY_M)
      return this.last ? this.current(fix.at) : null;

    const prev = this.last;
    this.last = fix;

    if (!prev) {
      this.filtered = fix.coord;
      this.varianceM2 = fix.accuracyM * fix.accuracyM;
      this.dwellAnchor = fix.coord;
      this.dwellSince = fix.at;
      return this.current(fix.at);
    }

    const dtSec = Math.max((fix.at - prev.at) / 1000, 1e-3);
    const movedM = distanceM(prev.coord, fix.coord);

    // Prefer the device's own speed when it offers one — it is derived from
    // Doppler on most hardware and is much better than differencing positions.
    const rawSpeed = Math.min(
      fix.speedMps != null && fix.speedMps >= 0 ? fix.speedMps : movedM / dtSec,
      PLAUSIBLE_MAX_SPEED_MPS,
    );

    // Exponential smoothing with a time-constant, so the result does not depend
    // on how often fixes happen to arrive.
    const alpha = 1 - Math.exp(-dtSec / SPEED_TAU_SEC);
    this.speedMps += alpha * (rawSpeed - this.speedMps);
    if (this.speedMps < 0.05) this.speedMps = 0;

    const fastAlpha = 1 - Math.exp(-dtSec / FAST_SPEED_TAU_SEC);
    this.fastSpeedMps += fastAlpha * (rawSpeed - this.fastSpeedMps);
    if (this.fastSpeedMps < 0.05) this.fastSpeedMps = 0;

    this.filter(fix, dtSec);
    this.updateDwell(fix.at);
    return this.current(fix.at);
  }

  /** Predict-then-correct, applied independently to each axis in metre space. */
  private filter(fix: Fix, dtSec: number): void {
    const previous = this.filtered ?? fix.coord;
    const kx = mPerLon(previous[1]);

    this.updateVelocity(fix, previous, dtSec, kx);

    // Predict: carry the last estimate forward along the current velocity.
    const prior: LonLat = [
      previous[0] + (this.velEast * dtSec) / kx,
      previous[1] + (this.velNorth * dtSec) / M_PER_LAT,
    ];

    const slipM = VELOCITY_UNCERTAINTY_MPS * dtSec;
    this.varianceM2 += slipM * slipM;

    const measurementVar = Math.max(fix.accuracyM, 3) ** 2;
    const gain = this.varianceM2 / (this.varianceM2 + measurementVar);
    this.varianceM2 *= 1 - gain;

    const dEast = (fix.coord[0] - prior[0]) * kx;
    const dNorth = (fix.coord[1] - prior[1]) * M_PER_LAT;

    this.filtered = [
      prior[0] + (gain * dEast) / kx,
      prior[1] + (gain * dNorth) / M_PER_LAT,
    ];
  }

  /**
   * Track a velocity vector. The device's own speed and course are preferred
   * because they come from Doppler rather than from differencing two noisy
   * positions; differencing is only used as a fallback.
   */
  private updateVelocity(
    fix: Fix,
    previous: LonLat,
    dtSec: number,
    kx: number,
  ): void {
    let east: number;
    let north: number;

    if (fix.speedMps != null && fix.speedMps > 0.3 && fix.headingDeg != null) {
      const rad = (fix.headingDeg * Math.PI) / 180;
      east = fix.speedMps * Math.sin(rad);
      north = fix.speedMps * Math.cos(rad);
    } else if (fix.speedMps != null && fix.speedMps <= 0.3) {
      east = 0;
      north = 0;
    } else {
      east = ((fix.coord[0] - previous[0]) * kx) / dtSec;
      north = ((fix.coord[1] - previous[1]) * M_PER_LAT) / dtSec;
    }

    const alpha = 1 - Math.exp(-dtSec / VELOCITY_TAU_SEC);
    this.velEast += alpha * (east - this.velEast);
    this.velNorth += alpha * (north - this.velNorth);
  }

  /**
   * Dwell is measured as "how long have you stayed near one place", not "how
   * long has your speed been low". Under GPS noise the latter never triggers.
   */
  private updateDwell(at: number): void {
    const here = this.filtered;
    if (!here) return;
    if (!this.dwellAnchor) {
      this.dwellAnchor = here;
      this.dwellSince = at;
      return;
    }
    if (distanceM(this.dwellAnchor, here) > DWELL_RADIUS_M) {
      this.dwellAnchor = here;
      this.dwellSince = at;
    }
  }

  /** Best available facing direction. Compass wins, course is the fallback. */
  private facing(at: number): {
    deg: number | null;
    source: Estimate["facingSource"];
  } {
    const compassFresh = this.compassDeg != null && at - this.compassAt < 4000;
    if (compassFresh) return { deg: this.compassDeg, source: "compass" };

    // Course over ground is only meaningful while actually moving.
    const fix = this.last;
    if (fix?.headingDeg != null && this.speedMps > 0.6) {
      return { deg: fix.headingDeg, source: "course" };
    }
    return { deg: null, source: null };
  }

  private motion(): Estimate["motion"] {
    const responsive = Math.max(this.speedMps, this.fastSpeedMps);
    for (const band of MOTION_BANDS) {
      if (responsive < band.upTo) return band.motion;
    }
    return "brisk";
  }

  private offPath(coord: LonLat): number | null {
    if (!this.paths || !this.paths.segments.length) return null;
    let best = Infinity;
    const { nodes, segments } = this.paths;
    for (const seg of segments) {
      const d = pointToSegment(coord, nodes[seg.a], nodes[seg.b]).distanceM;
      if (d < best) best = d;
      if (best < 1) break;
    }
    return best;
  }

  /**
   * A flat lookahead is right for buildings and useless for anything larger: 35
   * metres of warning before a neighbourhood is not warning at all. Coarse
   * subjects therefore get a lookahead proportional to their own size, which is
   * what makes the range effectively grow as the director falls back outward.
   */
  private lookaheadFor(subject: Subject): number {
    return Math.max(this.lookaheadM, subject.radiusM * 0.4);
  }

  private proximity(
    coord: LonLat,
    facingDeg: number | null,
    at: number,
  ): SubjectProximity[] {
    const out: SubjectProximity[] = [];

    for (const subject of this.subjects) {
      const distance = distanceToSubject(coord, subject);
      if (distance > subject.radiusM + this.lookaheadFor(subject)) {
        this.tracked.delete(subject.id);
        continue;
      }

      const prior = this.tracked.get(subject.id);
      let trend: SubjectProximity["trend"] = "approaching";
      let rateMps = 0;

      if (prior) {
        const dtSec = Math.max((at - prior.lastAt) / 1000, 1e-3);
        const instantRate = (distance - prior.lastDistanceM) / dtSec;
        const alpha = 1 - Math.exp(-dtSec / TREND_TAU_SEC);
        rateMps = prior.rateMps + alpha * (instantRate - prior.rateMps);

        if (rateMps < -TREND_RATE_MPS) trend = "approaching";
        else if (rateMps > TREND_RATE_MPS) trend = "leaving";
        else trend = "holding";
      }

      this.tracked.set(subject.id, {
        lastDistanceM: distance,
        lastAt: at,
        rateMps,
        trend,
      });

      const bearing = bearingDeg(coord, subject.center);
      const relative =
        facingDeg == null ? null : angleDelta(facingDeg, bearing);

      out.push({
        subject,
        distanceM: distance,
        bearingDeg: bearing,
        relativeDeg: relative,
        direction: relative == null ? null : relativeDirection(relative),
        trend,
      });
    }

    return out.sort((a, b) => a.distanceM - b.distanceM);
  }

  private current(at: number): Estimate | null {
    const fix = this.last;
    if (!fix) return null;

    const { deg: facingDeg, source: facingSource } = this.facing(at);
    // Dwell collapses the instant motion is detected, using the same responsive
    // speed as the motion classifier, so the director cannot keep treating you
    // as stationary once you have set off.
    const moving = Math.max(this.speedMps, this.fastSpeedMps) > STILL_SPEED_MPS;
    const dwellSec = moving ? 0 : Math.max(0, (at - this.dwellSince) / 1000);

    // Everything downstream uses the filtered position, never the raw fix.
    const coord = this.filtered ?? fix.coord;

    return {
      at,
      coord,
      accuracyM: fix.accuracyM,
      speedMps: this.speedMps,
      facingDeg,
      facingSource,
      dwellSec,
      motion: this.motion(),
      offPathM: this.offPath(coord),
      nearby: this.proximity(coord, facingDeg, at),
    };
  }
}

/** Normalise a browser GeolocationPosition into our Fix. */
export function fixFromPosition(pos: GeolocationPosition): Fix {
  const c = pos.coords;
  return {
    at: pos.timestamp || Date.now(),
    coord: [c.longitude, c.latitude],
    accuracyM: c.accuracy ?? 999,
    speedMps: c.speed != null && !Number.isNaN(c.speed) ? c.speed : null,
    headingDeg:
      c.heading != null && !Number.isNaN(c.heading) && (c.speed ?? 0) > 0.5
        ? c.heading
        : null,
  };
}
