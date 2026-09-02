/**
 * Grader: scores generated beats against the narrator's voice, and reports which
 * ones are worth promoting into tools/corpus/.
 *
 *   node tools/gemini/grade.mjs harvard-yard
 *   node tools/gemini/grade.mjs harvard-yard --promote 4   # emit a corpus file
 *
 * Fact-checking answers "is this true". Grading answers the harder question,
 * "is this worth hearing" — the thing that actually decides whether the app is
 * good. Beats that pass factcheck but score badly here are the ones that make a
 * tour feel like a Wikipedia reading.
 *
 * Deterministic checks run first and never cost a call: length against the
 * depth budget, banned tour-guide vocabulary, unspeakable characters.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generate, QuotaExhausted } from "./client.mjs";
import { PERSONA } from "./persona.mjs";
import { estimateSeconds } from "../corpus/schema.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

const DEPTH_BUDGET = { 1: [6, 20], 2: [16, 42], 3: [34, 95] };

/** Vocabulary that marks prose as brochure copy rather than a person talking. */
const BANNED = [
  "nestled", "iconic", "steeped in", "boasts", "a testament to",
  "let's take a moment", "as we make our way", "world-renowned",
  "hustle and bustle", "hidden gem", "must-see", "breathtaking",
  "rich history", "stands as", "no visit", "beloved", "vibrant",
];

const GRADE_SCHEMA = {
  type: "object",
  properties: {
    grades: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          specific: {
            type: "integer",
            description: "1-5. Could this only have been written about this place?",
          },
          worthSaying: {
            type: "integer",
            description: "1-5. Would the listener repeat this to someone later?",
          },
          voice: {
            type: "integer",
            description: "1-5. Does it sound like the narrator, not a brochure?",
          },
          speakable: {
            type: "integer",
            description: "1-5. Does it work heard once, with no rereading?",
          },
          verdict: { type: "string", enum: ["promote", "revise", "cut"] },
          fix: {
            type: "string",
            description: "one concrete edit, or empty if promoting",
          },
        },
        required: ["id", "specific", "worthSaying", "voice", "speakable", "verdict", "fix"],
      },
    },
  },
  required: ["grades"],
};

const SYSTEM = `
${PERSONA}

You are now the editor, not the writer. Grade beats written for this narrator.
Be hard to please. A beat that merely states correct information is a 2 on
worthSaying, not a 4. Reserve 5s for prose you would keep verbatim.

Cut anything that reads like a plaque, restates the building's name as its own
fact, or would be equally true of a hundred other buildings.
`.trim();

