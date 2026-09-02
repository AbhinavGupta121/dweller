import { useEffect, useRef } from "react";

interface Props {
  /** Beats remaining at this subject, by depth. */
  remaining: { depth: 1 | 2 | 3; count: number }[];
  /** 0..1 through the current utterance, or null when silent. */
  progress: number | null;
  /** Bearing to the subject relative to your facing, or null if unknown. */
  relativeDeg: number | null;
  size?: number;
}

const TAU = Math.PI * 2;

/**
 * The one piece of ambient instrumentation in the app.
 *
 * Three concentric arcs, one per depth, showing how much unheard material is
 * left where you are standing — this is what tells you whether it is worth
 * stopping. A filled arc tracks the current sentence, and a single tick marks
 * the direction of the subject being described so you know where to look.
 *
 * Drawn on canvas rather than SVG because it animates every frame while speaking
 * and this keeps it off the main thread's layout path.
 */
export function DepthRing({
  remaining,
  progress,
  relativeDeg,
  size = 132,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Capped at 3: past that the extra pixels cost more than they show, and
    // some Android phones report ratios above 4.
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    const style = getComputedStyle(document.documentElement);
    const signal = style.getPropertyValue("--signal").trim() || "#e8a33d";
    const dim = style.getPropertyValue("--signal-dim").trim() || "#6b4d1e";
    const hairline = style.getPropertyValue("--hairline").trim() || "#2a2a2e";

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;

    // Outer ring is the shallow material, inner rings the deeper stuff, so the
    // ring visibly "thickens inward" when there is a lot to say here.
    const radii = [size / 2 - 7, size / 2 - 17, size / 2 - 27];

    radii.forEach((radius, i) => {
      const depth = (i + 1) as 1 | 2 | 3;
      const entry = remaining.find((r) => r.depth === depth);
      const count = entry?.count ?? 0;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TAU);
      ctx.strokeStyle = hairline;
      ctx.lineWidth = 2;
      ctx.stroke();

      if (count <= 0) return;

      // Each remaining beat is a dash. Four or more reads as a full ring, which
      // is the right signal: "there is plenty here".
      const shown = Math.min(count, 6);
      const gap = 0.13;
      const arc = (TAU - shown * gap) / shown;
      for (let k = 0; k < shown; k++) {
        const from = -Math.PI / 2 + k * (arc + gap);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, from, from + arc);
        ctx.strokeStyle = depth === 1 ? signal : dim;
        ctx.lineWidth = depth === 1 ? 2.5 : 2;
        ctx.stroke();
      }
    });

    if (progress != null) {
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        radii[0] + 5,
        -Math.PI / 2,
        -Math.PI / 2 + TAU * Math.max(0, Math.min(1, progress)),
      );
      ctx.strokeStyle = signal;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    if (relativeDeg != null) {
      const rad = (relativeDeg * Math.PI) / 180 - Math.PI / 2;
      const inner = radii[0] - 4;
      const outer = radii[0] + 8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(rad) * inner, cy + Math.sin(rad) * inner);
      ctx.lineTo(cx + Math.cos(rad) * outer, cy + Math.sin(rad) * outer);
      ctx.strokeStyle = signal;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.stroke();
    }
  }, [remaining, progress, relativeDeg, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, display: "block" }}
      aria-hidden="true"
    />
  );
}
