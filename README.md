# Dweller

A self-guided walk that talks about wherever you are, and stays quiet when there
is nothing worth saying.

It watches where you are, how fast you are moving and which way you are facing,
and narrates the place you are actually standing in. Stop walking and it goes
deeper. Walk on and it lets the thought go.

It works anywhere. Where somebody has authored an area pack it is at its best —
hand-written, fact-checked, offline, and free. Everywhere else it works out what
is around you at walk time and writes the narration on the spot. Harvard Yard is
the one authored area so far: 20 places, 78 beats, about 44 minutes of narration
in a 400 kB file.

## Scale, and why it never runs out

The thing that makes it work on an ordinary residential street is that subjects
have a **scale**, and the director falls back along it:

| scale | what it is | radius |
| --- | --- | --- |
| `site` | a building, a gate, a statue | 30–110 m |
| `place` | a square, a park, a campus, a historic district | ~250 m |
| `district` | a neighbourhood | ~1.6 km |
| `region` | a town or city | ~14 km |

The director always prefers the finest scale that still has material. Stand in
Harvard Yard and you hear about brickwork. Walk your own street, where there is
no building anybody wrote about, and it talks about how the neighbourhood was
laid out and who built it. Exhaust that and it reaches for the city. There is no
"out of area" state: only how specific it can be about where you are.

## Where the words come from

Four rungs, best first. Each one is a fallback for the one above.

1. **An authored pack.** Hand-written and checked against sources. Offline, has
   footpaths and photographs. Only exists where somebody built one.
2. **Gemini, grounded in a Wikipedia article.** Given the same persona brief as
   the corpus, so it sounds like the same narrator. Needs a key and a signal.
3. **Gemini, from the place's name alone.** Most of the planet has no article
   worth reading. Here the model works from what it knows about the region, and
   the persona brief inverts: instead of forbidding outside knowledge it forbids
   unhedged specifics. General truths about how a place was settled and built
   are welcome; invented dates and street namings are not.
4. **Wikipedia prose, sliced up, no model at all.** The floor. Works worldwide
   with no key, and reads like an encyclopedia, because it is one.

Which rung is talking is shown on screen next to the subject — `checked`,
`written live`, `from wikipedia` — because a fact-checked beat and a model's
unverified paraphrase should not look identical.

Nearby subjects come from Wikipedia geosearch, widening outward until something
turns up. Their scale comes from Wikidata's "instance of", which is what tells
the app that Cambridgeport is a neighbourhood needing a 1.6 km radius rather
than a sixty-metre building. The neighbourhood and city names come from
OpenStreetMap's geocoder. All three are free, keyless and need no backend.

### The Gemini key

Optional, and only used for rungs 2 and 3. Paste it into the start screen under
*Gemini key*; it lives in that browser's local storage and is sent nowhere but
Google. A static site cannot keep a secret, so this is an accepted trade for a
personal app with no backend — anyone sharing it more widely should proxy the
call instead. Without a key the app still works everywhere, just more drily.

Generated beats are cached per subject for thirty days, so a second walk down
the same street costs nothing and works offline.

---

## Taking it out

**1. Start the tunnel** (on the dev machine, ~40 seconds)

```bash
cd /home/skydio/wander
npm run tunnel
```

It builds, serves, and prints an HTTPS URL like
`https://something-random.trycloudflare.com`. Leave the terminal open — the URL
dies with it. HTTPS is not optional: geolocation and the compass are both
refused on plain HTTP.

**2. Open that URL on the phone.** Then Chrome menu -> *Add to Home screen*, and
launch it from the icon. Installed, it loses the browser chrome and can hold the
screen awake.

**3. Allow location.** Say yes to motion sensors too if asked. Without the
compass you lose "on your left" and nothing else.

**4. Optionally paste a Gemini key** on the start screen. Without one you still
get narration everywhere, read from Wikipedia rather than written.

**5. Press Begin and put the phone in your pocket.** Inside an authored area it
starts talking immediately and needs no signal from then on. Anywhere else it
spends a few seconds working out where you are, then goes offline too.

