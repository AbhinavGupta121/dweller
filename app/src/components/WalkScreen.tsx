import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import styles from "./WalkScreen.module.css";
import { BottomSheet } from "./BottomSheet";
import { DepthRing } from "./DepthRing";
import { compassPoint } from "../lib/geo";
import { scaleOf } from "../lib/types";
import type {
  BeatOrigin,
  Depth,
  Scale,
  Subject,
  SubjectProximity,
  TalkDensity,
} from "../lib/types";
import type { Theme, ThemeChoice } from "../lib/useTheme";
import type { useWander } from "../lib/useWander";

/**
 * MapLibre is by far the heaviest thing in the bundle and the start screen has
 * no use for it, so it is fetched only once a walk begins. The wait is free in
 * practice: the first GPS fix takes several seconds, and the chunk lands well
 * inside that.
 */
const MapView = lazy(() =>
  import("./MapView").then((m) => ({ default: m.MapView })),
);

type Wander = ReturnType<typeof useWander>;

export type WalkScreenProps = Wander & {
  theme: Theme;
  themeChoice: ThemeChoice;
  setThemeChoice: (c: ThemeChoice) => void;
};

type Tab = "now" | "nearby" | "heard" | "tune";

const TABS: { id: Tab; label: string }[] = [
  { id: "now", label: "Now" },
  { id: "nearby", label: "Nearby" },
  { id: "heard", label: "Heard" },
  { id: "tune", label: "Tune" },
];

/**
 * The two expanded stops. Collapsed is not listed because the sheet measures it
 * from its own header — at rest the interface should be a caption on a map
 * rather than a panel with a map behind it.
 */
const SNAPS = [0.54, 0.9];

const DENSITY_COPY: Record<TalkDensity, string> = {
  sparse: "Names places as you reach them, and elaborates only when you stop.",
  steady: "A story or two per place, more when you linger.",
  chatty:
    "Keeps going as long as there is material and you are in range. The default.",
};

/**
 * The lens is deliberately exposed as a handful of themes rather than forty
 * tags. These are the ones that change the walk noticeably; the rest are set
 * from these or left at their defaults.
 */
const LENS_CONTROLS: { tag: string; label: string }[] = [
  { tag: "architecture", label: "Architecture and materials" },
  { tag: "science", label: "Science and how things work" },
  { tag: "history", label: "History and how it got here" },
  { tag: "myth", label: "Myth-busting" },
  { tag: "people", label: "People and biography" },
  { tag: "politics", label: "Politics and power" },
  { tag: "art", label: "Art and craft" },
  { tag: "present", label: "What it is today" },
];

