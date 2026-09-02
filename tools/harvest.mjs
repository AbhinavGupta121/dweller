#!/usr/bin/env node
/**
 * Harvest raw source data for an area into tools/cache/<area>/.
 *
 * Everything here is free and unauthenticated: OSM Overpass for geometry and
 * the footpath network, Wikipedia geosearch for articles, Wikidata for
 * structured facts. Results are cached so reruns cost nothing.
 */

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = join(__dirname, "cache");

// Wikimedia asks for a descriptive UA. Anonymous CORS mode (`origin=*`) carries
// much tighter rate limits, so it is deliberately absent from these calls.
const UA =
  "wander/0.1 (personal self-guided walking tour project; contact: local dev)";

const AREAS = {
  "harvard-yard": {
    name: "Harvard Yard",
    // south, west, north, east — Yard plus a ~400m ring
    bbox: [42.3695, -71.1265, 42.3805, -71.1095],
    center: [42.3744, -71.1169],
  },
};

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function cached(area, name, fn) {
  const dir = join(CACHE, area);
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  if (await exists(path)) {
    process.stdout.write(`  cache hit  ${name}\n`);
    return JSON.parse(await readFile(path, "utf8"));
  }
  process.stdout.write(`  fetching   ${name} …`);
  const data = await fn();
  await writeFile(path, JSON.stringify(data, null, 2));
  process.stdout.write(` done\n`);
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, opts = {}, attempt = 1) {
  const res = await fetch(url, {
    ...opts,
    headers: { "User-Agent": UA, ...(opts.headers ?? {}) },
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt > 5) throw new Error(`${res.status} after ${attempt} tries: ${url}`);
    await sleep(3000 * attempt * attempt);
    return getJSON(url, opts, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} :: ${url}`);
  return res.json();
}

/* ---------------------------------------------------------------- OSM --- */

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/**
 * Overpass answers 200 with an HTML error body when it is overloaded, so a
 * status check is not enough — we have to try to parse and rotate mirrors.
 */
async function overpass(query) {
  let lastErr;
  for (let round = 0; round < 3; round++) {
    for (const url of OVERPASS_MIRRORS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "data=" + encodeURIComponent(query),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
        const data = JSON.parse(text);
        if (!Array.isArray(data.elements)) throw new Error("no elements array");
        return data;
      } catch (err) {
        lastErr = err;
        process.stdout.write("x");
        await sleep(1500);
      }
    }
    await sleep(5000 * (round + 1));
  }
  throw new Error(`all overpass mirrors failed: ${lastErr?.message}`);
}

function osmBuildingsQuery([s, w, n, e]) {
  return `[out:json][timeout:90];
(
  way["building"](${s},${w},${n},${e});
  relation["building"](${s},${w},${n},${e});
  node["historic"](${s},${w},${n},${e});
  way["historic"](${s},${w},${n},${e});
  node["tourism"~"artwork|attraction|museum|memorial"](${s},${w},${n},${e});
  node["memorial"](${s},${w},${n},${e});
  way["leisure"="park"](${s},${w},${n},${e});
  node["barrier"="gate"](${s},${w},${n},${e});
  way["barrier"="gate"](${s},${w},${n},${e});
  way["amenity"="grave_yard"](${s},${w},${n},${e});
  way["landuse"="cemetery"](${s},${w},${n},${e});
);
out body geom;`;
}

function osmPathsQuery([s, w, n, e]) {
  return `[out:json][timeout:90];
(
  way["highway"~"^(footway|path|pedestrian|steps|living_street|residential|service|cycleway|track|unclassified|tertiary|secondary)$"](${s},${w},${n},${e});
);
out body geom;`;
}

/* --------------------------------------------------------- Wikipedia --- */

const WP = "https://en.wikipedia.org/w/api.php";

async function wikipediaGeosearch([lat, lon], radiusM = 1000, limit = 200) {
  const url =
    `${WP}?action=query&format=json&formatversion=2` +
    `&generator=geosearch&ggscoord=${lat}%7C${lon}&ggsradius=${radiusM}&ggslimit=${limit}` +
    `&prop=coordinates%7Cdescription%7Cpageimages%7Cpageprops&piprop=thumbnail&pithumbsize=1200`;
  return getJSON(url);
}

/**
 * Intro paragraphs, in bulk. TextExtracts only returns more than one extract
 * per request when `exintro` is set, hence the split from full-article fetches.
 */
async function wikipediaIntros(titles) {
  const out = {};
  const CHUNK = 20;
  for (let i = 0; i < titles.length; i += CHUNK) {
    const chunk = titles.slice(i, i + CHUNK);
    const url =
      `${WP}?action=query&format=json&formatversion=2` +
      `&prop=extracts%7Cinfo&explaintext=1&exintro=1&exlimit=max&inprop=url` +
      `&titles=${chunk.map(encodeURIComponent).join("%7C")}`;
    const data = await getJSON(url);
    for (const page of data?.query?.pages ?? []) {
      if (page.missing) continue;
      out[page.title] = {
        title: page.title,
        pageid: page.pageid,
        url: page.fullurl,
        extract: page.extract ?? "",
      };
    }
    process.stdout.write(".");
    await sleep(1200);
  }
  return out;
}

/** Full article plaintext, one title per request (an API constraint). */
async function wikipediaArticles(titles) {
  const out = {};
  for (const title of titles) {
    const url =
      `${WP}?action=query&format=json&formatversion=2` +
      `&prop=extracts%7Cinfo&explaintext=1&exsectionformat=plain&inprop=url` +
      `&redirects=1&titles=${encodeURIComponent(title)}`;
    const data = await getJSON(url);
    const page = data?.query?.pages?.[0];
    if (!page || page.missing) {
      process.stdout.write("?");
      continue;
    }
    // Key by the requested title so the spec keeps working across redirects.
    out[title] = {
      title: page.title,
      requested: title,
      pageid: page.pageid,
      url: page.fullurl,
      extract: page.extract ?? "",
    };
    process.stdout.write(".");
    await sleep(1200);
  }
  return out;
}

async function wikipediaImages(titles) {
  const out = {};
  const CHUNK = 8;
  for (let i = 0; i < titles.length; i += CHUNK) {
    const chunk = titles.slice(i, i + CHUNK);
    const url =
      `${WP}?action=query&format=json&formatversion=2` +
      `&prop=pageimages%7Cpageprops&piprop=original%7Cthumbnail&pithumbsize=1600` +
      `&redirects=1&titles=${chunk.map(encodeURIComponent).join("%7C")}`;
    const data = await getJSON(url);
    for (const page of data?.query?.pages ?? []) {
      if (page.missing) continue;
      out[page.title] = {
        title: page.title,
        thumbnail: page.thumbnail ?? null,
        original: page.original ?? null,
        wikibase_item: page.pageprops?.wikibase_item ?? null,
      };
    }
    process.stdout.write(".");
    await sleep(1200);
  }
  return out;
}

/* ---------------------------------------------------------- Wikidata --- */

async function wikidataEntities(qids) {
  const out = {};
  for (let i = 0; i < qids.length; i += 40) {
    const chunk = qids.slice(i, i + 40);
    const url =
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json` +
      `&props=claims%7Clabels%7Cdescriptions&languages=en` +
      `&ids=${chunk.join("%7C")}`;
    const data = await getJSON(url);
    Object.assign(out, data.entities ?? {});
    process.stdout.write(".");
    await sleep(1200);
  }
  return out;
}

