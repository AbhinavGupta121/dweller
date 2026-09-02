/**
 * Fact-checker for generated beats.
 *
 *   node tools/gemini/factcheck.mjs harvard-yard
 *   node tools/gemini/factcheck.mjs harvard-yard widener
 *
 * Two passes, cheap before expensive:
 *
 *   1. Local. Every quote the writer offered must actually appear in the source
 *      text. This catches fabricated citations with no API call at all, and in
 *      practice it catches most of them.
 *   2. Model. A second Gemini call re-reads the source and rules on each claim
 *      independently, with no sight of the writer's reasoning.
 *
 * The second pass uses a separate call rather than asking the writer to check
 * itself, because a model grading its own output mostly agrees with itself.
 *
 * Verdicts are written back into the generated files. Nothing is deleted: a
 * human decides what to do with a failed claim.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generate, QuotaExhausted } from "./client.mjs";
import { loadArea, articleText } from "./sources.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          verdict: {
            type: "string",
            enum: ["supported", "unsupported", "contradicted", "overstated"],
          },
          quote: {
            type: "string",
            description: "the source sentence that decides it, or empty",
          },
          note: { type: "string" },
        },
        required: ["claim", "verdict", "quote", "note"],
      },
    },
  },
  required: ["verdicts"],
};

const SYSTEM = `
You are a fact-checker. You are given source text and a list of claims taken
from prose written about it. Rule on each claim using ONLY the source text.

supported     the source states this, or states something it follows from directly
overstated    the source supports a weaker version, but not as stated
unsupported   the source does not address this at all
contradicted  the source says otherwise

Be strict about numbers, dates, names, attributions and superlatives. "The
oldest building" is contradicted if the source names a different oldest
building. A date the source does not give is unsupported even if it is famous.
Quote the deciding sentence verbatim. Do not use outside knowledge.
`.trim();

/** Loose containment check: whitespace and punctuation vary, wording should not. */
function quoteAppears(quote, source) {
  const norm = (s) =>
    s
      .toLowerCase()
      .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
      .replace(/[^a-z0-9' ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const q = norm(quote);
  if (q.length < 20) return false;
  const haystack = norm(source);
  if (haystack.includes(q)) return true;

  // Models often stitch a quote from a sentence's start and end. Accept a long
  // enough contiguous run so paraphrase still fails but elision does not.
  const words = q.split(" ");
  for (let len = words.length; len >= 8; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      if (haystack.includes(words.slice(i, i + len).join(" "))) return true;
    }
    if (len <= 12) break;
  }
  return false;
}

function loadSources(area) {
  const { subjects, articles, intros } = loadArea(area);
  const byId = new Map();
  for (const s of subjects) {
    const tags = Object.entries(s.tags ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    byId.set(s.id, `${tags}\n\n${articleText(s, articles, intros)}`);
  }
  return byId;
}

async function checkBeat(beat, source) {
  const claims = beat.claims ?? [];
  if (!claims.length) {
    return [
      {
        claim: beat.text.slice(0, 120),
        verdict: "unsupported",
        quote: "",
        note: "writer listed no claims, cannot check",
        localQuoteFound: false,
      },
    ];
  }

  const local = claims.map((claim, i) => {
    const quote = beat.quotes?.[i] ?? "";
    return { claim, quote, localQuoteFound: quoteAppears(quote, source) };
  });

  const result = await generate({
    system: SYSTEM,
    prompt: `
CLAIMS TO CHECK
${claims.map((c, i) => `${i + 1}. ${c}`).join("\n")}

SOURCE TEXT
${source.slice(0, 28000)}
`.trim(),
    schema: VERDICT_SCHEMA,
    temperature: 0,
  });

  const verdicts = result.verdicts ?? [];
  return local.map((l, i) => ({
    claim: l.claim,
    verdict: verdicts[i]?.verdict ?? "unsupported",
    quote: verdicts[i]?.quote ?? "",
    note: verdicts[i]?.note ?? "",
    localQuoteFound: l.localQuoteFound,
  }));
}

function worstVerdict(verdicts) {
  const order = ["contradicted", "unsupported", "overstated", "supported"];
  for (const v of order) {
    if (verdicts.some((x) => x.verdict === v)) return v;
  }
  return "supported";
}

async function main() {
  const [area, only] = process.argv.slice(2);
  if (!area) {
    console.error("usage: node tools/gemini/factcheck.mjs <area> [subject]");
    process.exit(1);
  }

  const genDir = resolve(ROOT, "tools/generated", area);
  if (!existsSync(genDir)) {
    throw new Error(`Nothing generated for "${area}". Run write.mjs first.`);
  }

  const sources = loadSources(area);
  const files = readdirSync(genDir)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !only || f === `${only}.json`);

  const tally = { supported: 0, overstated: 0, unsupported: 0, contradicted: 0 };
  let fabricatedQuotes = 0;
  let stop = null;

  for (const file of files) {
    const path = resolve(genDir, file);
    const data = JSON.parse(readFileSync(path, "utf8"));
    const source = sources.get(data.subject) ?? "";
    if (!source) {
      console.log(`${data.subject}: no source text, skipped`);
      continue;
    }

    console.log(`\n${data.subject}`);
    for (const beat of data.beats) {
      if (beat.check && !process.env.RECHECK) {
        console.log(`  ${beat.id}: cached ${beat.check.verdict}`);
        continue;
      }
      try {
        const verdicts = await checkBeat(beat, source);
        const verdict = worstVerdict(verdicts);
        beat.check = { verdict, claims: verdicts, at: new Date().toISOString() };

        for (const v of verdicts) {
          tally[v.verdict] = (tally[v.verdict] ?? 0) + 1;
          if (!v.localQuoteFound) fabricatedQuotes++;
        }

        const bad = verdicts.filter((v) => v.verdict !== "supported");
        const mark = verdict === "supported" ? "ok" : verdict.toUpperCase();
        console.log(`  ${beat.id}: ${mark}`);
        for (const v of bad) {
          console.log(`      ${v.verdict}: ${v.claim}`);
          if (v.note) console.log(`         ${v.note}`);
        }
      } catch (err) {
        if (err instanceof QuotaExhausted) {
          stop = err.message;
          break;
        }
        console.log(`  ${beat.id}: check failed, ${err.message}`);
      }
    }

    // Verdicts so far are worth keeping even if the run is cut short.
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
    if (stop) break;
  }

  if (stop) console.log(`\n${stop}`);

  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  console.log("\nclaims checked:", total);
  for (const [k, v] of Object.entries(tally)) {
    if (v) console.log(`  ${k}: ${v}`);
  }
  if (fabricatedQuotes) {
    console.log(
      `  quotes not found in source: ${fabricatedQuotes} — treat those beats as suspect`,
    );
  }
  console.log(`\nNext: node tools/gemini/grade.mjs ${area}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
