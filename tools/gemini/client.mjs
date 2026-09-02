/**
 * Minimal Gemini REST client for the build-time pipeline.
 *
 * This is deliberately not the official SDK: the pipeline only needs two
 * endpoints, and a dependency-free client means `tools/` stays runnable with
 * bare `node` and no install step.
 *
 * Everything here runs at build time on a laptop, never in the app, so the API
 * key never reaches a browser and a walk costs nothing to serve.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

const API = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Model names are not stable on this API: Google retires them for new keys and
 * `generateContent` then returns 404 with a note pointing at the replacement.
 * Both defaults below were confirmed working against a fresh key. If one starts
 * 404ing, list what the key can actually reach:
 *
 *   curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
 *
 * and override with GEMINI_TEXT_MODEL / GEMINI_TTS_MODEL rather than editing
 * this file.
 */
export const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-3.6-flash";
export const TTS_MODEL =
  process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";

/**
 * Retries rotate through these. The newest flash models return 503 "high
 * demand" under load, and long prompts — the fact-checker sends the whole
 * article — draw it far more often than short ones, often for long enough to
 * exhaust a backoff on a single model. Alternating means a capacity spike on
 * one costs a retry rather than the beat.
 */
const TEXT_FALLBACKS = [TEXT_MODEL, "gemini-3.5-flash", "gemini-3-flash-preview"];

/**
 * Free-tier quota is per minute, and blowing through it returns 429s that cost
 * more wall-clock time than just pacing the requests. Slower than the real
 * limit on purpose: the pipeline runs unattended and a stall is worse than a
 * long run.
 */
const REQUESTS_PER_MIN = Number(process.env.GEMINI_RPM ?? 8);
const MIN_SPACING_MS = Math.ceil(60000 / REQUESTS_PER_MIN);

