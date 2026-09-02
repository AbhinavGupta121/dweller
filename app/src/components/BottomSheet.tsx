import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";

import styles from "./BottomSheet.module.css";

export interface BottomSheetProps {
  /**
   * Expanded heights as fractions of the viewport, ascending. The collapsed
   * stop is not listed: it is measured from the header, because a fraction that
   * fits the header on one phone crops it on the next.
   */
  snaps: number[];
  index: number;
  onIndex: (index: number) => void;
  /** Always visible, and the only region that drags. */
  header: ReactNode;
  children: ReactNode;
  label: string;
}

/**
 * The map is the app's ground and this is everything else, resting on it.
 *
 * Only the header drags. Letting the whole sheet drag means every attempt to
 * scroll a long list is a coin flip between scrolling and resizing, and the
 * usual fix — drag only when the content is already scrolled to the top — still
 * misfires on the first flick. A dedicated grip is duller and always right.
 */
export function BottomSheet({
  snaps,
  index,
  onIndex,
  header,
  children,
  label,
}: BottomSheetProps) {
  const sheet = useRef<HTMLElement | null>(null);
  const grip = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    startY: number;
    startH: number;
    lastY: number;
    lastT: number;
    vy: number;
  } | null>(null);

  /**
   * Every stop as a fraction of the viewport, with the collapsed one measured
   * from the header rather than listed. A fixed fraction that fits the header on
   * one phone crops it on the next, and a cropped header means a half-visible
   * row of tabs, which looks like a bug.
   */
  const fractions = useCallback((): number[] => {
    const vh = window.innerHeight;
    const header = grip.current?.offsetHeight ?? 0;
    // Falls back to a guess only on the very first paint, before layout.
    const peek = header > 0 ? (header + 8) / vh : 0.22;
    // Never let the collapsed stop reach the first expanded one, or the sheet
    // has two stops that look identical and a drag between them does nothing.
    return [Math.min(peek, snaps[0] * 0.85), ...snaps];
  }, [snaps]);

  const heightFor = useCallback(
    (i: number) => {
      const all = fractions();
      return all[Math.max(0, Math.min(all.length - 1, i))] * window.innerHeight;
    },
    [fractions],
  );

  // The committed height lives in CSS so transitions are the browser's job.
  useEffect(() => {
    const el = sheet.current;
    if (!el || drag.current) return;
    el.style.height = `${heightFor(index)}px`;
  }, [index, heightFor]);

  useEffect(() => {
    const onResize = () => {
      const el = sheet.current;
      if (el && !drag.current) el.style.height = `${heightFor(index)}px`;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [index, heightFor]);

  const onPointerDown = (e: React.PointerEvent) => {
    // Buttons inside the header must stay pressable.
    if ((e.target as HTMLElement).closest("button,a,input")) return;
    const el = sheet.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      startY: e.clientY,
      startH: el.getBoundingClientRect().height,
      lastY: e.clientY,
      lastT: performance.now(),
      vy: 0,
    };
    el.dataset.dragging = "true";
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = sheet.current;
    if (!d || !el) return;
    const now = performance.now();
    const dt = Math.max(now - d.lastT, 1);
    d.vy = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = now;

    const vh = window.innerHeight;
    const all = fractions();
    const min = all[0] * vh;
    const max = all[all.length - 1] * vh;
    const raw = d.startH + (d.startY - e.clientY);
    // Rubber-banding past the ends, so the limits feel like limits rather than
    // like the drag broke.
    const clamped =
      raw > max
        ? max + (raw - max) * 0.22
        : raw < min
          ? min - (min - raw) * 0.22
          : raw;
    el.style.height = `${clamped}px`;
  };

  const onPointerUp = () => {
    const d = drag.current;
    const el = sheet.current;
    if (!d || !el) return;
    const height = el.getBoundingClientRect().height;
    drag.current = null;
    delete el.dataset.dragging;

    // A fast flick should carry to the next stop even from barely moved, which
    // is what makes the sheet feel physical instead of like a slider.
    const all = fractions();
    const flick = Math.abs(d.vy) > 0.55 ? (d.vy < 0 ? 1 : -1) : 0;
    const from = nearest(all, height / window.innerHeight);
    const next = Math.max(0, Math.min(all.length - 1, from + flick));
    el.style.height = `${heightFor(next)}px`;
    onIndex(next);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onIndex(Math.min(snaps.length, index + 1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onIndex(Math.max(0, index - 1));
    } else if (e.key === "Escape") {
      onIndex(0);
    }
  };

  return (
    <section
      className={styles.sheet}
      ref={sheet}
      aria-label={label}
      data-expanded={index > 0}
    >
      <div
        className={styles.grip}
        ref={grip}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        role="slider"
        tabIndex={0}
        aria-label="Sheet height"
        aria-valuenow={index}
        aria-valuemin={0}
        aria-valuemax={snaps.length}
      >
        <span className={styles.grabber} aria-hidden="true" />
        {header}
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

function nearest(snaps: number[], value: number): number {
  let best = 0;
  let bestGap = Infinity;
  for (let i = 0; i < snaps.length; i++) {
    const gap = Math.abs(snaps[i] - value);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return best;
}
