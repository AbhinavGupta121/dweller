/** Longitude, latitude in degrees. Matches GeoJSON order throughout. */
export type LonLat = [number, number];

export type Angle =
  | "history"
  | "architecture"
  | "science"
  | "people"
  | "mythbust"
  | "present"
  | "detail";

export type Depth = 1 | 2 | 3;

/**
 * How big a thing is. This is the axis the director falls back along: it always
 * prefers the finest scale that still has material, so you hear about the
 * building you are touching rather than the city you are in, and you hear about
 * the city rather than nothing at all.
 *
 * Ordered coarse-last so `SCALES.indexOf` gives a usable rank.
 */
export type Scale = "site" | "place" | "district" | "region";

export const SCALES: Scale[] = ["site", "place", "district", "region"];

/**
 * Radius to assume when a source does not give us one. A site is a thing you
 * can touch; a place is a square or a block; a district is a neighbourhood; a
 * region is the city and its metro area.
 */
export const SCALE_DEFAULT_RADIUS_M: Record<Scale, number> = {
  site: 60,
  place: 250,
  district: 1600,
  region: 14000,
};

/**
 * A subject's scale, defaulting to "site".
 *
 * Read through this everywhere rather than touching `subject.scale` directly.
 * Packs built before scale tiers existed have no such field, and a subject that
 * silently belongs to no tier is invisible to the director — which fails as
 * total silence rather than as an error.
 */
export function scaleOf(subject: { scale?: Scale }): Scale {
  return subject.scale ?? "site";
}

export interface Subject {
  id: string;
  name: string;
  center: LonLat;
  /** How close you must be for this subject to be worth talking about. */
  radiusM: number;
  /** How big this subject is, which decides the fallback order. */
  scale: Scale;
  footprint: LonLat[] | null;
  facadeLengthM: number | null;
  osm: string | null;
  tags: Record<string, string> | null;
  wikipedia: { title: string; url: string; pageid: number | null } | null;
  wikidata: string | null;
  photo: {
    url: string;
    width: number;
    height: number;
    original: string | null;
  } | null;
  claims: Record<string, unknown> | null;
}

/**
 * Where a beat's words came from. Hand-authored and fact-checked corpus beats
 * are trustworthy; beats written live by a model are not, and the UI says so
 * rather than quietly mixing the two.
 */
export type BeatOrigin = "corpus" | "gemini" | "wikipedia";

export interface Beat {
  id: string;
  subject: string;
  angle: Angle;
  depth: Depth;
  /** Defaults to "corpus" for pack beats that predate live generation. */
  origin?: BeatOrigin;
  text: string;
  /** Estimated spoken length in seconds, computed at build time. */
  sec: number;
  /** Suitable as the first thing said about this subject. */
  arrival: boolean;
  /** A physical thing to point the listener at, if any. */
  look: string | null;
  tags: string[];
  requires: string[];
  excludes: string[];
  sources: string[];
}

export interface PathGraph {
  ways: number;
  nodes: LonLat[];
  segments: {
    a: number;
    b: number;
    w: "walk" | "steps";
    name: string | null;
  }[];
}

export interface AreaMeta {
  id: string;
  name: string;
  center: LonLat;
  clip: number[];
}

export interface AreaPack {
  version: number;
  generatedAt: string;
  area: AreaMeta;
  subjects: Subject[];
  beats: Beat[];
  paths: PathGraph;
}

/**
 * The list of packs the build shipped, so the app can pick the nearest one
 * instead of hardcoding a single area. Written by the corpus builder.
 */
export interface AreaIndex {
  version: number;
  areas: (AreaMeta & { subjects: number; beats: number })[];
}

/**
 * How the content in play was obtained. Surfaced in the UI because a walk
 * narrated from a fact-checked pack and a walk narrated from a model's summary
 * of a Wikipedia article deserve different levels of trust.
 */
export type ContentOrigin = "pack" | "gemini" | "wikipedia" | "none";

/** Content assembled for wherever the walker actually is. */
export interface Content {
  origin: ContentOrigin;
  /** Human-readable description of where we are, e.g. "Cambridgeport". */
  label: string;
  subjects: Subject[];
  beats: Beat[];
  paths: PathGraph | null;
  /** Set when the layered resolver had to fall back, for honest messaging. */
  note: string | null;
}

/** A single position sample, normalised from the Geolocation API. */
export interface Fix {
  at: number;
  coord: LonLat;
  /** Horizontal accuracy in metres, as reported. */
  accuracyM: number;
  /** Device-reported speed in m/s, when available. */
  speedMps: number | null;
  /** Device-reported course over ground in degrees, when available. */
  headingDeg: number | null;
}

/**
 * What the app believes about you right now. Everything the director needs, and
 * nothing about the beats themselves.
 */
export interface Estimate {
  at: number;
  coord: LonLat;
  accuracyM: number;
  /** Smoothed ground speed in m/s. */
  speedMps: number;
  /** Best available facing direction in degrees, or null if unknown. */
  facingDeg: number | null;
  /** Where facing came from, since compass and course have different quality. */
  facingSource: "compass" | "course" | null;
  /** Seconds since you last moved meaningfully. */
  dwellSec: number;
  motion: "still" | "strolling" | "walking" | "brisk";
  /** Distance in metres to the nearest footpath, or null if the graph is empty. */
  offPathM: number | null;
  /** Subjects in range, nearest first. */
  nearby: SubjectProximity[];
}

export interface SubjectProximity {
  subject: Subject;
  /** Distance to the footprint, or to the centre for point subjects. */
  distanceM: number;
  /** Bearing from you to the subject, degrees from north. */
  bearingDeg: number;
  /** Bearing relative to your facing, in (-180, 180]. Null if facing unknown. */
  relativeDeg: number | null;
  /** Words for the relative bearing, e.g. "on your left". */
  direction: string | null;
  /** Are you closing on it, holding, or leaving it. */
  trend: "approaching" | "holding" | "leaving";
}

/** How much narration is wanted, set by the user. */
export type TalkDensity = "sparse" | "steady" | "chatty";

/** Where position comes from: the real sensor, or a replayed synthetic walk. */
export type Source = "gps" | "demo";

/** Weighted interests. Higher means the director prefers those beats. */
export type Lens = Record<string, number>;

export interface Settings {
  density: TalkDensity;
  lens: Lens;
  captions: boolean;
  voiceRate: number;
}