/**
 * Hard ceiling on a single request. `fetch` has no default timeout, so a stalled
 * connection hangs forever — and these pipelines run unattended for an hour,
 * where a silent hang is indistinguishable from slow progress until you come
 * back and find nothing happened. Generous, because long prompts and audio
 * generation are genuinely slow.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 180000);

let lastRequestAt = 0;

/** Read GEMINI_API_KEY from the environment, falling back to the repo .env. */
export function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();

  const envFile = resolve(ROOT, ".env");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }

  throw new Error(
    "No GEMINI_API_KEY. Put it in /home/skydio/wander/.env as\n" +
      "  GEMINI_API_KEY=your-key-here\n" +
      "Get one free at https://aistudio.google.com/apikey",
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function paced() {
  const wait = lastRequestAt + MIN_SPACING_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

/**
 * One generateContent call with retries. Retries 429 and 5xx with exponential
 * backoff and honours a server-supplied RetryInfo delay when there is one,
 * because the free tier hands those out constantly.
 */
export async function generate({
  model = null,
  system,
  prompt,
  schema = null,
  temperature = 0.7,
  maxTokens = 8192,
  attempts = 8,
}) {
  // An explicit model is honoured exactly; otherwise rotate the fallbacks.
  const models = model ? [model] : TEXT_FALLBACKS;
  const key = apiKey();
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(schema
        ? { responseMimeType: "application/json", responseSchema: schema }
        : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  let lastError;
  for (let i = 0; i < attempts; i++) {
    const attemptModel = models[i % models.length];
    await paced();
    let res;
    try {
      res = await fetch(`${API}/${attemptModel}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      lastError = err;
      await sleep(backoffMs(i));
      continue;
    }

    const text = await res.text();

    if (res.ok) {
      const json = JSON.parse(text);
      const cand = json.candidates?.[0];
      if (!cand) throw new Error(`no candidates: ${text.slice(0, 400)}`);
      // A truncated response silently produces invalid JSON downstream, so it
      // is worth failing loudly here instead.
      if (cand.finishReason && cand.finishReason !== "STOP") {
        throw new Error(`finishReason ${cand.finishReason}`);
      }
      const out = (cand.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      return schema ? JSON.parse(out) : out;
    }

    if (res.status === 429) {
      const fatal = dailyQuotaMessage(text);
      if (fatal) throw new QuotaExhausted(fatal);
    }

    if (res.status === 429 || res.status >= 500) {
      const backoff = retryDelayMs(text) ?? backoffMs(i);
      lastError = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      const next = models[(i + 1) % models.length];
      process.stderr.write(
        `  ${attemptModel} ${res.status}, waiting ${Math.round(backoff / 1000)}s` +
          `${next === attemptModel ? "" : ` then trying ${next}`}\n`,
      );
      await sleep(backoff);
      continue;
    }

    throw new Error(
      `${attemptModel} HTTP ${res.status}: ${text.slice(0, 600)}`,
    );
  }
  throw lastError ?? new Error("generate failed");
}

/** Exponential with a ceiling, so late attempts do not sleep for minutes. */
function backoffMs(attempt) {
  return Math.min(2000 * 2 ** attempt, 45000);
}

/**
 * A per-minute 429 clears in a minute; a per-day one does not clear until
 * tomorrow. Both arrive as 429, so without this the pipeline would sit there
 * backing off for the rest of the run against a quota that cannot recover.
 */
export class QuotaExhausted extends Error {}

function dailyQuotaMessage(bodyText) {
  if (!/PerDay/i.test(bodyText)) return null;
  const limit = bodyText.match(/"quotaValue"\s*:\s*"?(\d+)/);
  const model = bodyText.match(/"model"\s*:\s*"([^"]+)"/);
  return (
    `Daily free-tier quota exhausted` +
    `${limit ? ` (limit ${limit[1]} requests/day` : ""}` +
    `${model ? ` for ${model[1]}` : ""}${limit ? ")" : ""}.` +
    ` Resets in about 24 hours, or raise it by enabling billing.`
  );
}

function retryDelayMs(bodyText) {
  const m = bodyText.match(/"retryDelay"\s*:\s*"(\d+)s"/);
  return m ? (Number(m[1]) + 1) * 1000 : null;
}

/**
 * Render text to speech.
 *
 * Returns `{ pcm, sampleRate }`. The models emit headerless signed 16-bit mono
 * PCM and declare the rate in the mime type, e.g. `audio/L16;codec=pcm;rate=24000`.
 * The rate is read from the response rather than assumed, because guessing it
 * wrong does not fail — it just plays back at the wrong pitch and speed, which
 * is the kind of bug you only notice on the walk.
 */
export async function speak({
  text,
  voice = process.env.GEMINI_VOICE ?? "Charon",
  model = TTS_MODEL,
  attempts = 4,
}) {
  const key = apiKey();
  const body = {
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
      },
    },
  };

  let lastError;
  for (let i = 0; i < attempts; i++) {
    await paced();
    let res;
    try {
      res = await fetch(`${API}/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      lastError = err;
      process.stderr.write(`  tts request failed: ${err.message}\n`);
      await sleep(backoffMs(i));
      continue;
    }
    const raw = await res.text();

    if (res.ok) {
      const json = JSON.parse(raw);
      const part = json.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData?.data,
      );
      if (!part) throw new Error(`no audio in response: ${raw.slice(0, 300)}`);
      const rate = part.inlineData.mimeType?.match(/rate=(\d+)/);
      return {
        pcm: Buffer.from(part.inlineData.data, "base64"),
        sampleRate: rate ? Number(rate[1]) : 24000,
      };
    }

    if (res.status === 429) {
      const fatal = dailyQuotaMessage(raw);
      if (fatal) throw new QuotaExhausted(fatal);
    }

    if (res.status === 429 || res.status >= 500) {
      const backoff = retryDelayMs(raw) ?? backoffMs(i);
      lastError = new Error(`HTTP ${res.status}`);
      process.stderr.write(
        `  tts ${res.status}, waiting ${Math.round(backoff / 1000)}s\n`,
      );
      await sleep(backoff);
      continue;
    }

    throw new Error(`HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }
  throw lastError ?? new Error("speak failed");
}

/** Wrap 24 kHz mono s16le PCM in a WAV container. */
export function wavFromPcm(pcm, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
