/**
 * The director decides what to say, when to say it, and when to shut up.
 *
 * Design stance: silence is the default and every beat has to earn its way out.
 * Most audio-guide apps fail by talking continuously, which turns a walk into a
 * podcast you cannot pause. The two mechanisms that matter here are the
 * *duration fit* gate — never start something you cannot finish before the
 * listener walks out of range — and the *talk budget* — a hard ceiling on the
 * fraction of wall-clock time spent speaking.
 *
 * Pure and synchronous. `decide` is a function of the estimate plus the
 * director's own history, so the simulator can step it deterministically.
 */

import { SCALES, scaleOf } from "./types";
import type {
  Beat,
  Depth,
  Estimate,
  Scale,
  Settings,
  SubjectProximity,
} from "./types";

export type DirectorState =
  | "cold" // no usable position yet
  | "silent" // nothing worth saying
  | "speaking"
  | "dwelling" // stopped, and we have already said the obvious things
  | "spent"; // out of material for everything in range

export interface SpeakDecision {
  kind: "speak";
  beat: Beat;
  /** Spatial preamble, e.g. "On your left." Spoken before the beat. */
  preamble: string | null;
  /** Why this beat won, for the debug overlay. */
  why: string;
}

export interface Decision {
  state: DirectorState;
  speak: SpeakDecision | null;
}

interface DensityProfile {
  /** Ceiling on the fraction of time spent speaking. */
  maxTalkFraction: number;
  /** Minimum silence between beats, in seconds. */
  minGapSec: number;
  /** Deepest beat to volunteer while the listener is moving. */
  maxMovingDepth: Depth;
}

const DENSITY: Record<Settings["density"], DensityProfile> = {
  // Sparse means fewer, meatier interventions — not shallower ones — so it
  // still allows depth 2 while walking. Restricting it to depth 1 produced
  // multi-minute silences once the short beats ran out.
  sparse: { maxTalkFraction: 0.35, minGapSec: 30, maxMovingDepth: 2 },
  steady: { maxTalkFraction: 0.6, minGapSec: 12, maxMovingDepth: 2 },
  // The default, and it should feel like company rather than a tour. A five
  // second floor is about as tight as it can go before consecutive beats start
  // sounding like one long monologue with odd pauses in it.
  //
  // Depth 3 while moving sounds reckless and is not, because the duration-fit
  // gate decides it separately: walking past a building leaves thirty to sixty
  // seconds, so a long beat is simply never eligible there. Where it does
  // become eligible is the case this setting exists for — a neighbourhood or
  // town you are inside for the whole walk, where the window is minutes and a
  // ceiling of 2 was capping every beat at forty seconds for no reason.
  chatty: { maxTalkFraction: 0.85, minGapSec: 5, maxMovingDepth: 3 },
};

/** Rolling window over which the talk budget is enforced. */
const BUDGET_WINDOW_SEC = 240;

/**
 * Hard floor between any two beats, including arrivals. Exists only to stop two
 * utterances running together; the real pacing comes from the density profile.
 */
const ARRIVAL_MIN_GAP_SEC = 5;

/**
 * Only commit to a beat if we expect this much slack beyond its length. Ending
 * a story just as you walk away is worse than not starting it.
 */
const DURATION_SAFETY = 1.15;

/**
 * Seconds of standing still before we start volunteering deeper material. These
 * only unlock the depth; whether a long beat actually plays is still decided by
 * the duration-fit gate, so they can be generous.
 */
const DWELL_ESCALATE_SEC = 12;
const DWELL_DEEP_SEC = 18;

export interface DirectorOptions {
  beats: Beat[];
  settings: Settings;
}

export class Director {
  private readonly bySubject = new Map<string, Beat[]>();
  private settings: Settings;

  private played = new Set<string>();
  private subjectsTouched = new Set<string>();
  private lastSubjectId: string | null = null;
  private transitionIndex = 0;

  /** Rolling log of speech, used for the talk budget. */
  private spoken: { at: number; sec: number }[] = [];
  private lastSpeechEndedAt = 0;
  private startedAt = 0;