### Before you leave the house

Tap **Play a simulated walk instead** on the start screen and listen for thirty
seconds. It exercises the whole pipeline with a synthetic GPS track, so if the
voice works there, it will work outdoors.

### If something is wrong

| Symptom | Cause | Fix |
| --- | --- | --- |
| Stuck on "Waiting for a GPS fix" | no fix yet, or indoors | go outside; the first fix is the slowest |
| Stuck on "Looking up where you are" | no signal outside an authored area | wait, or walk into an area with a pack |
| "Nothing found near this point" | genuinely nothing in any source | add a Gemini key, which can work from the place name alone |
| Silent the whole time | no speech voices installed | Android Settings -> Accessibility -> Text-to-speech, install a voice |
| Talks too much or too little | density profile | Settings -> *How much talking* -> sparse / chatty |
| Talks about the city, not the street | no fine-grained material in range | expected: it fell back a tier. Keep walking |
| Never says "on your left" | no compass permission | reload and accept motion sensors |
| Wrong building | GPS drift near tall walls | Settings -> *Position and director internals* shows the live fix |
| Screen sleeps | Wake Lock refused | keep it installed to the home screen, not a browser tab |

Settings -> *Position and director internals* shows position, accuracy, speed,
dwell time, which content source won, how many subjects are in range and at what
scale, and what the director is doing. That panel answers most questions faster
than guessing.

---

## How it works

Three stages, and the split is the whole design:

```
build time (laptop, once)          run time (phone, every walk)
─────────────────────────          ────────────────────────────
harvest  OSM + Wikipedia
resolve  footprints, radii, paths
write    beats, hand + Gemini      estimate  where you are, how fast
check    claims against sources    direct    which beat, or silence
pack     one JSON file       ───▶  narrate   speak it, pan it
```

Inside an authored area, everything expensive happened before you left: the
phone reads a static file and makes no network calls, which is why it is free,
private and works underground. Outside one, the first few seconds of the walk
are spent working out where you are and what can be said about it, after which
it is offline again — the resolve happens once, not continuously.

The unit of content is a **beat**: one speakable thought, 6 to 95 seconds, tagged
with an angle (history, architecture, science, mythbust…) and a depth. Depth 1 is
said while you are still walking. Depth 3 only comes out if you actually stop.
The director picks beats by proximity, what you are facing, your declared
interests, how long you seem likely to stay, and how much it has already talked.

Read `ARCHITECTURE.md` for the full design, `DESIGN.md` for the visual and
interaction language, `BRAINSTORM.md` for why this exists and what it is not.

### The map