export function WalkScreen(props: WalkScreenProps) {
  const w = props;
  const [tab, setTab] = useState<Tab>("now");
  const [snap, setSnap] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [headingUp, setHeadingUp] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    if (!w.startedAt) return;
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - w.startedAt!) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [w.startedAt]);

  /** Opening the sheet on a new beat would cover the map mid-walk. It does not. */
  const focusProximity = useMemo(
    () => w.estimate?.nearby.find((p) => p.subject.id === w.focus?.id) ?? null,
    [w.estimate, w.focus],
  );

  const heardIds = useMemo(() => {
    const ids = new Set<string>();
    for (const h of w.history) ids.add(h.beat.subject);
    return ids;
  }, [w.history]);

  /**
   * Names go to the handful of places actually in play. `nearby` is already
   * sorted by distance and already filtered to what is in range, so the top of
   * it is exactly the set worth naming.
   */
  const labelIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of (w.estimate?.nearby ?? []).slice(0, 5))
      ids.add(p.subject.id);
    return ids;
  }, [w.estimate]);

  /** Unheard beats at the focused subject, grouped by depth, for the ring. */
  const remaining = useMemo(() => {
    if (!w.content || !w.focus) return [];
    const heard = new Set(w.history.map((h) => h.beat.id));
    if (w.speaking) heard.add(w.speaking.beat.id);
    const counts = new Map<Depth, number>();
    for (const beat of w.content.beats) {
      if (beat.subject !== w.focus.id) continue;
      if (heard.has(beat.id)) continue;
      counts.set(beat.depth, (counts.get(beat.depth) ?? 0) + 1);
    }
    return [1, 2, 3].map((d) => ({
      depth: d as Depth,
      count: counts.get(d as Depth) ?? 0,
    }));
  }, [w.content, w.focus, w.history, w.speaking]);

  const spokenText = w.speaking
    ? (w.speaking.preamble ? `${w.speaking.preamble} ` : "") +
      w.speaking.beat.text
    : "";
  const progress = w.speaking
    ? Math.min(1, w.spokenChars / Math.max(spokenText.length, 1))
    : null;

  const selected = useMemo(
    () => w.content?.subjects.find((s) => s.id === selectedId) ?? null,
    [w.content, selectedId],
  );

  const est = w.estimate;

  const openTab = (next: Tab) => {
    setTab(next);
    // Choosing a tab is a request to read something, so the sheet comes up if
    // it was only peeking.
    setSnap((s) => Math.max(s, 1));
  };

  return (
    <div className={styles.screen}>
      {/* No spinner: the fallback is the map's own background colour, so the
          screen looks like a map still loading tiles rather than like a gap. */}
      <Suspense fallback={<div className={styles.mapPlaceholder} />}>
        <MapView
          coord={est?.coord ?? null}
          accuracyM={est?.accuracyM ?? null}
          facingDeg={est?.facingDeg ?? null}
          subjects={w.content?.subjects ?? []}
          focusId={w.focus?.id ?? null}
          heardIds={heardIds}
          labelIds={labelIds}
          paths={w.pack?.paths ?? null}
          theme={w.theme}
          headingUp={headingUp}
          onSelectSubject={(id) => {
            setSelectedId(id);
            setTab("now");
            setSnap((s) => Math.max(s, 1));
          }}
        />
      </Suspense>

      <div className={styles.topBar}>
        <div className={styles.statusPill}>
          <span className={styles.pulse} data-motion={est?.motion ?? "still"} />
          <span className={styles.statusText}>{statusLine(w)}</span>
          {w.source === "demo" && <span className={styles.demoTag}>demo</span>}
          <span className={`${styles.clock} tnum`}>{formatClock(elapsed)}</span>
        </div>

        <div className={styles.mapButtons}>
          <button
            className={styles.glassButton}
            data-on={headingUp}
            onClick={() => setHeadingUp((v) => !v)}
            aria-label={
              headingUp ? "Map follows your heading" : "Map stays north up"
            }
            aria-pressed={headingUp}
            title={headingUp ? "Heading up" : "North up"}
          >
            <CompassIcon />
          </button>
        </div>
      </div>

      <BottomSheet
        snaps={SNAPS}
        index={snap}
        onIndex={setSnap}
        label="Narration and controls"
        header={
          <>
            <div className={styles.nowBar}>
              <div className={styles.nowText}>
                <div className={styles.nowKicker}>
                  {w.speaking
                    ? w.speaking.beat.angle
                    : w.focus
                      ? scaleLabel(scaleOf(w.focus))
                      : "listening"}
                </div>
                <h1 className={styles.nowTitle}>
                  {w.focus?.name ?? idleHeadline(w)}
                </h1>
              </div>
              {w.speaking ? (
                <button className={styles.action} onClick={w.skip}>
                  Skip
                </button>
              ) : (
                <button
                  className={styles.action}
                  onClick={w.tellMeMore}
                  disabled={!w.focus}
                >
                  Tell me more
                </button>
              )}
            </div>
            <div
              className={styles.progressTrack}
              data-visible={progress != null}
            >
              <div
                className={styles.progressFill}
                style={{ transform: `scaleX(${progress ?? 0})` }}
              />
            </div>
            <nav className={styles.tabs} aria-label="Sections">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={styles.tab}
                  data-active={tab === t.id}
                  onClick={() => openTab(t.id)}
                  aria-current={tab === t.id}
                >
                  {t.label}
                  {t.id === "heard" && w.history.length > 0 && (
                    <span className={`${styles.tabCount} tnum`}>
                      {w.history.length}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </>
        }
      >
        {tab === "now" &&
          (selected ? (
            <PlaceCard
              subject={selected}
              wander={w}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <NowPanel
              wander={w}
              remaining={remaining}
              progress={progress}
              focusProximity={focusProximity}
              spokenText={spokenText}
            />
          ))}
        {tab === "nearby" && (
          <NearbyPanel wander={w} onSelect={setSelectedId} />
        )}
        {tab === "heard" && <HeardPanel wander={w} />}
        {tab === "tune" &&
          (showDebug ? (
            <DebugPanel wander={w} onBack={() => setShowDebug(false)} />
          ) : (
            <TunePanel
              wander={w}
              onDebug={() => setShowDebug(true)}
              theme={props}
            />
          ))}
      </BottomSheet>
    </div>
  );
}

/* --------------------------------------------------------------- panels --- */

function NowPanel({
  wander: w,
  remaining,
  progress,
  focusProximity,
  spokenText,
}: {
  wander: Wander;
  remaining: { depth: Depth; count: number }[];
  progress: number | null;
  focusProximity: SubjectProximity | null;
  spokenText: string;
}) {
  const prox = focusProximity;

  if (!w.focus) {
    return (
      <div className={styles.panel}>
        <p className={styles.lead}>{idleBody(w)}</p>
        {w.content?.note && <p className={styles.note}>{w.content.note}</p>}
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.focusRow}>
        <div className={`${styles.chips} tnum`}>
          {/* Distance and bearing are meaningful for a building and
              meaningless for the neighbourhood you are inside. */}
          {prox && scaleOf(w.focus) === "site" && (
            <span className={styles.chip}>{Math.round(prox.distanceM)} m</span>
          )}
          {prox?.direction && scaleOf(w.focus) === "site" && (
            <span className={styles.chip}>{prox.direction}</span>
          )}
          {w.speaking && (
            <span className={styles.chip} data-tone="origin">
              {originLabel(w.speaking.beat.origin)}
            </span>
          )}
          {w.focus.tags?.architect && (
            <span className={styles.chip}>{w.focus.tags.architect}</span>
          )}
          {w.focus.tags?.start_date && (
            <span className={styles.chip}>{w.focus.tags.start_date}</span>
          )}
        </div>
        <DepthRing
          remaining={remaining}
          progress={progress}
          relativeDeg={prox?.relativeDeg ?? null}
        />
      </div>

      {w.speaking?.beat.look && (
        <div className={styles.look}>
          <span className={styles.lookIcon}>Look</span>
          <span className={styles.lookText}>{w.speaking.beat.look}</span>
        </div>
      )}

      {w.speaking ? (
        w.settings.captions ? (
          <p className={styles.captions}>
            <span className={styles.spokenAlready}>
              {spokenText.slice(0, w.spokenChars)}
            </span>
            <span>{spokenText.slice(w.spokenChars)}</span>
          </p>
        ) : null
      ) : (
        <p className={styles.note}>{quietReason(w)}</p>
      )}
    </div>
  );
}

function NearbyPanel({
  wander: w,
  onSelect,
}: {
  wander: Wander;
  onSelect: (id: string) => void;
}) {
  const rows = w.estimate?.nearby ?? [];
  if (!rows.length) {
    return (
      <div className={styles.panel}>
        <p className={styles.note}>
          Nothing in range yet. It widens out as you walk.
        </p>
      </div>
    );
  }
  return (
    <div className={styles.panel}>
      <ul className={styles.rows}>
        {rows.map((p) => (
          <li key={p.subject.id}>
            <button
              className={styles.row}
              data-focus={p.subject.id === w.focus?.id}
              onClick={() => onSelect(p.subject.id)}
            >
              <span className={styles.rowName}>{p.subject.name}</span>
              <span className={styles.rowMeta}>
                {p.direction && (
                  <span className={styles.rowDir}>{p.direction}</span>
                )}
                {scaleOf(p.subject) === "site" ? (
                  <span className="tnum">{Math.round(p.distanceM)} m</span>
                ) : (
                  <span>{scaleOf(p.subject)}</span>
                )}
                <span className={styles.trend} data-trend={p.trend} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlaceCard({
  subject,
  wander: w,
  onClose,
}: {
  subject: Subject;
  wander: Wander;
  onClose: () => void;
}) {
  const prox = w.estimate?.nearby.find((p) => p.subject.id === subject.id);
  const left =
    w.content?.beats.filter(
      (b) =>
        b.subject === subject.id && !w.history.some((h) => h.beat.id === b.id),
    ).length ?? 0;

  return (
    <div className={styles.panel}>
      <button className={styles.back} onClick={onClose}>
        ← Back to the walk
      </button>
      {subject.photo && (
        <img
          className={styles.photo}
          src={subject.photo.url}
          alt={subject.name}
          loading="lazy"
        />
      )}
      <h2 className={styles.cardTitle}>{subject.name}</h2>
      <div className={`${styles.chips} tnum`}>
        <span className={styles.chip}>{scaleOf(subject)}</span>
        {prox && (
          <span className={styles.chip}>{Math.round(prox.distanceM)} m</span>
        )}
        {prox?.direction && (
          <span className={styles.chip}>{prox.direction}</span>
        )}
        <span className={styles.chip}>
          {left} {left === 1 ? "story" : "stories"} left
        </span>
      </div>
      {subject.tags?.architect && (
        <p className={styles.note}>Architect: {subject.tags.architect}</p>
      )}
      {subject.wikipedia && (
        <a
          className={styles.link}
          href={subject.wikipedia.url}
          target="_blank"
          rel="noreferrer"
        >
          Read the article
        </a>
      )}
      <p className={styles.note}>
        The walk decides what to say next from where you are and how you are
        moving, so this is a look at what it knows rather than a play button.
      </p>
    </div>
  );
}

function HeardPanel({ wander: w }: { wander: Wander }) {
  if (!w.history.length) {
    return (
      <div className={styles.panel}>
        <p className={styles.note}>Nothing yet. It starts when you do.</p>
      </div>
    );
  }
  return (
    <div className={styles.panel}>
      {[...w.history].reverse().map((h, i) => (
        <article className={styles.heardItem} key={`${h.beat.id}-${i}`}>
          <div className={styles.heardSubject}>
            {h.subject?.name ?? h.beat.subject}
          </div>
          <p className={styles.heardText}>{h.beat.text}</p>
          <div className={styles.heardMeta}>
            <span>{h.beat.angle}</span>
            <span>depth {h.beat.depth}</span>
            <span>{originLabel(h.beat.origin)}</span>
            {h.beat.sources[0] && (
              <a
                className={styles.link}
                href={h.beat.sources[0]}
                target="_blank"
                rel="noreferrer"
              >
                source
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function TunePanel({
  wander: w,
  onDebug,
  theme,
}: {
  wander: Wander;
  onDebug: () => void;
  theme: { themeChoice: ThemeChoice; setThemeChoice: (c: ThemeChoice) => void };
}) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.groupTitle}>How much talking</h2>
      <div className={styles.segmented} role="group">
        {(["sparse", "steady", "chatty"] as TalkDensity[]).map((d) => (
          <button
            key={d}
            className={styles.segment}
            data-active={w.settings.density === d}
            onClick={() => w.setDensity(d)}
            aria-pressed={w.settings.density === d}
          >
            {d}
          </button>
        ))}
      </div>
      <p className={styles.note}>{DENSITY_COPY[w.settings.density]}</p>

      <h2 className={styles.groupTitle}>Screen</h2>
      <div className={styles.segmented} role="group">
        {(["auto", "night", "day"] as ThemeChoice[]).map((c) => (
          <button
            key={c}
            className={styles.segment}
            data-active={theme.themeChoice === c}
            onClick={() => theme.setThemeChoice(c)}
            aria-pressed={theme.themeChoice === c}
          >
            {c}
          </button>
        ))}
      </div>

      <h2 className={styles.groupTitle}>What you care about</h2>
      {LENS_CONTROLS.map(({ tag, label }) => {
        const value = w.settings.lens[tag] ?? 0.5;
        return (
          <div className={styles.sliderRow} key={tag}>
            <label className={styles.sliderLabel} htmlFor={`lens-${tag}`}>
              {label}
            </label>
            <span className={`${styles.sliderValue} tnum`}>
              {Math.round(value * 100)}
            </span>
            <input
              id={`lens-${tag}`}
              className={styles.slider}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={value}
              onChange={(e) => w.setLensWeight(tag, Number(e.target.value))}
            />
          </div>
        );
      })}

      <h2 className={styles.groupTitle}>Voice</h2>
      <div className={styles.sliderRow}>
        <label className={styles.sliderLabel} htmlFor="rate">
          Speaking speed
        </label>
        <span className={`${styles.sliderValue} tnum`}>
          {w.settings.voiceRate.toFixed(2)}
        </span>
        <input
          id="rate"
          className={styles.slider}
          type="range"
          min={0.7}
          max={1.4}
          step={0.05}
          value={w.settings.voiceRate}
          onChange={(e) => w.setVoiceRate(Number(e.target.value))}
        />
      </div>

      <div className={styles.toggleRow}>
        <span>Show captions</span>
        <button
          className={styles.switch}
          data-on={w.settings.captions}
          onClick={w.toggleCaptions}
          role="switch"
          aria-checked={w.settings.captions}
          aria-label="Show captions"
        />
      </div>

      <div className={styles.toggleRow}>
        <span>Position and director internals</span>
        <button className={styles.link} onClick={onDebug}>
          Open
        </button>
      </div>

      <button className={styles.endWalk} onClick={w.stop}>
        End the walk
      </button>
    </div>
  );
}

function DebugPanel({
  wander: w,
  onBack,
}: {
  wander: Wander;
  onBack: () => void;
}) {
  const e = w.estimate;
  return (
    <div className={styles.panel}>
      <button className={styles.back} onClick={onBack}>
        ← Tune
      </button>
      <div className={styles.debug}>
        <div>
          <b>source</b> {w.source} &nbsp; <b>phase</b> {w.phase}
        </div>
        <div>
          <b>content</b> {w.content?.origin ?? "—"} &nbsp; <b>where</b>{" "}
          {w.content?.label ?? "—"}
        </div>
        <div>
          <b>subjects</b> {w.content?.subjects.length ?? 0} &nbsp; <b>beats</b>{" "}
          {w.content?.beats.length ?? 0}
        </div>
        {e ? (
          <>
            <div>
              <b>coord</b> {e.coord[1].toFixed(6)}, {e.coord[0].toFixed(6)}
            </div>
            <div>
              <b>accuracy</b> {e.accuracyM.toFixed(0)} m &nbsp; <b>off path</b>{" "}
              {e.offPathM == null ? "—" : `${e.offPathM.toFixed(0)} m`}
            </div>
            <div>
              <b>speed</b> {e.speedMps.toFixed(2)} m/s &nbsp; <b>motion</b>{" "}
              {e.motion} &nbsp; <b>dwell</b> {e.dwellSec.toFixed(0)} s
            </div>
            <div>
              <b>facing</b>{" "}
              {e.facingDeg == null
                ? "unknown"
                : `${e.facingDeg.toFixed(0)}° ${compassPoint(e.facingDeg)} (${e.facingSource})`}
            </div>
            <div>
              <b>talk fraction</b> {(w.talkFraction * 100).toFixed(0)}%
            </div>
            <div>
              <b>director</b> {w.directorState}
            </div>
            <div>
              <b>voice</b> {w.voiceBackend}
            </div>
            <div style={{ marginTop: 10 }}>
              <b>in range</b>
            </div>
            {e.nearby.map((p) => (
              <div key={p.subject.id}>
                {p.distanceM.toFixed(0).padStart(5)} m{" "}
                {scaleOf(p.subject).padEnd(9)} {p.trend.padEnd(12)}{" "}
                {p.subject.name}
              </div>
            ))}
          </>
        ) : (
          <div>waiting for a usable fix…</div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- copy --- */

function statusLine(w: Wander): string {
  if (!w.estimate) return "Looking for satellites…";
  const e = w.estimate;
  if (e.accuracyM > 35)
    return `Weak signal, ${e.accuracyM.toFixed(0)} m accuracy`;
  if (w.speaking) return w.speaking.subject?.name ?? "Speaking";
  const bits: string[] = [];
  bits.push(e.motion === "still" ? "Standing" : "Walking");
  if (e.motion === "still" && e.dwellSec > 8) {
    bits.push(`${Math.floor(e.dwellSec)}s`);
  }
  if (e.facingDeg != null) bits.push(`facing ${compassPoint(e.facingDeg)}`);
  return bits.join(" · ");
}

/**
 * The screen is silent most of the time by design, which reads as "broken"
 * unless the app says why. This turns the director's internal state into one
 * plain sentence so a pause never feels like a crash.
 */
function quietReason(w: Wander): string {
  switch (w.directorState) {
    case "cold":
      return "Waiting for a steadier position fix.";
    case "spent":
      return "You have heard everything in range, down to the neighbourhood. Keep walking and it will find more.";
    case "dwelling":
      return "Standing still — it will start going deeper the longer you stay.";
    default:
      if (w.estimate && w.estimate.motion === "brisk") {
        return "Moving quickly, so it is holding the longer stories. Slow down and they open up.";
      }
      return "Nothing worth interrupting you for yet.";
  }
}

/**
 * The old version of this said "Out of the area", which was both true and
 * useless: it described a content boundary in words that sound like a broken
 * sensor. There is no out-of-area state any more — there is only how specific
 * the app can be about where you are.
 */
function idleHeadline(w: Wander): string {
  if (!w.estimate) return "Finding you";
  if (w.estimate.nearby.length) return "Nothing to say just here";
  return w.content?.label ?? "Somewhere quiet";
}

function idleBody(w: Wander): string {
  if (!w.estimate) {
    return "Give it a few seconds outdoors. The first fix is always the slowest.";
  }
  if (w.estimate.nearby.length) {
    return "Keep walking, or press Tell me more to hear something about the nearest place anyway.";
  }
  if (w.content?.note) return w.content.note;
  return "Nothing near enough to describe. It will widen out as you walk.";
}

/** What "here" means at each scale, since "you are at" only fits a building. */
function scaleLabel(scale: Scale | null): string {
  switch (scale) {
    case "place":
      return "you are in";
    case "district":
      return "the neighbourhood";
    case "region":
      return "the wider area";
    default:
      return "you are at";
  }
}

/**
 * Trust, made visible. A hand-authored beat was checked against sources; a beat
 * a model wrote thirty seconds ago was not, and the walker deserves to know
 * which one is talking without having to guess from the prose.
 */
function originLabel(origin: BeatOrigin | undefined): string {
  switch (origin) {
    case "gemini":
      return "written live";
    case "wikipedia":
      return "from wikipedia";
    default:
      return "checked";
  }
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ----------------------------------------------------------- icons --- */

function CompassIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="10" cy="10" r="7.2" />
      <path
        d="M12.6 7.4 8.9 8.9 7.4 12.6l3.7-1.5z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
