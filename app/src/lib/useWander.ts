/**
 * The one hook that runs the walk.
 *
 * Everything stateful and imperative lives here: sensor subscriptions, the tick
 * loop, and the narrator. The estimator and director stay pure and are driven
 * from this file, which keeps them testable from Node and means the UI can be
 * rewritten without touching the logic.
 *
 * The ordering constraint that shapes this file: content cannot be chosen until
 * we know where the walker is. An app that works anywhere has to get a fix
 * first and then decide what it knows, which is why `start` waits for a single
 * `getCurrentPosition` before building anything.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  loadAreaIndex,
  loadPack,
  resolveBroad,
  resolveContent,
} from "./content";
import { Director, DEFAULT_LENS } from "./director";
import type { DirectorState } from "./director";
import { Estimator, fixFromPosition } from "./estimator";
import {
  AudioNarrator,
  WebSpeechNarrator,
  type Narrator,
  type NarratorEvents,
  type Utterance,
} from "./narrator";
import { HARVARD_YARD_WALK, simulateWalk, type SimSample } from "./simulate";
import type {
  AreaIndex,
  AreaPack,
  Beat,
  Content,
  Estimate,
  LonLat,
  Scale,
  Settings,
  Subject,
  TalkDensity,
} from "./types";

/** How often the director is asked to make a decision. */
const TICK_MS = 1000;

/** How long to wait for the first fix before giving up on starting. */
const FIRST_FIX_TIMEOUT_MS = 20000;

export type Phase =
  | "idle"
  | "loading"
  | "ready"
  | "locating"
  | "resolving"
  | "running"
  | "denied"
  | "error";

export type Source = "gps" | "demo";

export interface SpokenLine {
  beat: Beat;
  subject: Subject | null;
  preamble: string | null;
  at: number;
}

export interface WanderState {
  phase: Phase;
  error: string | null;
  /** What the app knows about where you are, whatever the source. */
  content: Content | null;
  /** The shipped pack in play, when there is one. Has footpaths and photos. */
  pack: AreaPack | null;
  /** Areas the build shipped, for the start screen. */
  areas: AreaIndex | null;
  /** Set when a pack exists nearby but you are outside it. */
  nearestPack: { name: string; distanceM: number; center: LonLat } | null;
  /** What the app is busy doing, for the start screen's waiting state. */
  progress: string | null;
  estimate: Estimate | null;
  /** The beat currently being spoken, if any. */
  speaking: SpokenLine | null;
  /** Character offset into the current utterance, for caption highlighting. */
  spokenChars: number;
  /** Most recent first. */
  history: SpokenLine[];
  /** The subject the app currently considers you to be at. */
  focus: Subject | null;
  /** How broad the current narration is, so the UI can say "neighbourhood". */
  scale: Scale | null;
  source: Source;
  settings: Settings;
  /** Fraction of the walk spent talking, for the debug panel. */
  talkFraction: number;
  /** What the director is doing, so the UI can explain the quiet honestly. */
  directorState: DirectorState;
  /** Which speech backend won: "audio" for pre-rendered, "web-speech" otherwise. */
  voiceBackend: string;
  startedAt: number | null;
}

const DEFAULT_SETTINGS: Settings = {
  // Chatty by default. Steady leaves long stretches of silence that read as the
  // app having nothing to say, when usually it had plenty and was rationing.
  density: "chatty",
  lens: DEFAULT_LENS,
  captions: true,
  voiceRate: 1,
};

const SETTINGS_KEY = "dweller.settings";

function loadSettings(): Settings {
  try {
    // The old key is read once so an upgrade does not reset a tuned lens.
    const raw =
      localStorage.getItem(SETTINGS_KEY) ??
      localStorage.getItem("wander.settings");
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      lens: { ...DEFAULT_LENS, ...(parsed.lens ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** One position fix, as a promise, so `start` can await it. */
function firstFix(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This browser has no geolocation."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: FIRST_FIX_TIMEOUT_MS,
      maximumAge: 30000,
    });
  });
}