function localProblems(beat) {
  const problems = [];
  const sec = estimateSeconds(beat.text);
  const [lo, hi] = DEPTH_BUDGET[beat.depth] ?? [0, Infinity];
  if (sec < lo || sec > hi) {
    problems.push(`${sec}s is outside the depth-${beat.depth} budget ${lo}-${hi}s`);
  }

  const lower = beat.text.toLowerCase();
  for (const phrase of BANNED) {
    if (lower.includes(phrase)) problems.push(`banned phrase "${phrase}"`);
  }

  const unspeakable = beat.text.match(/[#*_|<>{}[\]()]|\b\d{4,}\b/g);
  if (unspeakable) {
    problems.push(`unspeakable: ${[...new Set(unspeakable)].join(" ")}`);
  }

  if (beat.arrival && beat.depth !== 1) {
    problems.push("arrival beats should be depth 1");
  }

  return problems;
}

async function gradeSubject(data) {
  const listing = data.beats
    .map(
      (b) =>
        `id: ${b.id}\nangle: ${b.angle}  depth: ${b.depth}  arrival: ${b.arrival}\n${b.text}`,
    )
    .join("\n\n---\n\n");

  const result = await generate({
    system: SYSTEM,
    prompt: `Grade each beat below.\n\n${listing}`,
    schema: GRADE_SCHEMA,
    temperature: 0.2,
  });

  const byId = new Map((result.grades ?? []).map((g) => [g.id, g]));
  for (const beat of data.beats) {
    const g = byId.get(beat.id);
    const problems = localProblems(beat);
    const score = g
      ? g.specific + g.worthSaying + g.voice + g.speakable
      : 0;
    beat.grade = {
      ...(g ?? {}),
      score,
      problems,
      // Local problems are objective, so they override an optimistic model.
      verdict: problems.length ? "revise" : (g?.verdict ?? "cut"),
      at: new Date().toISOString(),
    };
  }
}

/**
 * Emit a corpus-shaped file from the beats that cleared both gates, ready for a
 * human to read through and move into tools/corpus/.
 */
function promote(area, files, minScore) {
  const kept = [];
  for (const data of files) {
    for (const beat of data.beats) {
      const factOk = beat.check?.verdict === "supported";
      const gradeOk =
        beat.grade?.verdict === "promote" && (beat.grade?.score ?? 0) >= minScore * 4;
      if (factOk && gradeOk) {
        kept.push({
          id: beat.id,
          subject: beat.subject,
          angle: beat.angle,
          depth: beat.depth,
          arrival: beat.arrival,
          text: beat.text,
          look: beat.look,
          sources: beat.sources,
        });
      }
    }
  }

  const out = `/**
 * Machine-drafted beats for ${area}, fact-checked and graded.
 *
 * Generated by tools/gemini/. Read every line before wiring this into
 * tools/corpus/index.mjs — the pipeline is a first draft, not an author.
 */

export const beats = ${JSON.stringify(kept, null, 2)};
`;
  const path = resolve(ROOT, "tools/generated", area, "promoted.mjs");
  writeFileSync(path, out);
  return { count: kept.length, path };
}

async function main() {
  const args = process.argv.slice(2);
  const area = args[0];
  if (!area) {
    console.error("usage: node tools/gemini/grade.mjs <area> [--promote MIN]");
    process.exit(1);
  }
  const pIndex = args.indexOf("--promote");
  const minScore = pIndex >= 0 ? Number(args[pIndex + 1] ?? 4) : null;

  const genDir = resolve(ROOT, "tools/generated", area);
  if (!existsSync(genDir)) {
    throw new Error(`Nothing generated for "${area}". Run write.mjs first.`);
  }

  const names = readdirSync(genDir).filter(
    (f) => f.endsWith(".json") && f !== "promoted.mjs",
  );
  const loaded = [];

  for (const name of names) {
    const path = resolve(genDir, name);
    const data = JSON.parse(readFileSync(path, "utf8"));
    const needs = data.beats.some((b) => !b.grade) || process.env.REGRADE;

    if (needs) {
      try {
        await gradeSubject(data);
        writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
      } catch (err) {
        if (err instanceof QuotaExhausted) {
          console.log(`\n${err.message}`);
          break;
        }
        console.log(`${data.subject}: grading failed, ${err.message}`);
      }
    }

    console.log(`\n${data.subject}`);
    for (const b of data.beats) {
      const g = b.grade ?? {};
      const fact = b.check?.verdict ?? "unchecked";
      console.log(
        `  ${b.id}  ${g.verdict ?? "?"}  score ${g.score ?? 0}/20  fact ${fact}`,
      );
      for (const p of g.problems ?? []) console.log(`      ${p}`);
      if (g.fix) console.log(`      fix: ${g.fix}`);
    }
    loaded.push(data);
  }

  const all = loaded.flatMap((d) => d.beats);
  const promotable = all.filter(
    (b) => b.check?.verdict === "supported" && b.grade?.verdict === "promote",
  );
  console.log(
    `\n${all.length} beats graded, ${promotable.length} clear both fact and voice gates`,
  );

  if (minScore != null) {
    const { count, path } = promote(area, loaded, minScore);
    console.log(`wrote ${count} beats to ${path}`);
  } else {
    console.log(`Run again with --promote 4 to emit a corpus file.`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
