/**
 * Finding out what is around you, anywhere in the world, at runtime.
 *
 * Everything here talks to free, keyless, CORS-enabled APIs so the app stays a
 * static site with no backend. Two sources, doing different jobs:
 *
 * - Wikipedia geosearch answers "what specific things are near this point".
 * - Nominatim reverse geocoding answers "what is this place called", which is
 *   what lets the app say something about a neighbourhood that has no landmarks
 *   in it at all. That case — an ordinary residential street — is the one the
 *   original Harvard-only build handled by going silent.
 *
 * Every call is best-effort. A failure here degrades the walk; it never breaks
 * it, so the callers treat empty results and thrown errors the same way.
 */

import { SCALES } from "./types";
import type { LonLat, Scale } from "./types";

/** Wikipedia caps geosearch at ten kilometres, so this is the widest we can ask. */
const WIKI_MAX_RADIUS_M = 10000;

const REQUEST_TIMEOUT_MS = 8000;

export interface NearbyArticle {
  pageid: number;
  title: string;
  coord: LonLat;
  distanceM: number;
}

export interface PlaceName {
  /** Smallest named container we found: a neighbourhood or suburb. */
  neighbourhood: string | null;
  /** The town or city. */
  city: string | null;
  /**
   * The county. Carried only to disambiguate article titles, which it does a
   * lot of work for: the United States has dozens of Franklin Townships and
   * Wikipedia titles them by county.
   */
  county: string | null;
  /** State or province, used only to disambiguate for the model. */
  region: string | null;
  country: string | null;
  /** The street you are standing on, when the geocoder knows it. */
  road: string | null;
}

/**
 * Nominatim rejects the default user agent of most HTTP libraries with a 403,
 * so identifying ourselves is required by its usage policy anyway. Browsers
 * treat `User-Agent` as a forbidden header and drop it silently, sending their
 * own — which Nominatim accepts. So this line only takes effect under Node,
 * which is what lets the verification script exercise this exact code path.
 */
const USER_AGENT = "dweller/1.0 (personal self-guided walking app)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Every call in this module is best-effort and degrades to less content rather
 * than to an error, which is right for a walk in progress and terrible for
 * debugging: a rate limit and a genuinely empty landscape look identical from
 * the outside. So failures are swallowed, but never silently.
 */
function warn(what: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[discover] ${what}: ${message}`);
}

/**
 * Minimum gap between requests to one host.
 *
 * Resolving a location fires a burst — an outward geosearch, a classification,
 * a batch of extracts, then title searches for whatever missed — and firing
 * them without spacing earns a 429 from Wikipedia, which is both rude and
 * self-defeating. Nominatim's usage policy asks for one request per second and
 * gets it, since we only ever make one.
 */
const MIN_GAP_MS: Record<string, number> = {
  "en.wikipedia.org": 250,
  "www.wikidata.org": 250,
  "nominatim.openstreetmap.org": 1000,
};

const lastRequestAt = new Map<string, number>();
const hostQueue = new Map<string, Promise<unknown>>();

/**
 * Serialise requests per host behind a promise chain, spacing them out.
 *
 * Deliberately per-host so a slow geocode does not hold up Wikipedia, and
 * deliberately a queue rather than a semaphore because the ordering matters:
 * the nearest subjects are looked up first so that a rate limit or a quota
 * running out costs the least useful material.
 */
function queued<T>(host: string, run: () => Promise<T>): Promise<T> {
  const gap = MIN_GAP_MS[host] ?? 120;
  const prior = hostQueue.get(host) ?? Promise.resolve();

  const next = prior.then(async () => {
    const since = Date.now() - (lastRequestAt.get(host) ?? 0);
    if (since < gap) await sleep(gap - since);
    lastRequestAt.set(host, Date.now());
    return run();
  });

  // Keep the chain alive on failure, or one error would wedge the host forever.
  hostQueue.set(
    host,
    next.catch(() => {}),
  );
  return next;
}

/**
 * Anonymous requests to these APIs are rate limited, so a 429 is an expected
 * outcome rather than an exceptional one and is retried with a growing backoff.
 * Other failures are immediate: a 404 will still be a 404 in a second's time.
 */
async function getJson<T>(url: string, attempts = 3): Promise<T> {
  const host = new URL(url).host;
  let lastError: unknown = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await queued(host, () =>
        fetch(url, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        }),
      );
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`${res.status} from ${host}`);
        await sleep(700 * 2 ** i);
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} from ${host}`);
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof Error && /^\d{3} from /.test(err.message)) throw err;
      lastError = err;
      await sleep(700 * 2 ** i);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`failed: ${url}`);
}

/**
 * Wikipedia articles with coordinates near a point, nearest first.
 *
 * `origin=*` is required: it is what makes the API send CORS headers for an
 * anonymous cross-origin request. The build-time harvester deliberately omits
 * it, because from a server it buys nothing and costs a shared rate limit.
 */
