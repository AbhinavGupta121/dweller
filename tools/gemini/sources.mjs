/**
 * Loading the harvested source material, in one place.
 *
 * Three different shapes have to line up here and none of them fail loudly when
 * they do not: `resolve.mjs` nests the article title inside a `wikipedia`
 * object, the harvest caches are keyed by that title and wrap the prose in an
 * `extract` field, and a missing entry yields `undefined` rather than an error.
 * Getting any of it wrong produces an empty prompt and a confidently
 * hallucinated beat, so both the writer and the fact-checker read through this.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

const read = (path) => JSON.parse(readFileSync(path, "utf8"));

/** Subjects plus the Wikipedia caches for one area. */
export function loadArea(area) {
  const buildDir = resolve(ROOT, "tools/build", area);
  const cacheDir = resolve(ROOT, "tools/cache", area);

  if (!existsSync(buildDir)) {
    throw new Error(
      `No build for "${area}". Run: npm run harvest ${area} && npm run resolve ${area}`,
    );
  }

  const { subjects } = read(resolve(buildDir, "subjects.json"));

  return {
    subjects,
    articles: read(resolve(cacheDir, "wikipedia-articles.json")),
    intros: read(resolve(cacheDir, "wikipedia-intros.json")),
  };
}

/** The longest prose we hold for a subject: full article, else the intro. */
export function articleText(subject, articles, intros) {
  const title = subject.wikipedia?.title;
  if (!title) return "";
  const full = articles[title]?.extract ?? "";
  const intro = intros[title]?.extract ?? "";
  return full.length > intro.length ? full : intro;
}

/**
 * Everything the model is allowed to know about a subject: the map tags, which
 * carry dates and architects that Wikipedia often omits, and the article prose.
 *
 * Articles run to tens of thousands of characters, most of it references and
 * unrelated sections. Trimming keeps the prompt affordable and, more usefully,
 * keeps the model's attention on the parts that describe the physical place.
 */
export function sourceTextFor(subject, articles, intros, limit = 24000) {
  const body = articleText(subject, articles, intros)
    .replace(/\n{3,}/g, "\n\n")
    .replace(
      /^(References|External links|See also|Further reading|Notes|Bibliography)\b[\s\S]*$/im,
      "",
    )
    .trim();

  const facts = Object.entries(subject.tags ?? {})
    .filter(([k]) => !k.startsWith("addr:") && k !== "source")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  return [
    `SUBJECT: ${subject.name}`,
    facts ? `MAP TAGS (from OpenStreetMap)\n${facts}` : "",
    body ? `ARTICLE TEXT\n${body.slice(0, limit)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
