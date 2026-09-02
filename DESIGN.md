# Wander — visual and interaction design

The app is mostly used with the screen off. So the design job is unusual: make
the rare moments you *do* look at it feel considered enough that the whole thing
reads as a crafted object rather than a utility.

Reference points: a well-set magazine, transit signage, Teenage Engineering's
restraint. Not: Google Maps, not a dashboard, not a music player.

---

## 1. Foundations

### Type

Two families, both free on Google Fonts.

| Role | Face | Usage |
|---|---|---|
| Display | **Instrument Serif** | Subject names only. 40–56px. Real character, high contrast, looks editorial rather than institutional. |
| Interface | **Inter** | Everything else. 13–20px. Tight tracking on small sizes. |
| Numeric | Inter, tabular figures | Distances, durations, counts — so they don't jitter as they change. |

Captions get 20px Inter at `line-height: 1.45`. Big enough to read at arm's
length while walking, small enough that three sentences fit.

### Color

One dark ground, one warm accent, nothing else. Blue is banned — it reads as
"navigation app" and this isn't one.

```
--ink-900   #0B0B0C   ground (dark mode)
--ink-800   #141416   raised surface
--ink-600   #2A2A2E   hairline
--paper-100 #F5F2EC   primary text on dark
--paper-400 #9C9890   secondary text
--paper-600 #625E58   tertiary

--signal    #E8A33D   the only accent. amber — reads as streetlight, dusk,
                      brass. Legible in sunlight in a way blue is not.
--signal-dim #6B4D1E  accent at rest / track behind the depth ring
```

Light mode is a genuine inversion for daylight, not a washed-out theme:
`#F7F4EE` paper ground, `#111013` ink, same amber.

### Texture

One allowance: a 2–3% monochrome noise overlay across the ground. Large flat
dark fields look cheap on OLED; a whisper of grain reads as paper. Applied once,
globally, as a fixed SVG filter.

Nothing else. No gradients, no glass, no drop shadows, no rounded-everything.
Corners are 4px or 999px, never 12px.

### Photography

Source photos will be wildly inconsistent — Wikimedia Commons ranges from
professional to phone snaps from 2007. Normalize with a **duotone treatment**:
map every photo to ink-900 → paper-100 with a slight amber lift in the
highlights. Bad photos become atmospheric instead of embarrassing, and the whole
app stays visually coherent.

---

## 2. Screens

### 2.1 Start

Deliberately almost empty.

```
                                        
        Harvard Yard                    ← Instrument Serif, 48px
        14 subjects · ~1 mile           ← Inter 15px, paper-400
                                        
                                        
                                        
                                        
                                        
              ( BEGIN )                 ← 96px circle, signal outline
                                        
        Headphones recommended          ← Inter 13px, paper-600
```

Permissions are requested on tap, in sequence, each with one line of plain
English before the OS prompt appears:

- *"Location, so it knows what you're walking past."*
- *"Compass, so it can say which side the building is on."*
- *"Motion, so it can tell when you've stopped."*

No permission wall. If you decline the compass it degrades — you lose panning and
directional language, and the app never mentions it again.

### 2.2 Walking — the screen that matters

```
┌──────────────────────────────────────┐
│  HARVARD YARD    0.4 mi · 6 heard    │ ← status strip, 12px, paper-600
│                                      │
│      ┌────────────────────────┐      │
│      │                        │      │
│      │   duotone photo        │      │ ← 1:1, ink-900 → paper-100
│      │                        │      │
│      └────────────────────────┘      │
│                                      │
│   Widener Library                    │ ← Instrument Serif 44px
│                                      │
│   ◤ 40 m ahead · on your left        │ ← bearing arrow rotates live
│                                      │
│   ─────────────────────────────      │
│                                      │
│   The building on your right         │ ← current sentence, 20px
│   exists because of a shipwreck.     │   spoken = 100%, next = 35%
│   In 1912 a twenty-seven-year-old    │
│   book collector named Harry         │
│   Widener went down with the         │
│   Titanic.                           │
│                                      │
│                                      │
│              ╭───╮                   │
│         ╭────│   │────╮              │ ← depth ring, 3 segments
│         │    │ ● │    │              │   around the talk button
│         ╰────│   │────╯              │
│              ╰───╯                   │
│           hold to ask                │
└──────────────────────────────────────┘
```

**The depth ring** wraps the talk button. Three arc segments at 120° each. The
active segment fills over the beat's duration; completing depth 1 leaves it lit
and starts depth 2. So the ring is simultaneously a progress bar and a depth
indicator, and it makes "I stood still and it went deeper" a thing you can watch
happen.

**The bearing arrow** is the only continuously animating element. Heavily damped
— raw compass on a phone jitters several degrees per second and untreated it
looks broken. Low-pass filter with a ~1s time constant.

**Gestures on the card:**

