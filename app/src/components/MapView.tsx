import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MlMap, Marker, setWorkerUrl } from "maplibre-gl";
import type {
  GeoJSONSource,
  LayerSpecification,
  MapTouchEvent,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

import styles from "./MapView.module.css";
import { ATTRIBUTION, circlePolygon, empty, styleUrl } from "../lib/mapStyle";
import { scaleOf } from "../lib/types";
import type { LonLat, PathGraph, Subject } from "../lib/types";

export interface MapViewProps {
  coord: LonLat | null;
  accuracyM: number | null;
  /** Degrees from north, or null when the phone will not say. */
  facingDeg: number | null;
  subjects: Subject[];
  focusId: string | null;
  heardIds: Set<string>;
  /**
   * Which subjects get their name drawn. DOM markers do not collide-avoid the
   * way GL symbol layers do, so twenty names at walking zoom overlap into an
   * unreadable pile; everything else is left as a dot.
   */
  labelIds: Set<string>;
  paths: PathGraph | null;
  theme: "night" | "day";
  /** Rotate the map so your heading points up the screen. */
  headingUp: boolean;
  onSelectSubject?: (id: string) => void;
}

/**
 * Point MapLibre at its own tile-parsing worker.
 *
 * Left alone, MapLibre finds the worker with
 * `new URL("./maplibre-gl-worker.mjs", import.meta.url)`. A bundler cannot see
 * through that, so the file is never emitted and the built app asks for
 * `/assets/maplibre-gl-worker.mjs`, gets a 404, and shows a blank map — with no
 * console error and no tile requests at all, because it is the worker that
 * fetches tiles. Dev is fine, which makes it a build-only failure and easy to
 * ship.
 *
 * `?worker&url` rather than plain `?url`: the worker imports MapLibre's shared
 * chunk, and `?url` copies the file verbatim, leaving a bare relative import
 * that resolves to nothing from `/assets/`. The `worker` half bundles those
 * dependencies in; the `url` half returns a path instead of a constructor,
 * which is what `setWorkerUrl` wants.
 */
setWorkerUrl(workerUrl);

/** Zoom used when the map first locks on, and when you press recentre. */
const CLOSE_ZOOM = 17.4;

/**
 * Above this the range ring stops being a useful hint and becomes a wash over
 * the whole map. Squares and campuses are the cases that cross it.
 */
const RANGE_RING_MAX_M = 90;

export function MapView({
  coord,
  accuracyM,
  facingDeg,
  subjects,
  focusId,
  heardIds,
  labelIds,
  paths,
  theme,
  headingUp,
  onSelectSubject,
}: MapViewProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<MlMap | null>(null);
  const puck = useRef<Marker | null>(null);
  const labels = useRef(new Map<string, Marker>());
  /** Has a real position ever arrived? Distinguishes the first fix from a move. */
  const located = useRef(false);
  const [ready, setReady] = useState(false);

  /**
   * Whether the camera is still tied to you. Any pan or pinch hands control to
   * the walker — a map that fights you back is the single most irritating thing
   * a map can do — and the recentre button takes it back.
   */
  const [following, setFollowing] = useState(true);

  /* ------------------------------------------------------------- setup --- */

  useEffect(() => {
    if (!host.current || map.current) return;

    const m = new MlMap({
      container: host.current,
      style: styleUrl(theme),
      center: coord ?? [0, 20],
      zoom: coord ? CLOSE_ZOOM : 1.4,
      attributionControl: { compact: true, customAttribution: ATTRIBUTION },
      // The interface owns the corners, so MapLibre's own furniture is off and
      // replaced by controls that match the rest of the app.
      logoPosition: "bottom-left",
      pitchWithRotate: false,
      dragRotate: false,
      // A walking map is read at a glance; inertia that keeps sliding after the
      // thumb lifts makes it hard to put a place back under your finger.
      dragPan: { deceleration: 1400 },
    });
    map.current = m;

    m.on("load", () => {
      addLayers(m, theme);
      setReady(true);
    });

    // Only a deliberate gesture drops follow, which means listening for the
    // gestures themselves rather than for the camera moving. Rotation is the
    // trap here: following the compass changes the bearing constantly, and
    // `rotatestart` cannot tell our easeTo from a two-finger twist, so the map
    // would unfollow itself a second after locking on.
    m.on("dragstart", () => setFollowing(false));
    m.on("wheel", () => setFollowing(false));
    m.on("touchmove", (e: MapTouchEvent) => {
      if (e.originalEvent.touches.length > 1) setFollowing(false);
    });

    // The Map instance is created once and never reassigned, so capturing it
    // here is what the cleanup should act on. Marker DOM lives inside the map's
    // container and goes with it; the refs are cleared so a remount rebuilds.
    const markers = labels.current;
    return () => {
      m.remove();
      markers.clear();
      puck.current = null;
      map.current = null;
      setReady(false);
    };
    // Theme changes are handled by their own effect; re-creating the map here
    // would throw away tiles already fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------------------------------------------- theme --- */

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    m.setStyle(styleUrl(theme));
    // setStyle drops every layer we added, so they go back on once the new
    // style settles. `styledata` fires after that swap.
    const restore = () => {
      addLayers(m, theme);
      m.off("styledata", restore);
    };
    m.on("styledata", restore);
  }, [theme, ready]);

  /* ------------------------------------------------------------- camera --- */

  useEffect(() => {
    const m = map.current;
    if (!m || !coord) return;

    // The map is built before the first fix exists, so it starts on a view of
    // the whole world. Arriving at the first coordinate is a jump, not an ease:
    // animating across a continent is a pointless three seconds, and it has to
    // happen whether or not the camera is following.
    if (!located.current) {
      located.current = true;
      m.jumpTo({
        center: coord,
        zoom: CLOSE_ZOOM,
        bearing: headingUp && facingDeg != null ? facingDeg : 0,
      });
      return;
    }

    if (!following) return;
    m.easeTo({
      center: coord,
      bearing: headingUp && facingDeg != null ? facingDeg : m.getBearing(),
      // Matched to the roughly one-second cadence of position fixes, so the
      // camera glides continuously instead of stepping.
      duration: 900,
      easing: (t) => t,
    });
  }, [coord, facingDeg, following, headingUp]);

  /* --------------------------------------------------------------- puck --- */

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !coord) return;

    if (!puck.current) {
      const el = document.createElement("div");
      el.className = styles.puck;
      el.innerHTML = `<div class="${styles.puckCone}"></div><div class="${styles.puckDot}"></div>`;
      puck.current = new Marker({
        element: el,
        // Pinned to the map so the heading cone points at real streets rather
        // than rotating with the screen.
        rotationAlignment: "map",
        pitchAlignment: "map",
      })
        .setLngLat(coord)
        .addTo(m);
    } else {
      puck.current.setLngLat(coord);
    }

    const el = puck.current.getElement();
    el.dataset.heading = facingDeg == null ? "unknown" : "known";
    puck.current.setRotation(facingDeg ?? 0);
  }, [coord, facingDeg, ready]);

  /* ------------------------------------------------------------ accuracy --- */

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const src = m.getSource("accuracy") as GeoJSONSource | undefined;
    if (!src) return;
    src.setData(
      coord && accuracyM != null && accuracyM > 1
        ? {
            type: "FeatureCollection",
            features: [circlePolygon(coord, accuracyM)],
          }
        : empty(),
    );
  }, [coord, accuracyM, ready]);

  /* --------------------------------------------------------------- paths --- */

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const src = m.getSource("paths") as GeoJSONSource | undefined;
    if (!src) return;

    if (!paths || !paths.segments.length) {
      src.setData(empty());
      return;
    }
    src.setData({
      type: "FeatureCollection",
      features: paths.segments.map((s) => ({
        type: "Feature" as const,
        properties: { kind: s.w },
        geometry: {
          type: "LineString" as const,
          coordinates: [paths.nodes[s.a], paths.nodes[s.b]],
        },
      })),
    });
  }, [paths, ready]);

  /* ------------------------------------------------------------ subjects --- */

  const focused = useMemo(
    () => subjects.find((s) => s.id === focusId) ?? null,
    [subjects, focusId],
  );

  /** Footprints, and the range ring around whatever is being talked about. */
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    const shapes = m.getSource("shapes") as GeoJSONSource | undefined;
    if (shapes) {
      shapes.setData({
        type: "FeatureCollection",
        features: subjects
          .filter((s) => s.footprint && s.footprint.length > 2)
          .map((s) => ({
            type: "Feature" as const,
            properties: {
              focused: s.id === focusId ? 1 : 0,
              heard: heardIds.has(s.id) ? 1 : 0,
            },
            geometry: {
              type: "Polygon" as const,
              coordinates: [closeRing(s.footprint!)],
            },
          })),
      });
    }

    const range = m.getSource("range") as GeoJSONSource | undefined;
    if (range) {
      // Only where the ring says something. A circle around "Massachusetts" is
      // bigger than the screen, and even a large site like a square fills the
      // view with a wash that reads as an alert rather than as a radius.
      const show =
        focused &&
        scaleOf(focused) === "site" &&
        focused.radiusM <= RANGE_RING_MAX_M;
      range.setData(
        show
          ? {
              type: "FeatureCollection",
              features: [circlePolygon(focused!.center, focused!.radiusM)],
            }
          : empty(),
      );
    }
  }, [subjects, focusId, heardIds, focused, ready]);

  /** Name pins as DOM markers, so they use the app's own type. */
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    const wanted = new Set<string>();
    for (const s of subjects) {
      // Coarse tiers have no meaningful point on the ground — the "centre" of
      // your neighbourhood is wherever you happened to be standing — so
      // pinning them would draw a landmark that does not exist.
      if (scaleOf(s) !== "site" && scaleOf(s) !== "place") continue;
      wanted.add(s.id);

      let marker = labels.current.get(s.id);
      if (!marker) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = styles.pin;
        el.innerHTML = `<span class="${styles.pinDot}"></span><span class="${styles.pinName}"></span>`;
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelectSubject?.(s.id);
        });
        marker = new Marker({ element: el, anchor: "left" })
          .setLngLat(s.center)
          .addTo(m);
        labels.current.set(s.id, marker);
      }

      const el = marker.getElement();
      const name = el.querySelector(`.${styles.pinName}`);
      if (name) name.textContent = s.name;
      el.dataset.scale = scaleOf(s);
      el.dataset.state =
        s.id === focusId ? "focus" : heardIds.has(s.id) ? "heard" : "unheard";
      el.dataset.named = String(labelIds.has(s.id) || s.id === focusId);
      el.setAttribute("aria-label", s.name);
      marker.setLngLat(s.center);
    }

    for (const [id, marker] of labels.current) {
      if (wanted.has(id)) continue;
      marker.remove();
      labels.current.delete(id);
    }
  }, [subjects, focusId, heardIds, labelIds, ready, onSelectSubject]);

  /* ------------------------------------------------------------ controls --- */

  const recenter = () => {
    const m = map.current;
    if (!m || !coord) return;
    setFollowing(true);
    m.easeTo({
      center: coord,
      zoom: Math.max(m.getZoom(), CLOSE_ZOOM),
      bearing: headingUp && facingDeg != null ? facingDeg : 0,
      duration: 620,
    });
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.canvas} ref={host} />
      {!following && (
        <button
          className={styles.recenter}
          onClick={recenter}
          aria-label="Recentre on me"
        >
          <Crosshair />
          <span>Recentre</span>
        </button>
      )}
    </div>
  );
}

