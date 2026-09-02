/**
 * Beat writer: expands harvested sources into candidate beats for an area.
 *
 *   node tools/gemini/write.mjs harvard-yard                  # every subject
 *   node tools/gemini/write.mjs harvard-yard widener-library  # one subject
 *   node tools/gemini/write.mjs harvard-yard --per 6          # beats per subject
 *
 * Output goes to tools/generated/<area>/<subject>.json. Nothing is written into
 * tools/corpus/, which stays hand-authored: generated beats have to survive
 * factcheck.mjs and grade.mjs before a human promotes them. The pipeline
 * proposes, it does not commit.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generate, QuotaExhausted } from "./client.mjs";
import { PERSONA, ANGLE_GUIDE, DEPTH_GUIDE } from "./persona.mjs";
import { loadArea, sourceTextFor } from "./sources.mjs";
import { ANGLES, estimateSeconds } from "../corpus/schema.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

const BEAT_SCHEMA = {
  type: "object",
  properties: {
    beats: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "short kebab-case id fragment, e.g. flemish-bond",
          },
          angle: { type: "string", enum: ANGLES },
          depth: { type: "integer" },
          arrival: {
            type: "boolean",
            description: "true if this works as the first thing said on arrival",
          },
          text: { type: "string" },
          look: {
            type: "string",
            description:
              "one short imperative pointing the eyes at something, or empty",
          },
          claims: {
            type: "array",
            description: "each factual assertion in the text, one per entry",
            items: { type: "string" },
          },
          quotes: {
            type: "array",
            description:
              "for each claim, the sentence from the source that supports it",
            items: { type: "string" },
          },
        },
        required: ["slug", "angle", "depth", "arrival", "text", "claims", "quotes"],
      },
    },
  },
  required: ["beats"],
};

function promptFor(subject, source, perSubject, existingSlugs) {
  const avoid = existingSlugs.length
    ? `\nAlready written for this subject, do not repeat these ideas:\n${existingSlugs.join(", ")}\n`
    : "";

  return `
${ANGLE_GUIDE}

${DEPTH_GUIDE}

Write ${perSubject} beats about this one subject, for a listener standing in
front of it right now.

Requirements:
- At least one beat with depth 1 and arrival true. That is the first thing said
  when the listener walks up, so it must work with no prior context.
- Spread the rest across depths 2 and 3 and across different angles. Do not
  write four history beats.
- If the source supports a genuine mythbust, include one. If it does not, do not
  invent one.
- For every beat, list each factual claim separately in "claims", and for each
  claim give the exact supporting sentence from the source text in "quotes", in
  the same order. If you cannot quote a source sentence for a claim, remove the
  claim from the text.
${avoid}
SOURCE TEXT — this is the only knowledge you may use:

${source}
`.trim();
}

async function writeSubject(area, subject, source, perSubject) {
  const outDir = resolve(ROOT, "tools/generated", area);
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, `${subject.id}.json`);

  const existing = existsSync(outFile)
    ? JSON.parse(readFileSync(outFile, "utf8"))
    : { subject: subject.id, beats: [] };

  const result = await generate({
    system: PERSONA,
    prompt: promptFor(
      subject,
      source,
      perSubject,
      existing.beats.map((b) => b.id.replace(`${subject.id}-`, "")),
    ),
    schema: BEAT_SCHEMA,
    temperature: 0.85,
  });

  const beats = (result.beats ?? []).map((b) => ({
    id: `${subject.id}-${b.slug}`,
    subject: subject.id,
    angle: b.angle,
    depth: b.depth,
    arrival: b.arrival ?? false,
    text: b.text.replace(/\s+/g, " ").trim(),
    look: b.look?.trim() || null,
    sources: subject.wikipedia?.title
      ? [`wikipedia:${subject.wikipedia.title}`]
      : [],
    // Kept so factcheck.mjs can grade claim by claim rather than beat by beat.
    claims: b.claims ?? [],
    quotes: b.quotes ?? [],
    sec: estimateSeconds(b.text ?? ""),
    generated: true,
  }));

  const merged = [...existing.beats];
  for (const b of beats) {
    const at = merged.findIndex((m) => m.id === b.id);
    if (at >= 0) merged[at] = b;
    else merged.push(b);
  }

  writeFileSync(
    outFile,
    JSON.stringify({ subject: subject.id, beats: merged }, null, 2) + "\n",
  );
  return beats;
}

async function main() {
  const args = process.argv.slice(2);
  const area = args[0];
  if (!area) {
    console.error("usage: node tools/gemini/write.mjs <area> [subject] [--per N]");
    process.exit(1);
  }

  const perIndex = args.indexOf("--per");
  const perSubject = perIndex >= 0 ? Number(args[perIndex + 1]) : 5;
  const only = args[1] && !args[1].startsWith("--") ? args[1] : null;

  const { subjects, articles, intros } = loadArea(area);
  const targets = only ? subjects.filter((s) => s.id === only) : subjects;
  if (!targets.length) throw new Error(`no subject matched "${only}"`);

  console.log(
    `Writing ~${perSubject} beats for ${targets.length} subject(s) in ${area}\n`,
  );

  let total = 0;
  for (const subject of targets) {
    const source = sourceTextFor(subject, articles, intros);
    if (source.length < 400) {
      console.log(`- ${subject.id}: skipped, too little source text`);
      continue;
    }
    try {
      const beats = await writeSubject(area, subject, source, perSubject);
      total += beats.length;
      const shape = beats.map((b) => `d${b.depth}/${b.angle}`).join(" ");
      console.log(`- ${subject.id}: ${beats.length} beats  ${shape}`);
    } catch (err) {
      if (err instanceof QuotaExhausted) {
        console.log(`\n${err.message}`);
        break;
      }
      console.log(`- ${subject.id}: FAILED ${err.message}`);
    }
  }

  console.log(
    `\n${total} beats written to tools/generated/${area}/\n` +
      `Next: node tools/gemini/factcheck.mjs ${area}`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
