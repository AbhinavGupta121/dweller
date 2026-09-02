/**
 * Offline cache for Dweller.
 *
 * Three strategies, chosen by what the resource is:
 *  - The area pack and fonts are cache-first. They are large, immutable per
 *    build, and needed in places with no signal, which is the whole point.
 *  - Map tiles, glyphs and sprites are cache-first in their own store with a
 *    size cap. Walking the same street twice should not refetch it, but tiles
 *    accumulate without bound if nothing evicts them.
 *  - Everything else is network-first with a cache fallback, so a deploy is
 *    picked up on the next load rather than being pinned forever.
 *
 * Hand-written rather than generated: the app has one page and one data file, so
 * a build plugin would be more machinery than the problem deserves.
 */

const VERSION = "dweller-v3";

/** Kept out of VERSION so a deploy does not throw away a walk's worth of map. */
const TILE_CACHE = "dweller-tiles-v1";
const TILE_HOSTS = ["tiles.openfreemap.org"];

/**
 * Roughly a few walks' worth. Vector tiles are small, so this is tens of
 * megabytes rather than hundreds, and eviction is oldest-first because the Cache
 * API keeps insertion order.
 */
const TILE_LIMIT = 1500;
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./areas/harvard-yard.json",
  "./fonts/instrument-serif-400.woff2",
  "./fonts/inter-variable.woff2",
];

const isImmutable = (url) =>
  url.pathname.includes("/areas/") ||
  url.pathname.includes("/fonts/") ||
  url.pathname.includes("/assets/");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // Individually, so one missing file cannot fail the whole install.
      .then((cache) =>
        Promise.all(
          PRECACHE.map((path) =>
            cache.add(new Request(path, { cache: "reload" })).catch(() => {}),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== VERSION && k !== TILE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Pull an area's rendered narration into the cache ahead of time.
 *
 * The fetch handler already caches audio on first play, but "on first play" is
 * exactly when the listener is outdoors on a weak connection. Warming happens
 * while the phone is still on wifi, sequentially so it does not starve the
 * foreground, and failures are ignored: a missing clip falls back to the
 * device's own voice rather than breaking the walk.
 */
async function warmAudio(areaId) {
  const base = new URL(`./areas/${areaId}/audio/`, self.location.href);
  let index;
  try {
    const res = await fetch(new URL("index.json", base));
    if (!res.ok) return { cached: 0, total: 0 };
    index = await res.json();
  } catch {
    return { cached: 0, total: 0 };
  }

  const cache = await caches.open(VERSION);
  const entries = Object.values(index);
  let cached = 0;

  for (const entry of entries) {
    const request = new Request(new URL(entry.file, base));
    try {
      if (await cache.match(request)) {
        cached++;
        continue;
      }
      const res = await fetch(request);
      if (res.ok) {
        await cache.put(request, res);
        cached++;
      }
    } catch {
      // Offline or missing: leave it, the app degrades on its own.
    }
  }
  return { cached, total: entries.length };
}

self.addEventListener("message", (event) => {
  const data = event.data ?? {};
  if (data.type !== "warm-audio" || !data.areaId) return;
  event.waitUntil(
    warmAudio(data.areaId).then((result) => {
      event.source?.postMessage({ type: "warm-audio-done", ...result });
    }),
  );
});

/** Cache-first, then trim the oldest entries back under the cap. */
async function tile(request) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  // Opaque cross-origin responses cannot be inspected, so only cache real ones.
  if (response.ok) {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    if (keys.length > TILE_LIMIT) {
      for (const stale of keys.slice(0, keys.length - TILE_LIMIT)) {
        await cache.delete(stale);
      }
    }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (TILE_HOSTS.includes(url.hostname)) {
    // Falls through to the network error if both miss, which MapLibre already
    // handles by leaving that tile blank.
    event.respondWith(tile(request).catch(() => fetch(request)));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (isImmutable(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() =>
        caches
          .match(request)
          .then((hit) => hit ?? caches.match("./index.html")),
      ),
  );
});
