# Wander — a self-guided walking companion

A personal project. A voice in your headphones that knows where you are, tells you
what you're walking past, adapts to how fast you're moving, and answers questions
when you interrupt it.

Not commercial. Built for me and a handful of friends, on free tiers, with the UI
quality of something I'd be happy to show people.

---

## 1. The vision, restated

You put in headphones and start walking. The guide:

- narrates what's around you as a **single continuous show**, not a playlist of
  disconnected clips
- **matches your pace** — slow down and it goes deeper, speed up and it gives you
  headlines, stop and it elaborates until you move
- **transitions smoothly** between subjects instead of cutting between them
- lets you **interrupt and ask anything**, then steers back into the thread it
  abandoned
- can be given **a route** in advance, so it knows what's coming and can build
  toward it
- can **recommend where to go next** and route you there when you ask

The unifying idea: this is a live radio show being produced in real time by
someone walking next to you, not a database being queried by your GPS.

---

## 2. What already exists (and what to steal from each)

The space is crowded. Worth knowing so I don't rebuild the commodity.

### Human-authored marketplaces

| App | What it is | Steal |
|---|---|---|
| VoiceMap | 2,000+ author-written, actor-voiced GPS tours, $5–15 each, offline | Offline-pack discipline. Editorial quality bar. |
| izi.TRAVEL | 25k tours, 2,500 cities, big museum CMS, QR codes for indoor exhibits | **Printed QR anchors for indoor positioning.** Trivial and it works. |
| Rick Steves Audio Europe | Free, ~70 European cities, narrated by Rick himself | **Personality.** The most-loved thing in the category is that it sounds like a specific person with opinions. |
| GPSmyCity | Offline map + article, hundreds of cities, near-free | Nothing much. |
| Questo | City walks as puzzles/quests, 600+ cities | **Quest mode.** A light "find the thing I'm describing" layer over the same content. Costs writing, not engineering. Fun with friends. |
| Shaka Guide / Action Tour Guide / Autio | Driving tours, US parks and highways, offline | Wider trigger radius for cycling/driving. Trivial config. |

### B2B platforms

SmartGuide, Guidebook, Concept3D, YouVisit. They sell authoring tools and
analytics to museums, cities and universities. Guidebook starts around $3,750 for
a single static campus app. Irrelevant to a hobby build except as proof that the
content-refresh problem is real and expensive.

### AI-native apps (2025–26)

Zigway, PAVO, guidude, VoyAI, Travoice, iWander, Herodot, OxGuide, Road Trip.

These all ship roughly the same thing: press start, walk anywhere, GPS-triggered
generated narration, voice Q&A, 30–70 languages, offline cache, camera landmark
ID. guidude's marketing page is nearly a transcript of my original idea.

Worth stealing specifically:

- **guidude** — nine weighted interest categories; end-of-tour path replay with
  the full conversation; a genuinely good privacy stance (location tracked only
  during an active session).
- **PAVO** — Gemini with Search grounding, so the content isn't frozen.
- **Herodot / OxGuide** — point the camera at a building, get identification.
  OxGuide's camera can tell apart three buildings on the same square, which GPS
  never will.
- **iWander** — hybrid: AI-generated walks *plus* an acquired catalog of
  human-written tours. The human layer is what makes it good.
- **OxGuide** — one city, done end to end (plan → navigate → identify → narrate →
  open Q&A). Proof that narrow and deep beats wide and shallow.

### What none of them do

This is the interesting list.

1. **Continuity.** Everyone plays disconnected blobs. Nobody directs one
   continuous show with transitions, callbacks, setup and payoff.
2. **Pace matching.** Nobody changes depth based on whether you stopped,
   strolled, or sped up.
3. **Heading awareness.** Everyone uses lat/lon only, so nobody can say "on your
   left" and be right.
4. **Verifiability.** They hallucinate confidently and never show a source.
5. **Cross-session memory.** Nobody remembers what they told you last week.
6. **Group sync.** Three friends walking together get three unsynced narrations.
7. **Battery.** Continuous GPS plus continuous inference kills a phone in two
   hours. Nobody advertises this because nobody has fixed it.

---

## 3. The hard problem is the writing, not the tech

Every AI guide sounds identical because they all pipe Wikipedia into "write an
engaging 30-second narration."

**What that produces:**

> On your right is Widener Library, the largest university library in the world.
> Completed in 1915, it was funded by Eleanor Elkins Widener in memory of her son
> Harry, who died aboard the Titanic. It holds over 3.5 million volumes across
> ten levels of stacks.

Factually fine. Completely dead.

**Same sources, written as a beat:**

