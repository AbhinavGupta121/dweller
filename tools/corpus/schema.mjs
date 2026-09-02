/**
 * Beat schema, duration model and validator.
 *
 * A beat is one speakable unit — the smallest thing the narrator can say and
 * then stop cleanly. Beats are deliberately small so the director can fit
 * speech into the time you will actually be standing somewhere, and can stop
 * without cutting you off mid-thought.
 */

/** Angles are the lenses on a subject. The director picks by your interests. */
export const ANGLES = [
  "history", // what happened here
  "architecture", // why it looks like that
  "science", // how it works, what was discovered
  "people", // who did it, who lived it
  "mythbust", // what everyone gets wrong
  "present", // what it is today, what is happening now
  "detail", // the small physical thing to go and look at
];

/**
 * Depths map to how long you are likely to stay.
 *   1 — glance. Said while you are still walking. One idea.
 *   2 — normal. You have slowed or stopped. A short story.
 *   3 — deep. You are dwelling. The full thing, with texture.
 */
export const DEPTHS = [1, 2, 3];

/**
 * Words per second for a measured narrator. Web Speech at rate 1.0 and most
 * neural TTS both land near this. Used to estimate beat duration so the
 * director can decide whether a beat fits the time available.
 */
export const WORDS_PER_SEC = 2.6;

/** Rough spoken length in seconds, rounded up to the nearest second. */
export function estimateSeconds(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / WORDS_PER_SEC);
}

const DEPTH_BUDGET = {
  1: [6, 20],
  2: [16, 42],
  3: [34, 95],
};

/**
 * Validate and normalise one area's beats. Returns { beats, errors, warnings }.
 * Durations are computed here rather than hand-written so they cannot drift
 * away from the text.
 */
export function compileBeats(rawBeats, subjects) {
  const errors = [];
  const warnings = [];
  const byId = new Map();
  const subjectIds = new Set(subjects.map((s) => s.id));

  const beats = rawBeats.map((b, i) => {
    const where = b.id ?? `#${i}`;

    if (!b.id) errors.push(`beat ${where}: missing id`);
    if (byId.has(b.id)) errors.push(`beat ${where}: duplicate id`);
    if (!subjectIds.has(b.subject)) {
      errors.push(`beat ${where}: unknown subject "${b.subject}"`);
    }
    if (!ANGLES.includes(b.angle)) {
      errors.push(`beat ${where}: bad angle "${b.angle}"`);
    }
    if (!DEPTHS.includes(b.depth)) {
      errors.push(`beat ${where}: bad depth "${b.depth}"`);
    }
    if (!b.text || b.text.length < 10) {
      errors.push(`beat ${where}: missing text`);
    }
    if (!b.sources?.length) {
      warnings.push(`beat ${where}: no sources`);
    }

    const sec = estimateSeconds(b.text ?? "");
    const [lo, hi] = DEPTH_BUDGET[b.depth] ?? [0, Infinity];
    if (sec < lo || sec > hi) {
      warnings.push(
        `beat ${where}: ${sec}s is outside the depth-${b.depth} budget ${lo}–${hi}s`,
      );
    }

    // Beats are read aloud, so anything the voice cannot pronounce is a bug.
    const unspeakable = (b.text ?? "").match(/[#*_|<>{}\[\]]|\b\d{4,}\b/g);
    if (unspeakable) {
      warnings.push(
        `beat ${where}: hard to speak: ${[...new Set(unspeakable)].join(" ")}`,
      );
    }

    const beat = {
      id: b.id,
      subject: b.subject,
      angle: b.angle,
      depth: b.depth,
      text: b.text.replace(/\s+/g, " ").trim(),
      sec,
      arrival: b.arrival ?? false,
      look: b.look ?? null,
      tags: b.tags ?? [],
      requires: b.requires ?? [],
      excludes: b.excludes ?? [],
      sources: b.sources ?? [],
    };
    byId.set(b.id, beat);
    return beat;
  });

  // Cross-references must resolve, or the director will silently drop beats.
  for (const b of beats) {
    for (const r of b.requires) {
      if (!byId.has(r)) errors.push(`beat ${b.id}: requires unknown "${r}"`);
    }
    for (const x of b.excludes) {
      if (!byId.has(x)) errors.push(`beat ${b.id}: excludes unknown "${x}"`);
    }
  }

  // Every subject needs something sayable the moment you walk up to it.
  for (const s of subjects) {
    const mine = beats.filter((b) => b.subject === s.id);
    if (!mine.length) {
      errors.push(`subject ${s.id}: no beats`);
      continue;
    }
    if (!mine.some((b) => b.arrival && b.depth === 1)) {
      errors.push(`subject ${s.id}: no depth-1 arrival beat`);
    }
    if (!mine.some((b) => b.depth >= 2)) {
      warnings.push(`subject ${s.id}: nothing to say if you stop`);
    }
  }

  return { beats, errors, warnings };
}
