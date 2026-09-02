/**
 * Small geodesy helpers. All coordinates are [lon, lat] in degrees; all
 * distances are metres; all bearings are degrees clockwise from true north.
 *
 * Everything here uses an equirectangular approximation scaled at the local
 * latitude. Over an area the size of a campus the error is far below GPS noise,
 * and it keeps the runtime loop cheap enough to run at 1 Hz on a phone.
 */

const R = 6371008.8; // mean Earth radius, metres
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Metres per degree of longitude at a given latitude. */
export function mPerLon(lat) {
  return 111320 * Math.cos(lat * D2R);
}

export const M_PER_LAT = 110574;

/** Planar distance in metres. Accurate to well under a metre at campus scale. */
export function distanceM(a, b) {
  const lat = (a[1] + b[1]) / 2;
  const dx = (b[0] - a[0]) * mPerLon(lat);
  const dy = (b[1] - a[1]) * M_PER_LAT;
  return Math.hypot(dx, dy);
}

/** Initial bearing from a to b, degrees clockwise from north, 0..360. */
export function bearingDeg(a, b) {
  const lat = (a[1] + b[1]) / 2;
  const dx = (b[0] - a[0]) * mPerLon(lat);
  const dy = (b[1] - a[1]) * M_PER_LAT;
  const deg = Math.atan2(dx, dy) * R2D;
  return (deg + 360) % 360;
}

/** Signed smallest angle from `from` to `to`, in (-180, 180]. */
export function angleDelta(from, to) {
  let d = ((to - from + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}

/** Offset a point by metres east and north. */
export function offsetM(p, eastM, northM) {
  return [p[0] + eastM / mPerLon(p[1]), p[1] + northM / M_PER_LAT];
}

/** Area-weighted centroid of a closed ring of [lon, lat]. */
export function centroid(ring) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j];
    const [x1, y1] = ring[i];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-14) {
    // degenerate ring — fall back to the mean of the vertices
    const n = ring.length;
    return [
      ring.reduce((s, p) => s + p[0], 0) / n,
      ring.reduce((s, p) => s + p[1], 0) / n,
    ];
  }
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}

/**
 * Distance in metres from point p to segment ab, plus the closest point and how
 * far along the segment it fell (0..1). Used for map-matching.
 */
export function pointToSegment(p, a, b) {
  const lat = p[1];
  const kx = mPerLon(lat);
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

/** Ray-casting point-in-polygon for a ring of [lon, lat]. */
export function pointInRing(p, ring) {
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

/** Shortest distance in metres from p to the boundary of a ring. */
export function distanceToRing(p, ring) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const d = pointToSegment(p, ring[j], ring[i]).distanceM;
    if (d < best) best = d;
  }
  return best;
}

/**
 * Distance to a subject's footprint: zero if you are standing inside it,
 * otherwise the distance to its nearest wall. Falls back to centre distance
 * when there is no footprint.
 */
export function distanceToSubject(p, subject) {
  if (!subject.footprint) return distanceM(p, subject.center);
  if (pointInRing(p, subject.footprint)) return 0;
  return distanceToRing(p, subject.footprint);
}

/** Turn a relative bearing into the words a guide would actually use. */
export function relativeDirection(delta) {
  const a = Math.abs(delta);
  if (a <= 25) return "straight ahead";
  if (a <= 70) return delta > 0 ? "ahead on your right" : "ahead on your left";
  if (a <= 115) return delta > 0 ? "on your right" : "on your left";
  if (a <= 155) return delta > 0 ? "behind you on the right" : "behind you on the left";
  return "behind you";
}

/** Round a coordinate for use as a graph node key (~0.1 m). */
export function nodeKey(p) {
  return `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
}