| Gesture | Action |
|---|---|
| Swipe up | Go deeper — pull the next depth level now |
| Swipe down | Skip this beat |
| Swipe left | Shh for ten minutes |
| Swipe right | Save this |
| Long-press the button | Hold to ask |
| Pull up from bottom edge | Map sheet |

Every one of these also exists as a lock-screen or earbud control, because the
screen will be off.

### 2.3 Silence must look intentional

The most important state, and the easiest to get wrong. When the director has
nothing worth saying, the card must not look broken or stalled.

It collapses: photo fades out, subject name fades to the area name at 40%
opacity, captions clear, and a single small amber dot breathes at roughly
12 cycles per minute near the bottom.

That's it. Calm, alive, obviously deliberate. It should feel like a companion
who has stopped talking, not an app that has crashed.

### 2.4 Map sheet

Pulled up from the bottom, covers 85% of the screen, dismissed by swipe down.

Heading-up, not north-up. Dark basemap with nearly all labels stripped — you do
not need street names, you need to know where the interesting things are.

- Your trail: 3px amber line, full opacity for the last 200 m, fading back to 20%
- Subjects heard: filled amber dot
- Subjects not yet heard: hollow dot, radius scaled by predicted interest
- Tap any dot: a small sheet with the name and one button, *"Tell me about this"*

No pins, no clustering, no POI icons, no traffic. The restraint is the point.

### 2.5 The walk artifact

A single scrolling page, and the only screen allowed to be dense. This is what
gets shared, so it earns the most attention per pixel.

1. **Hero** — the path drawn on a minimal map, with the date, distance, duration
   and a generated one-line title of the walk.
2. **Timeline** — vertical rail. Each subject as an entry: duotone photo, name in
   serif, the beat text you actually heard, and a timestamp.
3. **Your photos** — inserted inline at the position and time you took them, full
   bleed, breaking the rail.
4. **Your questions** — rendered as pull-quotes in serif with the answer beneath
   in Inter. These are the most personal thing on the page and should look it.
5. **Saved facts** — a short list at the end.
6. **Sources** — collapsed by default, expandable, every claim with its link.

---

## 3. Motion

One signature transition, and almost nothing else.

**Subject change (400 ms):** photo cross-dissolves; the serif name translates up
12px while fading in; the caption block clears and the first sentence fades in
80ms later. Ease: `cubic-bezier(0.2, 0, 0, 1)`.

That's the visual expression of the continuity thesis, so it's worth getting
exactly right and worth being the only thing that moves.

Everything else:

- Depth ring fills linearly over the beat duration. No easing — it's a clock.
- Caption sentence handoff: 120 ms opacity only. No sliding.
- Silence dot: 5 s breathe cycle, `ease-in-out`.
- Sheets: standard spring, 320 ms.

`prefers-reduced-motion` kills the cross-dissolve and the breathing dot; the ring
stays because it carries information.

---

## 4. Outdoor and accessibility constraints

These are functional requirements, not nice-to-haves — this app is used in
sunlight, one-handed, while moving.

- **Sunlight mode.** Not just light theme: maximum contrast, photos suppressed,
  captions at 24px. Triggered manually or by ambient light sensor where available.
- **Touch targets.** The talk button is 96px. Nothing interactive is under 44px.
- **One-handed.** Everything reachable sits in the bottom 40% of the screen. The
  top is display only.
- **Captions are not optional.** They're the accessibility story and they're also
  how you follow along on a noisy street.
- **Wake Lock** while the walking screen is foregrounded, with an obvious way to
  let the screen sleep, because battery.

---

## 5. Component inventory for v0

Small on purpose.

| Component | Notes |
|---|---|
| `<StatusStrip>` | area, distance, count. 12px, never moves. |
| `<SubjectCard>` | duotone photo, serif name, bearing line. Owns the cross-dissolve. |
| `<BearingArrow>` | damped rotation from compass vs. subject bearing. |
| `<Captions>` | sentence list, spoken/current/upcoming opacity states. |
| `<DepthRing>` | three arcs, fill driven by playback position and depth. |
| `<TalkButton>` | 96px, long-press, mic-level ring while held. |
| `<SilenceState>` | the collapsed card + breathing dot. |
| `<MapSheet>` | v1. |
| `<Artifact>` | v1, separate route, server-rendered for sharing. |

---

## 6. What makes this feel expensive

Five specific things, in order of impact per hour spent:

1. **The silence state.** Everyone builds the talking state. Almost nobody
   designs the quiet one, and it's 60% of the walk.
2. **Duotone normalization on photos.** Turns an inconsistent scraped image set
   into something that looks art-directed.
3. **The single cross-dissolve.** One well-tuned transition beats twelve mediocre
   ones and costs a tenth as much.
4. **Damped compass.** Jittery arrows make an app feel cheap instantly, and the
   fix is four lines.
5. **Tabular figures on the distance counter.** Absurdly small detail. Without it
   the number wobbles as digits change and it looks amateur.