export function useWander() {
  const [areas, setAreas] = useState<AreaIndex | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [pack, setPack] = useState<AreaPack | null>(null);
  const [nearestPack, setNearestPack] =
    useState<WanderState["nearestPack"]>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [speaking, setSpeaking] = useState<SpokenLine | null>(null);
  const [spokenChars, setSpokenChars] = useState(0);
  const [history, setHistory] = useState<SpokenLine[]>([]);
  const [source, setSource] = useState<Source>("gps");
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [spokenSec, setSpokenSec] = useState(0);
  const [directorState, setDirectorState] = useState<DirectorState>("cold");
  const [voiceBackend, setVoiceBackend] = useState("none");
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  const estimatorRef = useRef<Estimator | null>(null);
  const directorRef = useRef<Director | null>(null);
  const narratorRef = useRef<Narrator | null>(null);
  const estimateRef = useRef<Estimate | null>(null);
  const inFlightRef = useRef<Beat | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoRef = useRef<{ samples: SimSample[]; index: number } | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Held in a ref, not just derived state, because the narrator's callbacks are
  // created once at start and still have to resolve subjects that arrived later
  // from the background augmentation.
  const subjectsRef = useRef(new Map<string, Subject>());
  useEffect(() => {
    const map = new Map<string, Subject>();
    for (const s of content?.subjects ?? []) map.set(s.id, s);
    subjectsRef.current = map;
  }, [content]);

  /* ------------------------------------------------------ load index --- */

  // Only the catalogue of shipped areas loads up front. Which one applies, or
  // whether any does, is not knowable until there is a position.
  useEffect(() => {
    let cancelled = false;
    loadAreaIndex().then((index) => {
      if (cancelled) return;
      setAreas(index);
      setPhase("ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Private browsing can reject writes; settings are not worth failing over.
    }
    directorRef.current?.setSettings(settings);
    narratorRef.current?.setRate(settings.voiceRate);
  }, [settings]);

  /* ------------------------------------------------------------ the tick --- */

  const tick = useCallback(() => {
    const director = directorRef.current;
    const narrator = narratorRef.current;
    if (!director || !narrator) return;

    const est = estimateRef.current;
    const now = Date.now();

    // Let a long beat bow out gracefully once its subject is behind us, rather
    // than talking about a building you can no longer see.
    const current = inFlightRef.current;
    if (
      current &&
      !narrator.windingDown &&
      director.shouldWindDown(est, current)
    ) {
      narrator.windDown();
    }

    const decision = director.decide(est, narrator.speaking, now);
    setDirectorState(decision.state);
    // Sampled here rather than read from the clock during render, so the value
    // is stable across re-renders and advances only when the walk does.
    setElapsedSec(
      startedAtRef.current ? (now - startedAtRef.current) / 1000 : 0,
    );
    if (!decision.speak) return;

    const beat = decision.speak.beat;
    const proximity = est?.nearby.find((p) => p.subject.id === beat.subject);
    const utterance: Utterance = {
      beat,
      preamble: decision.speak.preamble,
      relativeDeg: proximity?.relativeDeg ?? null,
    };

    inFlightRef.current = beat;
    narrator.speak(utterance);
  }, []);

  /* --------------------------------------------------------- sensors --- */

  const handleOrientation = useCallback((ev: DeviceOrientationEvent) => {
    const estimator = estimatorRef.current;
    if (!estimator) return;

    // `webkitCompassHeading` is already true north and clockwise. The standard
    // `alpha` is counter-clockwise from east-ish, so it has to be flipped.
    const webkitHeading = (
      ev as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
      }
    ).webkitCompassHeading;

    if (typeof webkitHeading === "number" && !Number.isNaN(webkitHeading)) {
      estimator.pushHeading(webkitHeading);
      return;
    }
    if (ev.absolute && ev.alpha != null) {
      estimator.pushHeading((360 - ev.alpha) % 360);
    }
  }, []);

  const stopSensors = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    window.removeEventListener(
      "deviceorientationabsolute",
      handleOrientation as EventListener,
    );
    window.removeEventListener(
      "deviceorientation",
      handleOrientation as EventListener,
    );
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    demoRef.current = null;
  }, [handleOrientation]);

  /* ----------------------------------------------------------- start --- */

  const start = useCallback(
    async (mode: Source) => {
      setSource(mode);
      setError(null);

      // iOS gates the compass behind a permission prompt that must be requested
      // from a user gesture, which is why start() is async and asks early.
      const requestPermission = (
        DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<string>;
        }
      ).requestPermission;
      if (mode === "gps" && typeof requestPermission === "function") {
        try {
          await requestPermission();
        } catch {
          // Declining the compass is survivable: the director falls back to
          // course over ground and simply stops saying "on your left".
        }
      }

      let resolvedContent: Content;
      let resolvedPack: AreaPack | null = null;
      // Held past the resolve so the background augmentation can reuse it
      // rather than waiting on another fix.
      let startCoord: LonLat | null = null;

      if (mode === "demo") {
        setPhase("resolving");
        setProgress("Loading the demo area");
        try {
          resolvedPack = await loadPack("harvard-yard");
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setPhase("error");
          return;
        }
        resolvedContent = {
          origin: "pack",
          label: resolvedPack.area.name,
          subjects: resolvedPack.subjects,
          beats: resolvedPack.beats,
          paths: resolvedPack.paths,
          note: null,
        };
        setNearestPack(null);
      } else {
        setPhase("locating");
        setProgress("Waiting for a GPS fix");
        let fix: GeolocationPosition;
        try {
          fix = await firstFix();
        } catch (err) {
          const geoErr = err as GeolocationPositionError;
          if (geoErr?.code === 1) {
            setPhase("denied");
            setError("Location permission was denied.");
          } else {
            setPhase("error");
            setError(
              geoErr?.message ??
                (err instanceof Error ? err.message : String(err)),
            );
          }
          return;
        }

        startCoord = [fix.coords.longitude, fix.coords.latitude];
        setPhase("resolving");
        try {
          const resolved = await resolveContent(startCoord, {
            onProgress: setProgress,
          });
          resolvedContent = resolved.content;
          resolvedPack = resolved.pack;
          setNearestPack(resolved.nearestPack);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setPhase("error");
          return;
        }

        if (!resolvedContent.beats.length) {
          setContent(resolvedContent);
          setProgress(null);
          setError(
            resolvedContent.note ??
              "Nothing to say about this spot, and nothing nearby to read.",
          );
          setPhase("error");
          return;
        }
      }

      setContent(resolvedContent);
      setPack(resolvedPack);
      setProgress(null);

      const estimator = new Estimator({
        subjects: resolvedContent.subjects,
        paths: resolvedContent.paths,
      });

      // Seeded here so the first beat can resolve its subject before the effect
      // that mirrors `content` has run.
      subjectsRef.current = new Map(
        resolvedContent.subjects.map((s) => [s.id, s]),
      );

      const events: NarratorEvents = {
        onStart: (u) => {
          setSpeaking({
            beat: u.beat,
            subject: subjectsRef.current.get(u.beat.subject) ?? null,
            preamble: u.preamble,
            at: Date.now(),
          });
          setSpokenChars(0);
        },
        onSentence: (_u, charIndex) => setSpokenChars(charIndex),
        onEnd: (u, actualSec) => {
          directorRef.current?.noteSpoken(u.beat, Date.now(), actualSec);
          inFlightRef.current = null;
          setSpokenSec((s) => s + actualSec);
          setSpeaking(null);
          setSpokenChars(0);
          setHistory((h) => [
            {
              beat: u.beat,
              subject: subjectsRef.current.get(u.beat.subject) ?? null,
              preamble: u.preamble,
              at: Date.now(),
            },
            ...h,
          ]);
        },
        onError: () => {
          inFlightRef.current = null;
          setSpeaking(null);
        },
      };

      // Pre-rendered audio if this area ships any, otherwise the phone's own
      // synthesiser. AudioNarrator falls back per beat, so a partial render is
      // fine and the rest of the app cannot tell the difference. Live content
      // is never pre-rendered, so it goes straight to speech synthesis.
      const areaId = resolvedPack?.area.id ?? null;
      const narrator = areaId
        ? await AudioNarrator.load(
            areaId,
            events,
            new WebSpeechNarrator(events),
          )
        : new WebSpeechNarrator(events);
      narrator.setRate(settings.voiceRate);
      setVoiceBackend(narrator.kind);

      // The corpus estimates duration from word count, which is close for
      // speech synthesis and badly wrong for rendered audio: a directed voice
      // that lets full stops land ran nearly 70% over on the beats we measured.
      // The director gates beats on whether they fit the time available, so it
      // has to use measured seconds wherever we have them.
      const beats =
        narrator instanceof AudioNarrator
          ? resolvedContent.beats.map((b) => {
              const measured = narrator.durationOf(b.id);
              return measured == null ? b : { ...b, sec: measured };
            })
          : resolvedContent.beats;

      const director = new Director({ beats, settings });

      if (narrator.kind === "audio" && areaId) {
        navigator.serviceWorker?.controller?.postMessage({
          type: "warm-audio",
          areaId,
        });
      }

      estimatorRef.current = estimator;
      directorRef.current = director;
      narratorRef.current = narrator;

      if (mode === "demo") {
        demoRef.current = {
          samples: simulateWalk({
            route: HARVARD_YARD_WALK,
            fixIntervalSec: 1,
          }),
          index: 0,
        };
      } else {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const next = estimator.push(fixFromPosition(pos));
            estimateRef.current = next;
            setEstimate(next);
          },
          (err) => {
            if (err.code === err.PERMISSION_DENIED) {
              setPhase("denied");
              setError("Location permission was denied.");
            } else {
              setError(err.message);
            }
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
        );

        window.addEventListener(
          "deviceorientationabsolute",
          handleOrientation as EventListener,
        );
        window.addEventListener(
          "deviceorientation",
          handleOrientation as EventListener,
        );

        // A pack knows its buildings and nothing about the city around them, so
        // exhausting it used to mean silence for the rest of the walk. Fetching
        // the coarse tiers in the background gives the director somewhere to
        // fall back to. Failure here is invisible and harmless.
        if (resolvedContent.origin === "pack" && startCoord) {
          resolveBroad(startCoord)
            .then(({ subjects, beats: broad }) => {
              if (!subjects.length) return;
              estimatorRef.current?.addSubjects(subjects);
              directorRef.current?.addBeats(broad);
              setContent((c) =>
                c
                  ? {
                      ...c,
                      subjects: [...c.subjects, ...subjects],
                      beats: [...c.beats, ...broad],
                    }
                  : c,
              );
            })
            .catch(() => {});
        }
      }

      // Keep the screen from locking mid-walk. Best-effort: unsupported on some
      // browsers and revoked when the tab is hidden, which is fine.
      try {
        const wakeLock = (
          navigator as Navigator & {
            wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> };
          }
        ).wakeLock;
        if (wakeLock) wakeLockRef.current = await wakeLock.request("screen");
      } catch {
        // Not available; the walk still works, the screen just sleeps.
      }

      startedAtRef.current = Date.now();
      setStartedAt(startedAtRef.current);
      setSpokenSec(0);
      setElapsedSec(0);
      setHistory([]);
      setPhase("running");

      tickRef.current = setInterval(() => {
        const demo = demoRef.current;
        if (demo) {
          const sample = demo.samples[demo.index];
          if (sample) {
            demo.index += 1;
            estimator.pushHeading(sample.fix.headingDeg);
            const next = estimator.push({ ...sample.fix, at: Date.now() });
            estimateRef.current = next;
            setEstimate(next);
          }
        }
        tick();
      }, TICK_MS);
    },
    [settings, tick, handleOrientation],
  );

  const stop = useCallback(() => {
    narratorRef.current?.cancel();
    narratorRef.current?.dispose();
    narratorRef.current = null;
    stopSensors();
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    inFlightRef.current = null;
    startedAtRef.current = null;
    setSpeaking(null);
    setDirectorState("cold");
    setProgress(null);
    setPhase("ready");
  }, [stopSensors]);

  useEffect(() => stopSensors, [stopSensors]);

  /* --------------------------------------------------------- actions --- */

  /** Skip the current beat. Counts as heard so it will not come round again. */
  const skip = useCallback(() => {
    const beat = inFlightRef.current;
    narratorRef.current?.cancel();
    if (beat) directorRef.current?.noteSkipped(beat, Date.now());
    inFlightRef.current = null;
  }, []);

  /** Ask for more about whatever is in focus right now. */
  const tellMeMore = useCallback(() => {
    const narrator = narratorRef.current;
    if (!narrator || narrator.speaking) return;
    tick();
  }, [tick]);

  const setDensity = useCallback((density: TalkDensity) => {
    setSettings((s) => ({ ...s, density }));
  }, []);

  const setLensWeight = useCallback((tag: string, weight: number) => {
    setSettings((s) => ({ ...s, lens: { ...s.lens, [tag]: weight } }));
  }, []);

  const toggleCaptions = useCallback(() => {
    setSettings((s) => ({ ...s, captions: !s.captions }));
  }, []);

  const setVoiceRate = useCallback((voiceRate: number) => {
    setSettings((s) => ({ ...s, voiceRate }));
  }, []);

  /**
   * What the app considers you to be "at". Prefers whatever is being spoken
   * about so the card does not change out from under the narration, then falls
   * back to the nearest thing in range.
   */
  const focus: Subject | null = useMemo(() => {
    if (speaking?.subject) return speaking.subject;
    const nearest = estimate?.nearby[0];
    if (nearest && nearest.distanceM <= nearest.subject.radiusM) {
      return nearest.subject;
    }
    return null;
  }, [speaking, estimate]);

  const talkFraction = elapsedSec > 0 ? Math.min(1, spokenSec / elapsedSec) : 0;

  const state: WanderState = {
    phase,
    error,
    content,
    pack,
    areas,
    nearestPack,
    progress,
    estimate,
    speaking,
    spokenChars,
    history,
    focus,
    scale: focus?.scale ?? null,
    source,
    settings,
    talkFraction,
    directorState,
    voiceBackend,
    startedAt,
  };

  return {
    ...state,
    start,
    stop,
    skip,
    tellMeMore,
    setDensity,
    setLensWeight,
    toggleCaptions,
    setVoiceRate,
  };
}