  constructor(opts: DirectorOptions) {
    this.settings = opts.settings;
    for (const beat of opts.beats) {
      const list = this.bySubject.get(beat.subject) ?? [];
      list.push(beat);
      this.bySubject.set(beat.subject, list);
    }
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
  }

  /**
   * Add material to a walk already in progress.
   *
   * Used when the broader tiers arrive from the network after the walk started,
   * which is the normal case: a pack loads instantly from cache and the
   * neighbourhood it sits in takes a few seconds to look up. Beats already
   * present are ignored so a repeated augment cannot duplicate them.
   */
  addBeats(beats: Beat[]): void {
    const known = new Set<string>();
    for (const list of this.bySubject.values()) {
      for (const b of list) known.add(b.id);
    }
    for (const beat of beats) {
      if (known.has(beat.id)) continue;
      const list = this.bySubject.get(beat.subject) ?? [];
      list.push(beat);
      this.bySubject.set(beat.subject, list);
    }
  }

  /** Called when a beat actually finished playing, not when it was chosen. */
  noteSpoken(beat: Beat, endedAt: number, actualSec: number): void {
    this.played.add(beat.id);
    this.subjectsTouched.add(beat.subject);
    this.lastSubjectId = beat.subject;
    this.lastSpeechEndedAt = endedAt;
    this.spoken.push({ at: endedAt, sec: actualSec });
  }

  /** Called when the listener skipped or interrupted; still counts as played. */
  noteSkipped(beat: Beat, at: number): void {
    this.played.add(beat.id);
    this.lastSpeechEndedAt = at;
  }

  /**
   * Should the narrator finish its sentence and stop?
   *
   * True once the subject being described has fallen well behind — you asked
   * about this building, then walked away from it, and continuing is now just
   * noise. Because the narrator can stop cleanly on a sentence boundary, the
   * director is free to start long material during a pause and let this method
   * handle the case where the pause turns out to be shorter than expected.
   */
  shouldWindDown(est: Estimate | null, current: Beat): boolean {
    if (!est) return false;

    const p = est.nearby.find((n) => n.subject.id === current.subject);
    // Gone from the proximity list entirely: comfortably out of range.
    if (!p) return est.motion !== "still";

    // Broad material is gap filler. If something specific has just come into
    // range while we were talking about the neighbourhood, wrap up: you cannot
    // leave a district by walking, so nothing else would ever cut this short.
    if (scaleRank(scaleOf(p.subject)) > 0 && this.finerArrivalWaiting(est, p)) {
      return true;
    }

    if (est.motion === "still") return false;
    if (p.trend !== "leaving") return false;
    return p.distanceM > p.subject.radiusM * 1.4;
  }

  /** Is a smaller, unheard subject now in range and worth interrupting for? */
  private finerArrivalWaiting(
    est: Estimate,
    current: SubjectProximity,
  ): boolean {
    const rank = scaleRank(scaleOf(current.subject));
    return est.nearby.some((n) => {
      if (scaleRank(scaleOf(n.subject)) >= rank) return false;
      if (n.distanceM > n.subject.radiusM) return false;
      if (this.subjectsTouched.has(n.subject.id)) return false;
      return (this.bySubject.get(n.subject.id) ?? []).some(
        (b) => b.arrival && !this.played.has(b.id),
      );
    });
  }

  get history(): { played: number; subjects: number } {
    return { played: this.played.size, subjects: this.subjectsTouched.size };
  }

  hasPlayed(beatId: string): boolean {
    return this.played.has(beatId);
  }