> The building on your right exists because of a shipwreck. In 1912 a
> twenty-seven-year-old book collector named Harry Widener went down with the
> Titanic. His mother survived — and three years later she gave Harvard the
> largest library it had ever seen, with conditions attached. The facade could
> never be altered. Nothing added, nothing removed, forever. Which is why this is
> now a beautiful architectural problem: Harvard has needed more room for eighty
> years and legally cannot touch the front of the building. Everything they've
> built since is either underground or hidden around the back.

### The rubric

Four rules, checkable automatically against generated text:

1. **Cold open.** Never start with the name of the building.
2. **One human being.** A named person doing something, not an institution.
3. **Concrete over superlative.** "Legally cannot touch the facade" beats
   "one of the largest libraries in the world."
4. **End on a redirect.** The last line should make you look at the thing
   differently, or look somewhere new.

This rubric is more valuable than any of the infrastructure, because it's what
determines whether anyone finishes the walk.

### Myth-busting as a content strategy

At the John Harvard statue, people rub the foot and a guide tells them it's the
Statue of Three Lies. At Widener, someone will tell them Eleanor Widener required
every Harvard student to pass a swim test so no one would drown like her son.
That second one is false, thoroughly debunked, and still told several times a day
on that exact spot.

A generic AI guide repeats the myth, because the myth is what's all over the web.
A guide that says *"here's the story everyone tells you here, here's why it's
wrong, and here's why it survives anyway"* is doing something a Wikipedia
summarizer structurally cannot — and it's simultaneously the most interesting
content and the proof point for the sourcing layer. The feature and the
differentiator are the same thing.

---

## 4. The core data model: beats, not blobs

Every competitor models a place as "POI → one paragraph." That makes adaptive
pacing impossible, because a paragraph is atomic — you either play all of it or
none of it.

Model it as a graph of **beats**: 15–45 second self-contained units.

```
Beat {
  id, subject_id
  geometry        // point, polygon, or visible-from set
  heading_arc     // which way you must face for "on your left" to be true
  duration_s      // 15–45s; the scheduler needs this number
  depth           // 1 = headline, 2 = story, 3 = deep cut
  themes          // history | architecture | scandal | science | food | people
  prereq: [id]    // never tell the punchline before the setup
  cooldown_days   // cross-session anti-repetition
  exclusive_group // pick at most one of these
  claims: [{ text, source_url, quote, confidence }]
  sentences: [{ text, audio_url, duration_s }]
}
```

Two consequences:

- The runtime problem becomes **scheduling**, which is fast and cheap, rather
  than generation, which is slow and expensive.
- Beats are **precomputable**. Author an area once with a slow model and proper
  fact-checking, render the audio, and it costs nothing to replay.

**Render audio per sentence, not per beat.** This one choice buys sentence-level
caption highlighting, clean interruption points, graceful truncation when you
walk out of range, and the ability to reorder within a beat.

---

## 5. The director

A small state machine over the position estimator's output. Closer to a game
audio director than to a chatbot.

| State | Trigger | Behavior |
|---|---|---|
| `TRANSITING` | Moving steadily, nothing notable in range | Silence, or a low-density connective beat about the street or era. Prefetch the predicted next beats. |
| `APPROACHING` | Predicted to enter a relevance zone in 20–40s | Pick a beat whose duration fits estimated time-in-zone. Emit a transition line first. |
| `DWELLING` | Speed ≈ 0 for >15s inside a zone | Escalate depth 1 → 2 → 3. Then go **lateral** (what else is visible from this exact spot). Then go **meta** (the block, the era, the architect). |
| `ACCELERATING` | Speed rising, or two skips in a row | Depth-1 headlines only. Raise the silence budget. You're trying to get somewhere. |
| `OFF-ROUTE` | Deviated from the plan | Do not nag. Silently re-rank beats for the new geometry. Never say "you have left the route." |
| `IN-CONVERSATION` | User held the talk button | Duck narration, hand off with the current beat as context, then generate a **re-entry line** on close. |
| `IDLE` | Stationary >3 min, no subject | Stop talking. Offer once to plan what's next, then be quiet and drop to low-power location. |

### Rules the director enforces

- **Never start what you can't finish.** Estimate time-to-exit at current speed
  and only schedule a beat that fits. A story cut off mid-sentence because you
  turned a corner is the worst bug in this category.
- **Silence is designed.** Target ~40% talk density. Boring stretches get quiet,
  never filler. Constant talking is exhausting and it's why people uninstall
  these apps after one walk.
- **Prefetch speculatively.** Synthesize the top three predicted next beats while
  walking. Perceived latency goes to zero.

---

