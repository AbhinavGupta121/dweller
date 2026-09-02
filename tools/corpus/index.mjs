#!/usr/bin/env node
/**
 * Compile the beat corpus, validate it against the resolved subjects, and emit
 * the packed area file the app loads.
 *
 * Run after resolve.mjs. Exits non-zero on schema errors so this can gate a
 * build; warnings are advisory.
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { compileBeats, ANGLES } from "./schema.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_PUBLIC = join(__dirname, "..", "..", "app", "public", "areas");

/**
 * Hand-authored corpora, by area. Adding an area is a line here plus its beat
 * files; nothing else in the build knows about Harvard specifically.
 */
const CORPORA = {
  "harvard-yard": async () => {
    const mods = await Promise.all([
      import("./old-yard.mjs"),
      import("./tercentenary.mjs"),
      import("./edges.mjs"),
    ]);
    return mods.flatMap((m) => m.beats);
  },
};

async function main() {
  const areaId = process.argv[2] ?? "harvard-yard";
  const loadCorpus = CORPORA[areaId];
  if (!loadCorpus) {
    console.error(
      `no corpus registered for "${areaId}". Known: ${Object.keys(CORPORA).join(", ")}`,
    );
    process.exit(1);
  }

  const BUILD = join(__dirname, "..", "build", areaId);
  const { area, subjects } = JSON.parse(
    await readFile(join(BUILD, "subjects.json"), "utf8"),
  );
  const paths = JSON.parse(await readFile(join(BUILD, "paths.json"), "utf8"));

  const raw = await loadCorpus();
  const { beats, errors, warnings } = compileBeats(raw, subjects);

  report(beats, subjects, errors, warnings);
  if (errors.length) process.exit(1);

  // Subjects with no beats would be dead weight in the pack and would make the
  // director consider places it cannot say anything about.
  const covered = new Set(beats.map((b) => b.subject));
  const packedSubjects = subjects
    .filter((s) => covered.has(s.id))
    // Everything the harvester resolves is a building, gate or monument. Coarser
    // tiers are not authored: they are fetched live, because a neighbourhood
    // changes slowly enough that Wikipedia is a perfectly good source for it.
    .map((s) => ({ ...s, scale: s.scale ?? "site" }));

  const pack = {
    version: 1,
    generatedAt: new Date().toISOString(),
    area: {
      id: area.id,
      name: area.name,
      center: area.center,
      clip: area.clip,
    },
    subjects: packedSubjects,
    // Marked so the app can distinguish checked prose from anything written
    // live on the walker's phone.
    beats: beats.map((b) => ({ ...b, origin: "corpus" })),
    paths,
  };

  await mkdir(APP_PUBLIC, { recursive: true });
  const out = join(APP_PUBLIC, `${area.id}.json`);
  await writeFile(out, JSON.stringify(pack));
  await writeFile(join(BUILD, "beats.json"), JSON.stringify(beats, null, 2));

  const kb = (JSON.stringify(pack).length / 1024).toFixed(0);
  console.log(`\npacked ${kb} kB → app/public/areas/${area.id}.json`);

  await writeIndex();
}

/**
 * Rebuild the catalogue of shipped packs.
 *
 * Derived by scanning the output directory rather than from a list, so a pack
 * can never be present but unlisted — which would make the app fall back to
 * live content in a place somebody had carefully authored.
 */
async function writeIndex() {
  const files = (await readdir(APP_PUBLIC)).filter(
    (f) => f.endsWith(".json") && f !== "index.json",
  );

  const areas = [];
  for (const file of files.sort()) {
    try {
      const pack = JSON.parse(await readFile(join(APP_PUBLIC, file), "utf8"));
      areas.push({
        id: pack.area.id,
        name: pack.area.name,
        center: pack.area.center,
        clip: pack.area.clip,
        subjects: pack.subjects.length,
        beats: pack.beats.length,
      });
    } catch {
      console.warn(`  ? skipped ${file}: not a readable pack`);
    }
  }

  await writeFile(
    join(APP_PUBLIC, "index.json"),
    JSON.stringify({ version: 1, areas }, null, 2),
  );
  console.log(
    `indexed ${areas.length} area${areas.length === 1 ? "" : "s"}: ` +
      `${areas.map((a) => a.id).join(", ")}\n`,
  );
}

function report(beats, subjects, errors, warnings) {
  const totalSec = beats.reduce((s, b) => s + b.sec, 0);
  console.log(`\n${beats.length} beats, ${fmt(totalSec)} of narration total`);

  const byDepth = [1, 2, 3].map((d) => beats.filter((b) => b.depth === d));
  for (const [i, group] of byDepth.entries()) {
    const secs = group.map((b) => b.sec);
    const avg = secs.length ? Math.round(secs.reduce((a, b) => a + b) / secs.length) : 0;
    console.log(
      `  depth ${i + 1}: ${String(group.length).padStart(3)} beats, avg ${avg}s`,
    );
  }

  console.log("\nby angle:");
  for (const a of ANGLES) {
    const n = beats.filter((b) => b.angle === a).length;
    console.log(`  ${a.padEnd(14)} ${"█".repeat(n)} ${n}`);
  }

  console.log("\nby subject:");
  for (const s of subjects) {
    const mine = beats.filter((b) => b.subject === s.id);
    const sec = mine.reduce((t, b) => t + b.sec, 0);
    const depths = [1, 2, 3].map((d) => mine.filter((b) => b.depth === d).length);
    console.log(
      `  ${s.id.padEnd(22)} ${String(mine.length).padStart(2)} beats  ` +
        `d1/${depths[0]} d2/${depths[1]} d3/${depths[2]}  ${fmt(sec).padStart(7)}`,
    );
  }

  if (warnings.length) {
    console.log(`\n${warnings.length} warnings:`);
    for (const w of warnings) console.log(`  ? ${w}`);
  }
  if (errors.length) {
    console.log(`\n${errors.length} ERRORS:`);
    for (const e of errors) console.log(`  ! ${e}`);
  }
}

const fmt = (sec) =>
  sec >= 60 ? `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s` : `${sec}s`;

main().catch((err) => {
  console.error("\ncorpus build failed:", err);
  process.exit(1);
});
