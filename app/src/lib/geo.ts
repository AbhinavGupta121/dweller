/**
 * Geodesy for campus-scale distances.
 *
 * Equirectangular projection scaled at the local latitude. The error over a few
 * hundred metres is centimetres, which is three orders of magnitude below phone
 * GPS noise, and it keeps the 1 Hz runtime loop cheap.
 *
 * This mirrors tools/geo.mjs. The duplication is deliberate: the build tools run
 * in Node with no bundler and the app runs in the browser, and neither should
 * depend on the other's module resolution.
 */

import type { LonLat, Subject } from "./types";

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const M_PER_LAT = 110574;

export function mPerLon(lat: number): number {
  return 111320 * Math.cos(lat * D2R);
}

export function distanceM(a: LonLat, b: LonLat): number {
  const lat = (a[1] + b[1]) / 2;
  const dx = (b[0] - a[0]) * mPerLon(lat);
  const dy = (b[1] - a[1]) * M_PER_LAT;
  return Math.hypot(dx, dy);
}

/** Initial bearing from a to b, degrees clockwise from north, 0..360. */
export function bearingDeg(a: LonLat, b: LonLat): number {
  const lat = (a[1] + b[1]) / 2;
  const dx = (b[0] - a[0]) * mPerLon(lat);
  const dy = (b[1] - a[1]) * M_PER_LAT;
  return (Math.atan2(dx, dy) * R2D + 360) % 360;
}

/** Signed smallest angle from `from` to `to`, in (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  const d = ((to - from + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}

export function offsetM(p: LonLat, eastM: number, northM: number): LonLat {
  return [p[0] + eastM / mPerLon(p[1]), p[1] + northM / M_PER_LAT];
}

/** Interpolate between two points. Used by the walk simulator. */
export function lerpCoord(a: LonLat, b: LonLat, t: number): LonLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export interface SegmentHit {
  distanceM: number;
  point: LonLat;
  t: number;
}

export function pointToSegment(p: LonLat, a: LonLat, b: LonLat): SegmentHit {
  const kx = mPerLon(p[1]);
  const ky = M_PER_LAT;

  const px = p[0] * kx;
  const py = p[1] * ky;
  const ax = a[0] * kx;
  const ay = a[1] * ky;
  const bx = b[0] * kx;
  const by = b[1] * ky;

  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;

  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const qx = ax + t * dx;
  const qy = ay + t * dy;

  return {
    distanceM: Math.hypot(px - qx, py - qy),
    point: [qx / kx, qy / ky],
    t,
  };
}

export function pointInRing(p: LonLat, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const hit =
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function distanceToRing(p: LonLat, ring: LonLat[]): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const d = pointToSegment(p, ring[j], ring[i]).distanceM;
    if (d < best) best = d;
  }
  return best;
}

/**
 * Distance to a subject: zero inside its footprint, otherwise to the nearest
 * wall. Falls back to centre distance for subjects that are just a point.
 */
export function distanceToSubject(p: LonLat, subject: Subject): number {
  if (!subject.footprint) return distanceM(p, subject.center);
  if (pointInRing(p, subject.footprint)) return 0;
  return distanceToRing(p, subject.footprint);
}

/**
 * The words a guide would actually use for a relative bearing. Deliberately
 * coarse: GPS heading is noisy and "slightly to your left" is a lie.
 */
export function relativeDirection(delta: number): string {
  const a = Math.abs(delta);
  if (a <= 25) return "straight ahead";
  if (a <= 70) return delta > 0 ? "ahead on your right" : "ahead on your left";
  if (a <= 115) return delta > 0 ? "on your right" : "on your left";
  if (a <= 155)
    return delta > 0 ? "behind you on the right" : "behind you on the left";
  return "behind you";
}

/** Compass points, for the map sheet and debug readouts. */
export function compassPoint(deg: number): string {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round((deg % 360) / 45) % 8];
}