export async function geosearch(
  coord: LonLat,
  radiusM: number,
  limit = 40,
): Promise<NearbyArticle[]> {
  const [lon, lat] = coord;
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&list=geosearch" +
    `&gscoord=${lat}|${lon}` +
    `&gsradius=${Math.min(Math.round(radiusM), WIKI_MAX_RADIUS_M)}` +
    `&gslimit=${limit}&format=json&origin=*`;

  interface Response {
    query?: {
      geosearch?: {
        pageid: number;
        title: string;
        lat: number;
        lon: number;
        dist: number;
      }[];
    };
  }

  const data = await getJson<Response>(url);
  return (data.query?.geosearch ?? []).map((hit) => ({
    pageid: hit.pageid,
    title: hit.title,
    coord: [hit.lon, hit.lat] as LonLat,
    distanceM: hit.dist,
  }));
}

/**
 * Search outward until something turns up.
 *
 * This is the "grow the radius" behaviour in its literal form. A dense city
 * centre resolves on the first band and never pays for the wider queries; a
 * quiet street walks out until it finds the nearest thing worth a mention.
 */
export async function geosearchOutward(
  coord: LonLat,
  bandsM: number[] = [400, 1200, 4000, WIKI_MAX_RADIUS_M],
): Promise<{ articles: NearbyArticle[]; radiusM: number }> {
  let lastError: unknown = null;
  for (const radiusM of bandsM) {
    try {
      const articles = await geosearch(coord, radiusM);
      if (articles.length) return { articles, radiusM };
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) throw lastError;
  return { articles: [], radiusM: bandsM[bandsM.length - 1] };
}

/** Plain-text lead sections, keyed by page id. Batched to keep it to one call. */
export async function intros(pageids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!pageids.length) return out;

  // The API caps uncached multi-page extract queries at twenty titles.
  for (let i = 0; i < pageids.length; i += 20) {
    const batch = pageids.slice(i, i + 20);
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&prop=extracts" +
      "&exintro=1&explaintext=1&redirects=1" +
      `&pageids=${batch.join("|")}&format=json&origin=*`;

    interface Response {
      query?: { pages?: Record<string, { pageid: number; extract?: string }> };
    }

    try {
      const data = await getJson<Response>(url);
      for (const page of Object.values(data.query?.pages ?? {})) {
        const text = (page.extract ?? "").trim();
        if (text) out.set(page.pageid, text);
      }
    } catch (err) {
      // A dropped batch costs us those subjects and nothing else.
      warn(`extracts for ${batch.length} pages`, err);
    }
  }
  return out;
}

/**
 * What this spot is called, from OpenStreetMap's geocoder.
 *
 * Zoom 14 asks for neighbourhood-level detail. Nominatim's usage policy allows
 * light use like this — one lookup per walk, and only when the walker is
 * outside every shipped pack.
 */
export async function reverseGeocode(coord: LonLat): Promise<PlaceName | null> {
  const [lon, lat] = coord;
  const url =
    "https://nominatim.openstreetmap.org/reverse" +
    `?lat=${lat}&lon=${lon}&format=jsonv2&zoom=14&addressdetails=1`;

  interface Response {
    address?: Record<string, string>;
  }

  try {
    const data = await getJson<Response>(url);
    const a = data.address ?? {};
    const pick = (...keys: string[]) => {
      for (const k of keys) if (a[k]) return a[k];
      return null;
    };
    return {
      neighbourhood: pick(
        "neighbourhood",
        "suburb",
        "quarter",
        "city_district",
      ),
      city: pick("city", "town", "village", "municipality"),
      county: pick("county", "state_district"),
      region: pick("state", "province", "region"),
      country: pick("country"),
      road: pick("road", "pedestrian", "footway"),
    };
  } catch (err) {
    warn("reverse geocode", err);
    return null;
  }
}

/**
 * Plain-text lead sections keyed by the title asked for.
 *
 * Titles are what the coarse tiers have to work with, since their names come
 * from a geocoder rather than from geosearch. Redirects and normalisation are
 * followed and then mapped back, so a caller that asked about "Nevada, United
 * States" finds its answer under that key even though the article is "Nevada".
 */
export async function introsByTitle(
  titles: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!titles.length) return out;

  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&prop=extracts" +
      "&exintro=1&explaintext=1&redirects=1" +
      `&titles=${batch.map(encodeURIComponent).join("|")}&format=json&origin=*`;

    interface Response {
      query?: {
        pages?: Record<string, { title: string; extract?: string }>;
        normalized?: { from: string; to: string }[];
        redirects?: { from: string; to: string }[];
      };
    }

    try {
      const data = await getJson<Response>(url);

      const alias = new Map<string, string>();
      for (const hop of [
        ...(data.query?.normalized ?? []),
        ...(data.query?.redirects ?? []),
      ]) {
        alias.set(hop.from, hop.to);
      }
      const resolve = (t: string) => {
        let cur = t;
        for (let hops = 0; hops < 4 && alias.has(cur); hops++) {
          cur = alias.get(cur)!;
        }
        return cur;
      };

      const byFinalTitle = new Map<string, string>();
      for (const page of Object.values(data.query?.pages ?? {})) {
        const text = (page.extract ?? "").trim();
        if (text) byFinalTitle.set(page.title, text);
      }
      for (const asked of batch) {
        const text = byFinalTitle.get(resolve(asked));
        if (text) out.set(asked, text);
      }
    } catch (err) {
      warn(`extracts for ${batch.length} titles`, err);
    }
  }
  return out;
}

