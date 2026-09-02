#!/usr/bin/env node
/**
 * Turn harvested raw data into resolved subjects and a footpath graph.
 *
 * Output: tools/build/<area>/subjects.json and paths.json. These are inputs to
 * the beat writer and, eventually, to the packed area the app downloads.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { AREA, SUBJECTS } from "./subjects.spec.mjs";
import { centroid, distanceM, pointToSegment, nodeKey } from "./geo.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = join(__dirname, "cache", AREA.id);
const BUILD = join(__dirname, "build", AREA.id);

const readJSON = async (p) => JSON.parse(await readFile(p, "utf8"));

/** OSM `out geom` gives ways a `geometry` array of {lat, lon}. */
function ringFromOSM(el) {
  if (el.type === "way" && Array.isArray(el.geometry)) {
    const ring = el.geometry.filter(Boolean).map((g) => [g.lon, g.lat]);
    return ring.length >= 4 ? ring : null;
  }
  if (el.type === "relation" && Array.isArray(el.members)) {
    // Multipolygon: take the longest outer way as the representative footprint.
    // Good enough for distance-to-wall; we are not doing exact containment.
    const outers = el.members
      .filter((m) => m.role === "outer" && Array.isArray(m.geometry))
      .map((m) => m.geometry.filter(Boolean).map((g) => [g.lon, g.lat]))
      .filter((r) => r.length >= 4)
      .sort((a, b) => b.length - a.length);
    return outers[0] ?? null;
  }
  return null;
}

/** Longest edge bearing of a footprint — the axis a facade runs along. */
function longestEdge(ring) {
  let best = { len: 0 };
  for (let i = 1; i < ring.length; i++) {
    const len = distanceM(ring[i - 1], ring[i]);
    if (len > best.len) best = { len, a: ring[i - 1], b: ring[i] };
  }
  return best;
}

/**
 * Prefer the by-title image query, which covers buildings whose article
 * coordinates fall outside the geosearch radius, and fall back to geosearch.
 */
function pickPhoto(imagePage, geoPage) {
  const t = imagePage?.thumbnail ?? geoPage?.thumbnail;
  if (!t?.source) return null;
  return {
    url: t.source,
    width: t.width,
    height: t.height,
    original: imagePage?.original?.source ?? null,
  };
}

async function resolveSubjects() {
  const osm = await readJSON(join(CACHE, "osm-features.json"));
  const geosearch = await readJSON(join(CACHE, "wikipedia-geosearch.json"));
  const intros = await readJSON(join(CACHE, "wikipedia-intros.json"));
  const articles = await readJSON(join(CACHE, "wikipedia-articles.json"));
  const images = await readJSON(join(CACHE, "wikipedia-images.json"));
  const wikidata = await readJSON(join(CACHE, "wikidata.json"));

  const byOSM = new Map(osm.elements.map((e) => [`${e.type}/${e.id}`, e]));
  const wpPages = new Map(
    (geosearch?.query?.pages ?? []).map((p) => [p.title, p]),
  );

  const resolved = [];
  const problems = [];

  for (const spec of SUBJECTS) {
    const el = spec.osm ? byOSM.get(spec.osm) : null;
    if (spec.osm && !el) problems.push(`${spec.id}: OSM ${spec.osm} not in cache`);

    const footprint = el ? ringFromOSM(el) : null;
    let center = spec.at ?? null;
    if (!center && footprint) center = centroid(footprint);
    if (!center && el?.lat != null) center = [el.lon, el.lat];
    if (!center) {
      problems.push(`${spec.id}: no coordinates — SKIPPED`);
      continue;
    }

    const tags = el?.tags ?? {};
    const wpPage = wpPages.get(spec.wikipedia);
    const wpImage = images[spec.wikipedia];
    const wpExtract = articles[spec.wikipedia] ?? intros[spec.wikipedia];
    const qid =
      tags.wikidata ??
      wpImage?.wikibase_item ??
      wpPage?.pageprops?.wikibase_item ??
      null;
    const wd = qid ? wikidata[qid] : null;

    const facade = footprint ? longestEdge(footprint) : null;

    resolved.push({
      id: spec.id,
      name: spec.name,
      center: [round(center[0]), round(center[1])],
      radiusM: spec.radiusM,
      footprint: footprint ? footprint.map((p) => [round(p[0]), round(p[1])]) : null,
      facadeLengthM: facade ? Math.round(facade.len) : null,
      osm: spec.osm ?? null,
      // Tags worth trusting as sources; OSM architect data on the Yard is good.
      tags: pick(tags, [
        "architect",
        "start_date",
        "building",
        "building:levels",
        "building:material",
        "roof:material",
        "heritage",
        "ref:nrhp",
        "wikidata",
        "wikipedia",
      ]),
      wikipedia: wpExtract
        ? { title: wpExtract.title, url: wpExtract.url, pageid: wpExtract.pageid }
        : spec.wikipedia
          ? { title: spec.wikipedia, url: wpUrl(spec.wikipedia), pageid: null }
          : null,
      wikidata: qid,
      photo: pickPhoto(wpImage, wpPage),
      // Structured claims we can fact-check numbers against later.
      claims: wd ? extractClaims(wd) : null,
    });
  }

  return { resolved, problems };
}