/* -------------------------------------------------------------- main --- */

async function main() {
  const areaId = process.argv[2] ?? "harvard-yard";
  const area = AREAS[areaId];
  if (!area) throw new Error(`unknown area: ${areaId}`);

  console.log(`\nharvesting ${area.name}  bbox=${area.bbox.join(",")}\n`);

  const buildings = await cached(areaId, "osm-features.json", () =>
    overpass(osmBuildingsQuery(area.bbox)),
  );
  console.log(`    ${buildings.elements.length} OSM features`);

  const paths = await cached(areaId, "osm-paths.json", () =>
    overpass(osmPathsQuery(area.bbox)),
  );
  console.log(`    ${paths.elements.length} OSM ways`);

  const geo = await cached(areaId, "wikipedia-geosearch.json", () =>
    wikipediaGeosearch(area.center, 1000, 200),
  );
  const pages = geo?.query?.pages ?? [];
  console.log(`    ${pages.length} Wikipedia articles nearby`);

  const titles = pages.map((p) => p.title);
  await cached(areaId, "wikipedia-intros.json", () => wikipediaIntros(titles));

  const { SUBJECTS } = await import("./subjects.spec.mjs");
  const subjectTitles = [
    ...new Set(SUBJECTS.map((s) => s.wikipedia).filter(Boolean)),
  ];

  // Full text for the subjects we actually narrate — these are the sources the
  // beats get written against and fact-checked with.
  await cached(areaId, "wikipedia-articles.json", () =>
    wikipediaArticles(subjectTitles),
  );

  // Geosearch only returns thumbnails for pages whose coordinates land in the
  // radius, which misses several buildings. Ask for images by title instead.
  await cached(areaId, "wikipedia-images.json", () =>
    wikipediaImages(subjectTitles),
  );

  const qids = [
    ...new Set(
      pages.map((p) => p?.pageprops?.wikibase_item).filter(Boolean),
    ),
  ];
  console.log(`    ${qids.length} Wikidata entities`);
  await cached(areaId, "wikidata.json", () => wikidataEntities(qids));

  console.log(`\ndone → tools/cache/${areaId}/\n`);
}

main().catch((err) => {
  console.error("\nharvest failed:", err.message);
  process.exit(1);
});
