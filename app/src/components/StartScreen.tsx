import { useEffect, useState } from "react";

import { geminiKey, setGeminiKey } from "../lib/content";
import styles from "./StartScreen.module.css";
import type { AreaIndex, Source } from "../lib/types";

type PermissionState = "unknown" | "granted" | "prompt" | "denied";

interface Props {
  areas: AreaIndex | null;
  phase: string;
  /** What the app is busy doing, shown in place of the button label. */
  progress: string | null;
  error: string | null;
  onStart: (mode: Source) => void;
}

/**
 * The start screen has one job beyond starting: set expectations honestly.
 *
 * It cannot name the area any more, because where you are is not known until
 * you press the button and a fix arrives. So instead of promising one prepared
 * place it explains the ladder — prepared areas are best, anywhere else falls
 * back to what can be read live — and says which rung you are likely to get.
 */
export function StartScreen({ areas, phase, progress, error, onStart }: Props) {
  const [location, setLocation] = useState<PermissionState>("unknown");
  const [voices, setVoices] = useState(0);
  const [key, setKey] = useState<string | null>(() => geminiKey());
  const [editingKey, setEditingKey] = useState(false);
  const [draftKey, setDraftKey] = useState("");

  useEffect(() => {
    // The Permissions API lets us show current state without triggering a prompt.
    if (!navigator.permissions?.query) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        setLocation(status.state as PermissionState);
        status.onchange = () => setLocation(status.state as PermissionState);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const read = () => setVoices(synth.getVoices().length);
    read();
    synth.addEventListener?.("voiceschanged", read);
    return () => synth.removeEventListener?.("voiceschanged", read);
  }, []);

  const prepared = areas?.areas ?? [];
  const beats = prepared.reduce((t, a) => t + a.beats, 0);

  const busy =
    phase === "loading" || phase === "locating" || phase === "resolving";
  const ready = !busy;

  const saveKey = () => {
    const trimmed = draftKey.trim();
    setGeminiKey(trimmed || null);
    setKey(trimmed || null);
    setDraftKey("");
    setEditingKey(false);
  };

  return (
    <div className={styles.screen}>
      <header className={styles.masthead}>
        <div className={styles.wordmark}>
          dweller<span>.</span>
        </div>
        <div className="label">self-guided</div>
      </header>

      <div className={styles.middle}>
        <div className={styles.eyebrow}>Anywhere you walk</div>
        <h1 className={styles.areaName}>Wherever you are</h1>
        <p className={styles.blurb}>
          Put the phone in your pocket and walk. It watches where you are, how
          fast you are going and which way you are facing, and talks when there
          is something worth saying.
        </p>

        <div className={styles.coverage}>
          <div className={styles.covRow}>
            <span className={styles.covDot} data-state="ok" />
            <span className={styles.covName}>
              {prepared.length
                ? prepared.map((a) => a.name).join(", ")
                : "No prepared areas in this build"}
            </span>
            <span className={styles.covNote}>
              {prepared.length ? `${beats} written beats` : "—"}
            </span>
          </div>
          <div className={styles.covRow}>
            <span className={styles.covDot} data-state={key ? "ok" : "warn"} />
            <span className={styles.covName}>Everywhere else</span>
            <span className={styles.covNote}>
              {key ? "written live" : "read from Wikipedia"}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.bottom}>
        {error && <div className={styles.error}>{error}</div>}

        {phase === "denied" && (
          <div className={styles.recover}>
            Location is blocked for this site. Open the padlock in the address
            bar, allow location, then reload.
          </div>
        )}

        <div className={styles.permissions}>
          <div className={styles.permRow}>
            <span
              className={styles.permDot}
              data-state={
                location === "granted"
                  ? "ok"
                  : location === "denied"
                    ? "warn"
                    : undefined
              }
            />
            <span className={styles.permName}>Location</span>
            <span className={styles.permNote}>
              {location === "granted"
                ? "allowed"
                : location === "denied"
                  ? "blocked — required"
                  : "asked on start"}
            </span>
          </div>
          <div className={styles.permRow}>
            <span className={styles.permDot} data-state="warn" />
            <span className={styles.permName}>Compass</span>
            <span className={styles.permNote}>
              optional — enables &ldquo;on your left&rdquo;
            </span>
          </div>
          <div className={styles.permRow}>
            <span
              className={styles.permDot}
              data-state={voices > 0 ? "ok" : "warn"}
            />
            <span className={styles.permName}>Voice</span>
            <span className={styles.permNote}>
              {voices > 0 ? `${voices} available` : "on-device, no key needed"}
            </span>
          </div>
          <button
            className={styles.permRow}
            onClick={() => {
              setEditingKey((v) => !v);
              setDraftKey("");
            }}
          >
            <span
              className={styles.permDot}
              data-state={key ? "ok" : undefined}
            />
            <span className={styles.permName}>Gemini key</span>
            <span className={styles.permNote}>
              {key ? "set — tap to change" : "optional — better writing"}
            </span>
          </button>
        </div>

        {editingKey && (
          <div className={styles.keyEditor}>
            <input
              className={styles.keyInput}
              type="password"
              inputMode="text"
              autoComplete="off"
              placeholder="Paste a Gemini API key"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
            />
            <button className={styles.keySave} onClick={saveKey}>
              {draftKey.trim() ? "Save" : "Clear"}
            </button>
          </div>
        )}

        <button
          className={styles.begin}
          disabled={!ready}
          onClick={() => onStart("gps")}
        >
          {busy ? (progress ?? "Preparing…") : "Begin the walk"}
        </button>

        <button
          className={styles.secondary}
          disabled={busy}
          onClick={() => onStart("demo")}
        >
          Play a simulated walk instead
        </button>
      </div>
    </div>
  );
}