  /**
   * The core call. `busy` is true while the narrator is speaking, in which case
   * we only report state and never pick a new beat.
   */
  decide(est: Estimate | null, busy: boolean, now: number): Decision {
    if (!this.startedAt) this.startedAt = now;
    if (!est) return { state: "cold", speak: null };
    if (busy) return { state: "speaking", speak: null };

    const profile = DENSITY[this.settings.density];
    const sinceSpeechSec = (now - this.lastSpeechEndedAt) / 1000;

    // Someone who has deliberately stopped wants more, not less, so the
    // enforced silence between beats shrinks while dwelling.
    const gapSec =
      est.motion === "still" && est.dwellSec > 10
        ? profile.minGapSec * 0.45
        : profile.minGapSec;

    // Naming a place is never treated as chatter, so arrivals get a floor rather
    // than the full gap and are exempt from the talk budget below. Without this,
    // a low density setting will walk you across Tercentenary Theatre without
    // ever mentioning Widener, which is the one thing the app must not do.
    if (sinceSpeechSec < ARRIVAL_MIN_GAP_SEC) {
      return { state: this.restState(est), speak: null };
    }

    const candidates = this.candidates(est, profile);
    if (!candidates.length) return { state: this.restState(est), speak: null };

    const best = candidates[0];
    const isFreshArrival =
      best.beat.arrival && !this.subjectsTouched.has(best.beat.subject);

    if (!isFreshArrival) {
      if (sinceSpeechSec < gapSec) {
        return { state: this.restState(est), speak: null };
      }
      if (this.overBudget(now, profile)) {
        return { state: this.restState(est), speak: null };
      }
    }
    return {
      state: "speaking",
      speak: {
        kind: "speak",
        beat: best.beat,
        preamble: this.preamble(best.beat, best.proximity, est),
        why: best.why,
      },
    };
  }

  private restState(est: Estimate): DirectorState {
    if (!est.nearby.length) return "silent";
    const anythingLeft = est.nearby.some((p) =>
      (this.bySubject.get(p.subject.id) ?? []).some(
        (b) => !this.played.has(b.id),
      ),
    );
    if (!anythingLeft) return "spent";
    return est.dwellSec > DWELL_ESCALATE_SEC ? "dwelling" : "silent";
  }

  /**
   * Fraction of the recent window spent speaking. Uses elapsed time since start
   * when that is shorter than the window, so the very first beat is not blocked.
   */
  private overBudget(now: number, profile: DensityProfile): boolean {
    const cutoff = now - BUDGET_WINDOW_SEC * 1000;
    this.spoken = this.spoken.filter((s) => s.at >= cutoff);
    const spokenSec = this.spoken.reduce((t, s) => t + s.sec, 0);
    const elapsedSec = Math.max(
      30,
      Math.min(BUDGET_WINDOW_SEC, (now - this.startedAt) / 1000),
    );
    return spokenSec / elapsedSec > profile.maxTalkFraction;
  }

  /**
   * How long we expect this subject to remain worth talking about.
   *
   * Standing still: a window that grows with dwell time, because someone who has
   * stood for half a minute is probably reading a plaque and will stay.
   * Moving: the time until you leave the subject's relevance radius, assuming
   * you keep going at the current speed.
   */
  private timeAvailableSec(p: SubjectProximity, est: Estimate): number {
    if (est.motion === "still") {
      // Someone who has already stood for half a minute is reading a plaque and
      // will probably stand for another minute, so the window grows faster than
      // real time. Capped so we never commit to something absurdly long.
      return Math.min(165, 25 + est.dwellSec * 2.2);
    }
    const speed = Math.max(est.speedMps, 0.5);
    const remainingM =
      p.trend === "approaching"
        ? p.distanceM + p.subject.radiusM
        : Math.max(0, p.subject.radiusM - p.distanceM);
    return Math.min(140, remainingM / speed);
  }

  /** Depth ceiling given motion and dwell. */
  private depthCeiling(est: Estimate, profile: DensityProfile): Depth {
    if (est.motion !== "still") return profile.maxMovingDepth;
    if (est.dwellSec >= DWELL_DEEP_SEC) return 3;
    if (est.dwellSec >= DWELL_ESCALATE_SEC) return 2;
    return 2;
  }

  /**
   * Candidates at the finest scale that still has anything to say.
   *
   * This is the mechanism that lets the app work anywhere. Scoring beats across
   * scales in one pool does not work: a neighbourhood you are standing in the
   * middle of scores a perfect proximity every time and would drown out the
   * building in front of you forever. So the scales are tried in order and the
   * first one to yield anything wins outright. Exhaust the buildings and the
   * quarter takes over; leave the quarter's material behind and the city does.
   */
  private candidates(
    est: Estimate,
    profile: DensityProfile,
  ): { beat: Beat; proximity: SubjectProximity; score: number; why: string }[] {
    for (const scale of SCALES) {
      const tier = this.candidatesAtScale(est, profile, scale);
      if (tier.length) return tier;
    }
    return [];
  }