MapLibre GL, with OpenStreetMap data served as vector tiles by
[OpenFreeMap](https://openfreemap.org): no account, no key, no request ceiling
to design around. The map is the screen's ground; the narration is a sheet
resting on it.

The camera follows you and rotates to your heading, which is what makes it feel
like a map you are inside rather than a diagram of somewhere else. Vector tiles
rather than raster matter for exactly that: labels stay upright and sharp when
the map turns. Any deliberate pan or pinch hands control back to you and a
Recentre button appears — a map that fights your thumb is the most irritating
thing a map can do.

Two obvious alternatives are dead ends, recorded so nobody spends the afternoon
rediscovering them:

- **OSM's own raster tiles, re-graded dark on the GPU.** Does not work. The
  grading is uniform, so darkening the paper enough drags the roads down with
  it, and the icon layer stays stubbornly colourful. It looked like sepia OSM
  behind smoked glass with parking symbols glowing through.
- **CARTO dark matter**, the usual answer for a keyless dark basemap, now
  watermarks every tile with API KEY REQUIRED.

MapLibre is around 950 kB, far heavier than the rest of the app put together, so
it is lazy-loaded when a walk starts rather than shipped to the start screen. The
wait is free: the first GPS fix takes several seconds and the chunk lands well
inside it. Tiles are cached by the service worker in their own capped store, so
a second walk down the same street draws instantly and works with no signal.

Two pieces of MapLibre plumbing are load-bearing, both about the same web
worker. MapLibre parses tiles off the main thread, and the worker is also what
issues the tile requests, so when it fails you get a black map, no tile
requests, and no error worth reading.

- **`optimizeDeps.exclude: ["maplibre-gl"]`** in `vite.config.ts`. In dev the
  dependency optimiser rewrites the worker entry but never emits it, and warns
  about a missing `maplibre-gl-worker.mjs`.
- **`setWorkerUrl(...)`** in `MapView.tsx`, fed by a
  `?worker&url` import. Left alone, MapLibre locates the worker with
  `new URL("./maplibre-gl-worker.mjs", import.meta.url)`, which no bundler can
  see through, so the built app requests `/assets/maplibre-gl-worker.mjs` and
  gets a 404. Dev works and the build does not, which is exactly the shape of
  bug that ships. Plain `?url` is not enough either: it copies the file
  verbatim, and the worker imports MapLibre's shared chunk, leaving a bare
  relative import that resolves to nothing.

If the map is ever blank, check for a 404 on a worker asset before anything
else.

---

## Layout

```
app/                  the PWA — Vite, React, TypeScript, MapLibre
  src/lib/            estimator, director, narrator, geo: all the logic
  src/lib/discover.ts runtime lookups: geosearch, Wikidata, geocoding
  src/lib/content.ts  the fallback chain, and the beat cache
  src/lib/mapStyle.ts basemap choice, attribution, metre-accurate circles
  src/components/     map, bottom sheet, walk screen, start screen, depth ring
  public/areas/       packed area files, loaded at runtime
  scripts/            verify-walk.ts and verify-live.ts, the two test gates
tools/                build-time content pipeline
  harvest.mjs         OSM Overpass, Wikipedia, Wikidata → cache/
  resolve.mjs         footprints, relevance radii, footpath graph
  corpus/             the beats themselves, plus schema and validator
  gemini/             draft, fact-check, grade and voice beats with Gemini
```

## Commands

```bash
npm run tunnel        # build, serve, and print a phone-ready HTTPS URL
npm run dev           # dev server on the LAN
npm run check         # typecheck and walk the simulator
npm run verify:live   # resolve four real locations and check each one speaks

npm run content       # harvest → resolve → pack, from scratch
npm run pack          # recompile the corpus after editing beats

npm run write     harvard-yard          # draft new beats with Gemini
npm run factcheck harvard-yard          # verify every claim against sources
npm run grade     harvard-yard          # score for voice, promote the keepers
npm run tts       harvard-yard --limit 5  # render narration to audio (10/day free)
```

There are two verification gates, and they cover different halves.

`npm run verify` is the one worth knowing. It replays a synthetic walk through
the real estimator and director and prints the transcript you would have heard,
with timings, silence gaps and depth distribution — then fails if any beat played
twice, started while another was speaking, went deep while you were moving, or
outlived the building it was about.

`npm run verify:live` covers what the simulator cannot: it resolves four real
coordinates — a dense campus, an ordinary back street, a suburban cul-de-sac and
an empty rural road — and fails if any of them would leave the walker in
silence. It hits third-party APIs, so it needs a network, is not hermetic, and
is deliberately kept out of `npm run check`. Add `--wikipedia-only` to test the
no-key floor.

Model calls dominate its runtime at roughly half a minute each, so all four
locations at full budget takes many minutes and burns a day's quota. Narrow it
while iterating:

```bash
npm run verify:live -- --only=cambridgeport --calls=6
```

`--calls` caps model calls per location. Low budgets are spent on the finest
subjects first, which are out of range when standing still, so a run needs
roughly six before the tiers you actually hear are model-written rather than
Wikipedia.

---

## Adding content

Beats are hand-written in `tools/corpus/*.mjs` and compiled by
`tools/corpus/index.mjs`, which refuses to build if any beat has an unknown
subject, a broken cross-reference, or a length outside its depth budget. Every
subject needs at least one depth-1 arrival beat, because that is the first thing
said when you walk up.

```bash
$EDITOR tools/corpus/old-yard.mjs
npm run pack        # validates and repacks
npm run verify      # hear it in context before trusting it
```

### With Gemini

The pipeline in `tools/gemini/` drafts beats from harvested sources, checks each
claim against the source text in a separate pass, and grades the prose against
the narrator's voice. It writes to `tools/generated/` and never into
`tools/corpus/`: generated beats have to clear both gates and then be read by a
human before they count. It proposes, it does not commit.

```bash
echo "GEMINI_API_KEY=your-key" > .env      # free key: aistudio.google.com/apikey
npm run write harvard-yard -- --per 5
npm run factcheck harvard-yard
npm run grade harvard-yard -- --promote 4
```

### What the free tier actually allows

Text generation is metered at **20 requests per day, per model**. One resolve
spends up to eight, so a few walks in a day will exhaust a model. Two things
make that liveable:

- **Model rotation.** `GEMINI_MODELS` in `live.ts` is tried in order and the
  quota is counted per model, so exhausting the best one moves down the list
  rather than stopping. When every model is spent, the note reads *daily Gemini
  quota spent on every model* and narration drops to Wikipedia prose.
- **Caching.** Generated beats are stored in local storage per subject, so
  rewalking somewhere costs nothing and works offline.

Retired models are deliberately absent from the list: `gemini-2.5-flash` now
404s for new keys, and discovering that costs a round trip on every resolve.
Check what a key can see with:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" \
  | grep -o '"models/[^"]*"'
```

### Real narration instead of the phone's voice

`npm run tts harvard-yard` renders beats with a directed Gemini voice into
`app/public/areas/harvard-yard/audio/`, compressed to Opus at about 3 kB per
second. The app picks them up automatically and plays them through Web Audio,
which also lets it pan the voice toward the building being described. Any beat
without a file falls back to on-device speech.

**The free tier caps TTS at 10 requests per day, per model.** That is the binding
constraint on this whole idea: 78 beats is eight days of quota, and separate
models have separate allowances but none of them change the order of magnitude.
So on the free tier the practical options are on-device speech for everything, or
paid TTS. A *partly* rendered area is the worst of both, because the voice
changes mid-walk — measured durations are stored per beat precisely so the
director can pace either voice correctly, but it cannot make them sound alike.

Four beats were rendered while testing and are parked in
`tools/generated/harvard-yard/audio-partial/`. To hear them:

```bash
mkdir -p app/public/areas/harvard-yard/audio
cp tools/generated/harvard-yard/audio-partial/* app/public/areas/harvard-yard/audio/
```

One thing the renders showed: a directed voice runs well over the word-count
estimate — one 32-second beat came back at 54. The pipeline records the measured
length and the app prefers it over the estimate, but if you write for rendered
audio, budget generously.

### A new area

1. Add subjects to `tools/subjects.spec.mjs` with coordinates and Wikipedia titles.
2. `npm run harvest <area> && npm run resolve <area>`.
3. Write beats in a new `tools/corpus/<area>.mjs` and register it in the
   `CORPORA` map at the top of `tools/corpus/index.mjs`.
4. `npm run pack <area>`, then `npm run verify`.

Packing also rewrites `app/public/areas/index.json`, the catalogue the app reads
to find the nearest authored area. It is derived by scanning the output
directory, so a pack can never be present but unlisted.

Authored packs only need `site`-scale subjects. The coarser tiers are fetched
live, because a neighbourhood changes slowly enough that Wikipedia is a
perfectly good source for it, and because authoring them by hand for every area
you might walk through does not scale.

---

## Permanent hosting

The build is fully static, so anything that serves files over HTTPS works.
`.github/workflows/deploy.yml` publishes to GitHub Pages on push to `main` —
after adding your remote, set Settings → Pages → Source to *GitHub Actions* and
it needs no further configuration. There are no secrets to add, because there is
no server and no runtime API key.