/** Polygons must close. OSM footprints usually do; some do not. */
function closeRing(ring: LonLat[]): LonLat[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

/**
 * Every source and layer the map draws on top of the tiles. Called on first
 * load and again after any style swap, so it must tolerate being re-run.
 */
function addLayers(m: MlMap, theme: "night" | "day") {
  const night = theme === "night";
  const signal = night ? "#e8a33d" : "#b4761b";
  const faint = night ? "rgba(232,163,61,0.30)" : "rgba(180,118,27,0.34)";

  const source = (id: string) => {
    if (!m.getSource(id)) {
      m.addSource(id, { type: "geojson", data: empty() });
    }
  };
  for (const id of ["accuracy", "paths", "shapes", "range"]) source(id);

  const layer = (spec: LayerSpecification) => {
    if (!m.getLayer(spec.id)) m.addLayer(spec);
  };

  layer({
    id: "paths-line",
    type: "line",
    source: "paths",
    paint: {
      "line-color": faint,
      "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 18, 2.4],
      "line-dasharray": [2, 2],
    },
  });

  // A dashed outline and no fill. The fill was the mistake in the first pass:
  // any opacity readable at a glance also tinted a third of the map.
  layer({
    id: "range-line",
    type: "line",
    source: "range",
    paint: {
      "line-color": signal,
      "line-width": 1,
      "line-opacity": 0.3,
      "line-dasharray": [2, 4],
    },
  });

  layer({
    id: "shapes-fill",
    type: "fill",
    source: "shapes",
    paint: {
      "fill-color": ["case", ["==", ["get", "focused"], 1], signal, "#8d8578"],
      "fill-opacity": [
        "case",
        ["==", ["get", "focused"], 1],
        0.3,
        ["==", ["get", "heard"], 1],
        0.14,
        0.09,
      ],
    },
  });
  layer({
    id: "shapes-line",
    type: "line",
    source: "shapes",
    paint: {
      "line-color": ["case", ["==", ["get", "focused"], 1], signal, "#a49b8c"],
      "line-width": ["case", ["==", ["get", "focused"], 1], 1.8, 0.7],
      "line-opacity": ["case", ["==", ["get", "focused"], 1], 0.95, 0.45],
    },
  });

  // Above the buildings: where you are must never be hidden by what you are
  // being told about.
  layer({
    id: "accuracy-fill",
    type: "fill",
    source: "accuracy",
    paint: { "fill-color": signal, "fill-opacity": 0.06 },
  });
  layer({
    id: "accuracy-line",
    type: "line",
    source: "accuracy",
    paint: { "line-color": signal, "line-width": 1, "line-opacity": 0.18 },
  });
}

function Crosshair() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="10" cy="10" r="5.2" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <path
        d="M10 1.6v2.6M10 15.8v2.6M1.6 10h2.6M15.8 10h2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