  private candidatesAtScale(
    est: Estimate,
    profile: DensityProfile,
    scale: Scale,
  ): { beat: Beat; proximity: SubjectProximity; score: number; why: string }[] {
    const ceiling = this.depthCeiling(est, profile);
    const out: {
      beat: Beat;
      proximity: SubjectProximity;
      score: number;
      why: string;
    }[] = [];

    for (const p of est.nearby) {
      if (scaleOf(p.subject) !== scale) continue;
      // A subject is in play once you are inside its radius, or closing on it.
      const inRange = p.distanceM <= p.subject.radiusM;
      const closing =
        p.trend === "approaching" && p.distanceM <= p.subject.radiusM * 1.5;
      if (!inRange && !closing) continue;

      const available = this.timeAvailableSec(p, est);
      const fresh = this.subjectsTouched.has(p.subject.id) === false;

      for (const beat of this.bySubject.get(p.subject.id) ?? []) {
        if (this.played.has(beat.id)) continue;
        if (beat.depth > ceiling) continue;
        if (beat.requires.some((r) => !this.played.has(r))) continue;
        if (beat.excludes.some((x) => this.played.has(x))) continue;

        // The gate that matters: do not start what you cannot finish.
        if (beat.sec * DURATION_SAFETY > available) continue;

        // A subject's first beat should be one written as an arrival.
        if (fresh && !beat.arrival) continue;
        if (!fresh && beat.arrival) continue;

        const proximityScore =
          1 - Math.min(1, p.distanceM / (p.subject.radiusM || 1));
        const lensScore = this.lensScore(beat);
        const fitScore = Math.min(1, (beat.sec * DURATION_SAFETY) / available);
        const facingScore = this.facingScore(p);
        const depthScore = beat.depth / 3;

        // Weights are tuned so that "is this the right place" dominates, then
        // "is this something you care about", then the softer signals.
        //
        // The fit and depth terms matter more than they look: within one subject
        // every candidate has the same proximity, so these are what decide
        // whether a long stop gets the good material or a string of throwaways.
        const dwelling = est.motion === "still";

        // Naming something you are standing next to, once, beats saying a fourth
        // thing about the subject before it. Arrival beats are short, so this is
        // cheap against the talk budget, and the failure it prevents — walking
        // across Tercentenary Theatre without Widener ever being mentioned — is
        // the worst thing the app can do.
        const freshnessBonus = fresh ? 3.5 : 0;

        // `fitScore` rises as a beat fills more of the window available, so
        // weighting it positively is what prefers a developed story over a
        // one-liner. It used to be nearly cancelled while moving by a depth
        // penalty, which was double-counting caution: the duration-fit gate
        // above has already thrown out everything that will not finish in time,
        // so a long beat that reached this line is a long beat that fits. The
        // result of the old weighting was a walk of mostly depth-1 beats —
        // eighteen against ten of everything else over twenty minutes — which
        // reads as an app that only ever says headlines.
        const score =
          proximityScore * 3.0 +
          lensScore * 2.0 +
          facingScore * 1.2 +
          freshnessBonus +
          fitScore * (dwelling ? 1.8 : 1.1) +
          (dwelling ? depthScore * 1.8 : -depthScore * 0.15);

        out.push({
          beat,
          proximity: p,
          score,
          why:
            `${scale}, ` +
            `${Math.round(p.distanceM)}m, ` +
            `${Math.round(available)}s avail, ` +
            `lens ${lensScore.toFixed(2)}, ` +
            `${fresh ? "arrival" : "continuing"}`,
        });
      }
    }

    return out.sort((a, b) => b.score - a.score);
  }

