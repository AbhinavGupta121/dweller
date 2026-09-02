/**
 * The basemap, and the geometry helpers the map needs.
 *
 * OpenStreetMap data served by OpenFreeMap: vector tiles, no account, no key,
 * no request ceiling to design around. Getting here took three attempts worth
 * recording, because each failure rules out an obvious idea:
 *
 *   - OSM's own raster tiles are rendered light and cheerful. Re-grading them
 *     dark on the GPU does not work, because the grading is uniform: pushing the
 *     paper dark enough drags the roads down with it, and the icon layer stays
 *     stubbornly colourful. A night walk looked like sepia OSM behind smoked
 *     glass, with parking symbols glowing through.
 *   - CARTO's dark basemap is the usual answer and now watermarks every tile
 *     with API KEY REQUIRED.
 *
 * Vector tiles are better than a fixed raster anyway. Labels stay sharp at any
 * zoom, and the map can rotate to your heading without the type turning upside
 * down — which is the whole reason the camera follows the compass.
 */
import type { Feature, FeatureCollection, Polygon } from "geojson";

import type { LonLat } from "./types";

/**
 * OpenFreeMap's own styles. `dark` happens to sit on rgb(12,12,12), within a
 * hair of this app's ink, so the map needs no correction to belong here.
 */
const STYLES: Record<"night" | "day", string> = {
  night: "https://tiles.openfreemap.org/styles/dark",
  day: "https://tiles.openfreemap.org/styles/positron",
};

export function styleUrl(theme: "night" | "day"): string {
  return STYLES[theme];
}

/** Required by all three parties in the chain that puts a map on the screen. */
export const ATTRIBUTION = [
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>',
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a>',
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>',
].join(" · ");

/* ------------------------------------------------------------ geometry --- */

const EARTH_R = 6371008.8;

/**
 * A circle as a polygon, because MapLibre measures `circle-radius` in screen
 * pixels and everything worth drawing here — GPS accuracy, the range at which a
 * subject is in play — is measured in metres and must stay pinned to the ground
 * as you zoom.
 */
export function circlePolygon(
  center: LonLat,
  radiusM: number,
  steps = 64,
): Feature<Polygon> {
  const [lon, lat] = center;
  const latR = (lat * Math.PI) / 180;
  const dLat = (radiusM / EARTH_R) * (180 / Math.PI);
  const dLon = dLat / Math.max(Math.cos(latR), 1e-6);

  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    ring.push([lon + dLon * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

export function empty(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}