## 6. UI/UX

### Three states, and everyone designs only the third

**Pocket state — 95% of the walk.** Screen off, phone away. The entire interface
is audio, the lock screen, and earbud gestures. `navigator.mediaSession` gives
lock-screen artwork, a subject title, and AirPods controls *for free in a web
app*. Map next/previous to "skip this" and "say that again" — those two will get
used more than everything else combined.

**Glance state — two seconds, at arm's length, in sunlight.** One subject name in
large type, one line saying why you're hearing it ("40m ahead, on your left"),
one giant hold-to-talk target. If it needs a third element, cut something.

**Lean-in state — you've stopped and you're curious.** Map, transcript, sources,
photos. The only screen where density is allowed.

### Aesthetic direction

- **Don't make a map the home screen.** A map is a navigation metaphor and this
  isn't a navigation app. Home is a now-playing card that looks like a magazine
  spread: big editorial serif for the subject, one photo, the current sentence
  highlighted as it's spoken.
- Dark by default; a genuinely high-contrast light mode for daylight, not a
  washed-out inversion.
- Spend the entire motion budget on one thing: the cross-dissolve when the
  subject changes. That's the visual expression of the continuity thesis.

### The four signature interactions

1. **Stereo panning by heading.** Bearing to the subject minus your compass
   heading, fed to a `StereoPannerNode`, so "on your left" *comes from* your
   left. Fifteen lines of trigonometry. Nobody in the category has it.
2. **Live sentence captions.** The sentence being spoken is highlighted as it
   plays. Accessibility win, readable on a noisy street, and it looks great.
3. **The depth ring.** A ring on the now-playing card that fills as the guide
   goes deeper. Stand still and watch it fill; swipe up to pull the next level,
   down to skip. Makes the dwell mechanic visible and playable instead of
   invisible magic.
4. **The walk artifact.** Generated afterward: your path as a trail, a vertical
   timeline of everything you heard, photos slotted in at the coordinates where
   you took them, your questions and answers inline, saved facts pulled out. One
   shareable link. This is what friends actually see, so it earns the most design
   attention per pixel.

---

## 7. Feature list

`v0` = smallest set where the thesis is testable on a real walk.
`v1` = feels like a finished app.
`v2` = fun, not load-bearing.

### Sensing

- `v0` **Position, speed, heading** — `watchPosition` at 1Hz, EWMA on speed,
  compass behind an iOS permission prompt. Heading unlocks panning and
  "on your left."
- `v0` **Dwell timer** — per-subject stopwatch when speed drops near zero inside
  a radius. Triggers the whole depth mechanic.
- `v0` **Generous radii, dwell-preferred triggering** — 35m under tree cover, and
  prefer "has been near for 8s" over "crossed a boundary." GPS in Harvard Yard
  drifts 10–20m; boundary crossing will fire and un-fire constantly.
- `v1` **Map-matching to the footpath graph** — snap fixes to the OSM walkable
  network so jitter stops looking like movement. Biggest quality jump available
  in the location layer.
- `v1` **Forward prediction cone** — where will I plausibly be in 60 and 120
  seconds. Turns reactive playback into anticipatory narration.
- `v1` **Manual override** — tap a subject on the map or say its name, and it
  becomes current. Essential escape hatch when GPS is confidently wrong.
- `v2` **Camera identification** — point at a building. Gemini free-tier vision.
- `v2` **Printed QR anchors** — tape codes inside buildings for indoor position.

### Director

- `v0` **Beat graph with three depth levels** — the core data model.
- `v0` **Duration fitting** — never start a beat that won't finish before you
  leave its zone.
- `v0` **Dwell escalation** — depth 1→2→3, then lateral, then meta. The lateral
  and meta fallbacks are what stop it running dry when you sit on a bench.
- `v0` **Speed compression** — fast walking or repeated skips collapse to
  headlines and raise the silence budget.
- `v0` **Generated transition lines** — one sentence conditioned on the beat just
  finished and the one about to start. Highest quality-per-line-of-code in the
  whole spec.
- `v0` **Designed silence** — target ~40% talk density.
- `v0` **Anti-repetition within a walk** — never repeat, even if you loop back.
- `v1` **Cross-session memory** — remembers last week, references it.
- `v1` **Interest weighting** — nine live-adjustable categories, steered by "more
  like this" spoken aloud, not a settings screen.
- `v1` **Route mode with a serialized thread** — plant something at stop two, pay
  it off at stop nine. The real argument for route mode is dramatic structure,
  not navigation.
- `v1` **Silent off-route re-plan.**
- `v1` **Myth-busting beats.**
- `v1` **Time axis** — what stood here in 1750, what happens here in three weeks,
  what's underneath you.