const round = (n) => Math.round(n * 1e6) / 1e6;

const wpUrl = (t) =>
  `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`;

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] != null) out[k] = obj[k];
  return Object.keys(out).length ? out : null;
}

/** Pull the handful of Wikidata properties that produce checkable facts. */
const CLAIM_PROPS = {
  P571: "inception",
  P84: "architect",
  P149: "architecturalStyle",
  P2048: "heightM",
  P1082: "population",
  P1436: "collectionSize",
  P2044: "elevationM",
  P625: "coordinate",
};

function extractClaims(entity) {
  const out = {};
  for (const [prop, label] of Object.entries(CLAIM_PROPS)) {
    const claims = entity.claims?.[prop];
    if (!claims) continue;
    const values = claims
      .map((c) => c.mainsnak?.datavalue?.value)
      .filter(Boolean)
      .map((v) => {
        if (typeof v === "string") return v;
        if (v.time) return v.time;
        if (v.amount) return v.amount;
        if (v.id) return v.id;
        if (v.latitude != null) return [v.longitude, v.latitude];
        return v;
      });
    if (values.length) out[label] = values;
  }
  return Object.keys(out).length ? out : null;
}

/* ------------------------------------------------------- path graph --- */

const FOOT_HIGHWAYS = new Set([
  "footway",
  "path",
  "pedestrian",
  "steps",
  "living_street",
  "service",
  "residential",
  "unclassified",
  "track",
  "cycleway",
]);

function inClip([s, w, n, e], p) {
  return p[1] >= s && p[1] <= n && p[0] >= w && p[0] <= e;
}

async function buildPathGraph() {
  const raw = await readJSON(join(CACHE, "osm-paths.json"));
  const clip = AREA.clip;

  const segments = [];
  const nodes = new Map();

  const nodeId = (p) => {
    const k = nodeKey(p);
    let id = nodes.get(k);
    if (id === undefined) {
      id = nodes.size;
      nodes.set(k, id);
    }
    return id;
  };

  let kept = 0;
  for (const way of raw.elements) {
    const hw = way.tags?.highway;
    if (!FOOT_HIGHWAYS.has(hw)) continue;
    if (way.tags?.foot === "no" || way.tags?.access === "private") continue;
    const geom = (way.geometry ?? []).filter(Boolean).map((g) => [g.lon, g.lat]);
    if (geom.length < 2) continue;
    if (!geom.some((p) => inClip(clip, p))) continue;
    kept++;

    for (let i = 1; i < geom.length; i++) {
      const a = geom[i - 1];
      const b = geom[i];
      if (!inClip(clip, a) && !inClip(clip, b)) continue;
      segments.push({
        a: nodeId(a),
        b: nodeId(b),
        w: hw === "steps" ? "steps" : "walk",
        name: way.tags?.name ?? null,
      });
    }
  }

  const coords = new Array(nodes.size);
  for (const [k, id] of nodes) {
    const [lon, lat] = k.split(",").map(Number);
    coords[id] = [round(lon), round(lat)];
  }

  return { ways: kept, nodes: coords, segments };
}

/** Sanity check: is every subject reachable from the path network? */
function checkReachability(subjects, graph) {
  const warnings = [];
  for (const s of subjects) {
    let best = Infinity;
    for (const seg of graph.segments) {
      const d = pointToSegment(s.center, graph.nodes[seg.a], graph.nodes[seg.b])
        .distanceM;
      if (d < best) best = d;
    }
    if (best > 60) {
      warnings.push(`${s.id}: nearest footpath is ${Math.round(best)} m away`);
    }
  }
  return warnings;
}

/* ------------------------------------------------------------- main --- */

async function main() {
  await mkdir(BUILD, { recursive: true });

  const { resolved, problems } = await resolveSubjects();
  const graph = await buildPathGraph();
  const warnings = checkReachability(resolved, graph);

  await writeFile(
    join(BUILD, "subjects.json"),
    JSON.stringify({ area: AREA, subjects: resolved }, null, 2),
  );
  await writeFile(join(BUILD, "paths.json"), JSON.stringify(graph));

  console.log(`\nresolved ${resolved.length}/${SUBJECTS.length} subjects`);
  const withFootprint = resolved.filter((s) => s.footprint).length;
  const withPhoto = resolved.filter((s) => s.photo).length;
  const withExtract = resolved.filter((s) => s.wikipedia?.pageid).length;
  console.log(`  ${withFootprint} with footprint geometry`);
  console.log(`  ${withExtract} with a Wikipedia article`);
  console.log(`  ${withPhoto} with a photo`);
  console.log(
    `\npath graph: ${graph.ways} ways → ${graph.nodes.length} nodes, ${graph.segments.length} segments`,
  );

  if (problems.length) {
    console.log("\nproblems:");
    for (const p of problems) console.log(`  ! ${p}`);
  }
  if (warnings.length) {
    console.log("\nreachability warnings:");
    for (const w of warnings) console.log(`  ? ${w}`);
  }
  console.log(`\n→ tools/build/${AREA.id}/\n`);
}

main().catch((err) => {
  console.error("\nresolve failed:", err);
  process.exit(1);
});