/**
 * A disambiguation page's lead is a list of things it could mean, which is
 * unspeakable and factually about nothing. Cheap to spot and worth spotting.
 */
export function isDisambiguation(extract: string): boolean {
  return /\bmay (also )?refer to\b|\bcan refer to\b/i.test(
    extract.slice(0, 200),
  );
}

/* ------------------------------------------------------- classification --- */

/**
 * Wikidata "instance of" values that mean a thing is bigger than a building.
 *
 * Without this every geosearch hit is treated as something you can stand in
 * front of, which is wrong in the case that matters most: the article about the
 * neighbourhood you are walking through is itself a geosearch hit, and filed as
 * a sixty-metre site it can never come into range. Anything unlisted falls
 * through to "site", so a gap in this table costs precision, never silence.
 */
const SCALE_BY_INSTANCE: Record<string, Scale> = {
  // Settlements and administrative areas.
  Q515: "region", // city
  Q3957: "region", // town
  Q532: "region", // village
  Q486972: "region", // human settlement
  Q1093829: "region", // city in the United States
  Q15284: "region", // municipality
  Q3957225: "region", // borough
  Q1549591: "region", // big city
  Q1637706: "region", // city with millions of inhabitants
  Q62049: "region", // county seat
  Q852446: "region", // administrative territorial entity of the US
  Q56061: "region", // administrative territorial entity

  // Parts of a settlement.
  Q123705: "district", // neighborhood
  Q3257686: "district", // locality
  Q2983893: "district", // quarter
  Q5122903: "district", // city district
  Q253019: "district", // Ortsteil
  Q19953632: "district", // former administrative territorial entity

  // Things you walk through rather than up to.
  Q22698: "place", // park
  Q174782: "place", // public square
  Q1107656: "place", // garden
  Q39614: "place", // cemetery
  Q79007: "place", // street
  Q83620: "place", // thoroughfare
  Q34442: "place", // road
  Q3918: "place", // university
  Q189004: "place", // college
  Q1244442: "place", // school campus
  Q2135334: "place", // historic district
  Q15243209: "place", // historic district in the United States
  Q473972: "place", // protected area
};

/**
 * Classify articles by scale, in one batched Wikidata call.
 *
 * Uses `wbgetentities` with `sites=enwiki`, which resolves English titles to
 * entities directly and saves a hop through `pageprops`. Sitelinks are
 * requested so the response can be mapped back to the titles we asked about.
 */
export async function classifyByTitle(
  titles: string[],
): Promise<Map<string, Scale>> {
  const out = new Map<string, Scale>();
  if (!titles.length) return out;

  // wbgetentities takes fifty titles per request.
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const url =
      "https://www.wikidata.org/w/api.php?action=wbgetentities" +
      "&sites=enwiki&props=claims|sitelinks&sitefilter=enwiki" +
      `&titles=${batch.map(encodeURIComponent).join("|")}` +
      "&format=json&origin=*";

    interface Entity {
      claims?: {
        P31?: { mainsnak?: { datavalue?: { value?: { id?: string } } } }[];
      };
      sitelinks?: { enwiki?: { title?: string } };
    }
    interface Response {
      entities?: Record<string, Entity>;
    }

    try {
      const data = await getJson<Response>(url);
      for (const entity of Object.values(data.entities ?? {})) {
        const title = entity.sitelinks?.enwiki?.title;
        if (!title) continue;
        // An article can be an instance of several things. Take the coarsest,
        // because a campus that is also a building should be walked through.
        let best: Scale | null = null;
        for (const claim of entity.claims?.P31 ?? []) {
          const id = claim.mainsnak?.datavalue?.value?.id;
          const scale = id ? SCALE_BY_INSTANCE[id] : undefined;
          if (!scale) continue;
          if (!best || SCALES.indexOf(scale) > SCALES.indexOf(best)) {
            best = scale;
          }
        }
        if (best) out.set(title, best);
      }
    } catch (err) {
      // Unclassified articles stay sites, which is the old behaviour.
      warn("wikidata classification", err);
    }
  }
  return out;
}

/** "Cambridgeport, Cambridge" — the most specific useful label we have. */
export function placeLabel(place: PlaceName | null): string {
  if (!place) return "Here";
  const parts = [place.neighbourhood, place.city].filter(Boolean);
  if (!parts.length) return place.region ?? place.country ?? "Here";
  return parts.join(", ");
}