  /** Mean lens weight over the beat's tags, defaulting to neutral. */
  private lensScore(beat: Beat): number {
    const lens = this.settings.lens;
    if (!beat.tags.length) return 0.5;
    let total = 0;
    let counted = 0;
    for (const tag of beat.tags) {
      const w = lens[tag];
      if (w != null) {
        total += w;
        counted++;
      }
    }
    if (!counted) return 0.4;
    return Math.max(0, Math.min(1, total / counted));
  }

  /**
   * Prefer talking about things you can see. Behind you scores low; unknown
   * facing scores neutral so a phone with no compass is not crippled.
   */
  private facingScore(p: SubjectProximity): number {
    if (p.relativeDeg == null) return 0.5;
    // Which way you face says nothing about a thing you are standing inside, and
    // the bearing to its centroid is noise once you are well within it.
    if (p.distanceM < p.subject.radiusM * 0.6) return 0.5;
    const a = Math.abs(p.relativeDeg);
    if (a <= 60) return 1;
    if (a <= 100) return 0.75;
    if (a <= 140) return 0.35;
    return 0.1;
  }

  /**
   * Spatial and narrative glue. Only added when it carries information: a
   * direction you could not have guessed, or a bridge from the last subject.
   */
  private preamble(
    beat: Beat,
    p: SubjectProximity,
    est: Estimate,
  ): string | null {
    const parts: string[] = [];

    const switching =
      this.lastSubjectId != null && this.lastSubjectId !== beat.subject;
    if (switching && beat.arrival && est.motion !== "still") {
      parts.push(this.nextTransition());
    }

    // Only give a direction if we actually know which way you face, the subject
    // is not underfoot, and it is not straight ahead where it is obvious.
    // Never for anything bigger than a building: "the neighbourhood is on your
    // left" is worse than saying nothing.
    if (
      beat.arrival &&
      scaleOf(p.subject) === "site" &&
      p.direction &&
      p.direction !== "straight ahead" &&
      p.distanceM > 6
    ) {
      const d = p.direction[0].toUpperCase() + p.direction.slice(1);
      parts.push(`${d}.`);
    }

    return parts.length ? parts.join(" ") : null;
  }

  /**
   * Rotated rather than picked at random. Walking a dense area hands you a new
   * subject every minute or two, and hearing the same bridge word each time is
   * the fastest way to make a narrator sound like a machine. Random selection
   * still repeats often enough to notice, so this cycles instead.
   */
  private nextTransition(): string {
    const phrase = TRANSITIONS[this.transitionIndex % TRANSITIONS.length];
    this.transitionIndex += 1;
    return phrase;
  }
}

/** 0 for the finest scale. Unknown scales sort as sites, matching the default. */
function scaleRank(scale: Scale): number {
  const i = SCALES.indexOf(scale);
  return i < 0 ? 0 : i;
}

const TRANSITIONS = [
  "Coming up.",
  "Next.",
  "Now this one.",
  "Something else.",
  "One more.",
];

/**
 * The default lens, tuned for someone who describes themselves as a curious
 * history, science and tech person who likes architecture and wants a story
 * with momentum. Values are 0..1 preferences, not probabilities.
 */
export const DEFAULT_LENS: Settings["lens"] = {
  architecture: 0.95,
  science: 0.95,
  tech: 0.95,
  history: 0.85,
  myth: 0.9,
  systems: 0.85,
  materials: 0.8,
  craft: 0.75,
  acoustics: 0.85,
  urbanism: 0.75,
  detail: 0.7,
  interactive: 0.9,
  people: 0.6,
  power: 0.55,
  money: 0.5,
  politics: 0.5,
  war: 0.5,
  race: 0.6,
  religion: 0.45,
  philosophy: 0.6,
  art: 0.55,
  literature: 0.45,
  present: 0.6,
  ritual: 0.5,
  subculture: 0.5,
  food: 0.35,
  humour: 0.7,
  trivia: 0.7,
  grim: 0.6,
  memory: 0.6,
  crime: 0.7,
  books: 0.7,
  failure: 0.7,
  epidemiology: 0.7,
  medicine: 0.7,
  modernism: 0.8,
  physics: 0.85,
  sound: 0.8,
  protest: 0.5,
  museum: 0.7,
};