- `v2` **Live layer** — what's happening at this place this week. Gemini's free
  tier includes grounded search prompts.
- `v2` **Contextual noticing** — rain, sunset, 2am, you've been walking two
  hours, you've stopped at this corner twice.

### Voice and audio

- `v0` **A narrator with a name and a point of view** — one persona, consistent
  opinions, allowed to find things ugly or overrated.
- `v0` **Sentence-level pre-rendered audio.**
- `v0` **Hold-to-talk conversation** — walkie-talkie, not a wake word. More
  reliable, more private, less battery.
- `v0` **Re-entry lines** — steer back into the abandoned thread after answering.
  Without this, every question destroys the flow.
- `v0` **Lock-screen controls** — MediaSession. Free, works in mobile Safari,
  gives you AirPods gestures.
- `v0` **One-tap silence** — shh for ten minutes, reachable from the lock screen.
- `v1` **Stereo panning by heading.**
- `v1` **Offline audio pack.**
- `v2` **Two-voice mode** — two personas who can disagree. Makes dwell easy: they
  argue instead of needing new facts. Untried in this category.

### Screens

- `v0` **Now-playing card** — subject, why you're hearing it, one photo, one
  hold-to-talk target. Must pass the two-second sunlight test.
- `v0` **Live sentence captions.**
- `v0` **Depth ring.**
- `v0` **Subject cross-dissolve.**
- `v1` **Heading-up minimal map** — dark, no POI clutter, only known subjects,
  sized by predicted interest.
- `v1` **Walked trail** — the artifact assembling itself in real time.
- `v1` **Tap a pin ahead** — "tell me about that instead," and the route bends
  toward it.
- `v1` **Transcript with source chips.**
- `v1` **In-app photo capture** — lands on the timeline at the right place, and
  the guide can react to it.
- `v2` **Battery budget** — "this walk will cost about 18%."

### After the walk

- `v1` **The walk artifact.**
- `v1` **Shareable link** — no login to view. The entire distribution mechanism.
- `v2` **Ghost mode** — walk a route a friend walked and hear their questions
  surfaced where they asked them.
- `v2` **Pinned voice notes** — leave thirty seconds at a spot for the next
  person. Only charming because it's personal.
- `v2` **Quest mode** — "find the thing I'm describing," over the same beats.

### Plumbing

- `v0` **Corpus builder** — batch script pulling Wikipedia geosearch, Wikidata,
  Wikivoyage and OSM tags for an area into a beat graph. Run once, commit output.
- `v0` **Beat writing rubric** — grade generated beats automatically.
- `v0` **Claim-level sourcing** — URL, quote and confidence per claim. Cheap now,
  impossible to retrofit.
- `v1` **Offline area pack** — beats, audio, footpath graph, basemap.
- `v2` **Share slugs instead of accounts** — for five friends, auth is pure cost.

**Note the ratio:** roughly two-thirds of `v0` is the director and the writing,
only a third is interface. That's correct, and it's the opposite of how every app
in the landscape was built.

---

## 8. Free stack

| Need | Free option | Catch |
|---|---|---|
| LLM | Gemini API free tier (AI Studio) | Rate limited. **ChatGPT Plus and Claude Pro are not API access** — those are billed separately. |
| TTS | Gemini TTS free tier to pre-render; Web Speech API as live fallback | Quota limits, so render once and commit the audio files. Web Speech voice quality varies by device. |
| Basemap | Protomaps `.pmtiles` extract + MapLibre GL | One file for greater Boston, works offline forever, genuinely zero cost. |
| Places / geometry | OSM via Overpass; footpath graph from an extract | ODbL attribution required. Snapshot it, don't hammer the public endpoint. |
| Facts | Wikipedia geosearch, Wikidata, Wikivoyage | Wikipedia is CC BY-SA — generate original prose grounded in it rather than paraphrasing closely. |
| Routing | Public OSRM, or self-hosted Valhalla | Fine at hobby volume. |
| Hosting | Cloudflare Pages or Vercel free tier | Needs HTTPS for geolocation and compass. Both provide it. |
| Accounts | None — unguessable share slugs, profile on device | Add auth only if strangers show up. |

**Deliberately avoided:** Google Places API. Nearby Search Pro is $32 per 1,000
requests, and polling it during a walk costs more than the LLM does. OSM plus
Wikipedia geosearch covers the same ground for free.

---

## 9. Platform

**PWA first, Expo later.** Decided.

The PWA ships tonight, shares by link, and needs no app store. The honest
limitation: iOS Safari throttles JavaScript timers when backgrounded, so the
phone stays in hand or in a pocket with the screen on. Background location and
true screen-off operation need native.

Mitigations that make the PWA better than it sounds:

- `navigator.mediaSession` gives real lock-screen controls even in Safari.
- Pre-rendered `<audio>` elements keep playing when the screen locks, even though
  JS timers throttle — so a queued beat finishes; the *next* one won't fire until
  you wake it.
- Wake Lock API keeps the screen on when you want it to.

Same React code moves to Expo when it's worth the setup. TestFlight is free for
up to 100 testers, which is more friends than I have.

---

## 10. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Battery** | Continuous GPS + inference + awake screen kills a phone in ~2h. A dead phone in a foreign city is a real problem. | Screen off by default, pre-rendered audio so nothing infers while transiting, adaptive location sampling, and carry a battery pack. |
| **Hallucination** | A confident invented date is fine for a tourist and embarrassing when you're showing friends around your own city. | Claim-level sourcing with confidence; hedge or drop below threshold. |
| **Safety** | Audio in your ears near traffic, while being told to look up. | Prompt for transparency mode; never instruct looking at the screen while moving; suppress narration at likely road crossings. |
| **Licensing** | Wikipedia is CC BY-SA; OSM is ODbL; news can't be reproduced. | Generate original prose from sources, attribute in the source card, link out for news. |
| **Nobody actually wants continuous narration** | The honest one. It's possible people want silence. | Test it on a real walk before building a backend. Count how many times you want it to shut up. |

---

## 11. First test: Harvard Yard

Sunday, so the visitor center (Mon–Fri 9–5) and free student-led tours are out.
Trademark Tours is $22. The official **Visit Harvard** app has a free GPS-enabled
self-guided Yard tour — 14 stops, about a mile, 45–60 minutes. Install it as the
benchmark.

Suggested route: Johnston Gate → Old Yard clockwise → through University Hall
into Tercentenary Theatre → past Sever to the Science Center and Memorial Hall →
back down to Wadsworth House and the Smith Campus Center.

| Stop | Approx. coords | Lead beat |
|---|---|---|
| Johnston Gate | 42.3745, -71.1187 | The traditional entrance; the gate program and the Yard's fencing is itself a story |
| Massachusetts Hall | 42.3744, -71.1183 | 1720, oldest Harvard building, second-oldest academic building in the US, and still the President's office |
| Harvard Hall | 42.3747, -71.1183 | The 1764 fire that destroyed the college library, including most of John Harvard's bequest |
| Holden Chapel | 42.3749, -71.1185 | 1744, one of the oldest college buildings in the country; later an anatomy theatre |
| University Hall + John Harvard statue | 42.3744, -71.1170 | The Statue of Three Lies — wrong man, wrong date, wrong title |
| Widener Library | 42.3736, -71.1167 | Built as a Titanic memorial; the conditions attached to the gift are the good story |
| Memorial Church | 42.3745, -71.1163 | Faces Widener across Tercentenary Theatre; the memorial walls |
| Sever Hall | 42.3741, -71.1157 | H.H. Richardson; the whispering arch at the entrance is a genuinely fun demo |
| Tercentenary Theatre | 42.3742, -71.1163 | Commencement; Marshall announced the Marshall Plan here in 1947 |
| Wadsworth House | 42.3733, -71.1179 | 1726; Washington's first Massachusetts headquarters; the enslaved people who lived here are named on a plaque |
| Science Center | 42.3764, -71.1160 | Sert; allegedly shaped like a Polaroid camera, funded by Edwin Land |
| Memorial Hall | 42.3765, -71.1149 | High Victorian Gothic; commemorates Union dead only, which is its own story |
| Old Burying Ground | 42.3752, -71.1213 | 17th-century graves including several Harvard presidents |
| Smith Campus Center | 42.3730, -71.1189 | 1350 Mass Ave; where the official tours depart |

Coordinates are approximate — verify before relying on them for triggering.

### What to actually measure on the walk

Three numbers. They are the entire product spec.

1. How many times did I want it to shut up?
2. How many stories did I walk out of mid-sentence?
3. How many times did I wish it had said something and it didn't?

---

## 12. Open questions

- **The persona.** Decided: one narrator with a name and a strong point of view.
  Not yet decided who. Skeptical historian? Architecture obsessive? Someone
  who finds most of Harvard slightly ridiculous?
- **Free walk or route as the default mode.**
- **Solo or with a companion.** If usually with someone, the director needs to
  detect that two people are talking to each other and shut up, which is a
  meaningfully different design.
- **How much silence is right.** 40% is a guess. The walk will tell me.
