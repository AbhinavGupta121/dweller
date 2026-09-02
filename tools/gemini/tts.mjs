/**
 * Pre-renders every beat to audio so the walk can use a real voice instead of
 * the phone's built-in synthesiser.
 *
 *   node tools/gemini/tts.mjs harvard-yard              # render missing beats
 *   node tools/gemini/tts.mjs harvard-yard --limit 10   # try a few first
 *   node tools/gemini/tts.mjs harvard-yard --voice Puck
 *
 * Rendering at build time rather than during the walk is the whole reason this
 * app costs nothing to run and works with no signal: audio is a static file in
 * the area pack, cached by the service worker, and identical for every listener.
 *
 * The catch, measured against a real key: the free tier allows ten TTS requests
 * per day per model. An area of 78 beats is therefore over a week of quota, so
 * this is a paid-tier feature in practice. On-device speech remains the default
 * and needs nothing.
 *
 * Output: app/public/areas/<area>/audio/<beat-id>.wav plus an index.json the
 * narrator uses to find and time them. Existing files are skipped, so an
 * interrupted run resumes where it stopped.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { speak, wavFromPcm, QuotaExhausted, TTS_MODEL } from "./client.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

const BYTES_PER_SAMPLE = 2;

/**
 * The TTS models take direction in the prompt itself, which is the only place
 * the narrator's delivery can be set. Without this it reads beats like a news
 * anchor: too bright, too fast, and it lifts at the end of every sentence.
 */
function directed(text) {
  return [
    "Read this aloud as a curious, well-read companion walking beside one",
    "person. Unhurried and level. Warm but not enthusiastic. Let the full stops",
    "land. Do not sound like an advertisement or a news broadcast.",
    "",
    text,
  ].join("\n");
}

function durationSec(wavBytes, sampleRate) {
  return (wavBytes - 44) / (sampleRate * BYTES_PER_SAMPLE);
}

const hasFfmpeg = () =>
  spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

/**
 * Compress to Opus and drop the WAV.
 *
 * Uncompressed 24 kHz mono runs about 48 kB per second, so a full area is
 * comfortably over 70 MB — more than a phone should be asked to cache for one
 * walk, and slow to warm over anything but wifi. Speech at 24 kbps mono is
 * roughly a twentieth of that and indistinguishable through earbuds outdoors.
 *
 * Ogg Opus decodes in Chrome's `decodeAudioData`, which is the target. Safari's
 * support is patchy, so `--keep-wav` exists for that case.
 */
function toOpus(wavPath) {
  const opusPath = wavPath.replace(/\.wav$/, ".opus");
  const res = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", wavPath, "-c:a", "libopus", "-b:a", "24k", "-ac", "1", opusPath],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  if (res.status !== 0) {
    throw new Error(`ffmpeg failed: ${String(res.stderr).slice(0, 200)}`);
  }
  rmSync(wavPath);
  return opusPath;
}

async function main() {
  const args = process.argv.slice(2);
  const area = args[0];
  if (!area) {
    console.error("usage: node tools/gemini/tts.mjs <area> [--limit N] [--voice NAME]");
    process.exit(1);
  }

  const limitAt = args.indexOf("--limit");
  const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;
  const voiceAt = args.indexOf("--voice");
  const voice = voiceAt >= 0 ? args[voiceAt + 1] : undefined;
  const compress = !args.includes("--keep-wav") && hasFfmpeg();

  const beatsFile = resolve(ROOT, "tools/build", area, "beats.json");
  if (!existsSync(beatsFile)) {
    throw new Error(`No beats for "${area}". Run tools/corpus/index.mjs first.`);
  }
  const beats = JSON.parse(readFileSync(beatsFile, "utf8"));

  const audioDir = resolve(ROOT, "app/public/areas", area, "audio");
  mkdirSync(audioDir, { recursive: true });
  const indexFile = resolve(audioDir, "index.json");
  const index = existsSync(indexFile)
    ? JSON.parse(readFileSync(indexFile, "utf8"))
    : {};

  // Resume rather than re-render: a full area takes over an hour on the free
  // tier and the run will be interrupted at least once.
  const todo = beats.filter((b) => {
    const entry = index[b.id];
    return !entry || !existsSync(resolve(audioDir, entry.file));
  });

  console.log(
    `${beats.length} beats, ${todo.length} to render with ${TTS_MODEL}\n` +
      `${compress ? "Compressing to Opus." : "Keeping WAV (no ffmpeg or --keep-wav)."}\n` +
      `Free tier is slow: expect roughly ${Math.ceil(Math.min(todo.length, limit) / 2)} minutes.\n`,
  );

  let done = 0;
  let failed = 0;

  for (const beat of todo) {
    if (done >= limit) break;
    const path = resolve(audioDir, `${beat.id}.wav`);

    try {
      const { pcm, sampleRate } = await speak({
        text: directed(beat.text),
        voice,
      });
      const wav = wavFromPcm(pcm, sampleRate);
      writeFileSync(path, wav);

      // Duration comes from the PCM, before any transcode, so it stays exact.
      const sec = durationSec(wav.length, sampleRate);
      const finalPath = compress ? toOpus(path) : path;

      index[beat.id] = {
        file: finalPath.split("/").pop(),
        sec: Math.round(sec * 10) / 10,
        bytes: readFileSync(finalPath).length,
        // The corpus estimates duration from word count; the real rendering is
        // authoritative, and the director needs the true number to pace itself.
        estimatedSec: beat.sec,
        voice: voice ?? process.env.GEMINI_VOICE ?? "Charon",
      };
      writeFileSync(indexFile, JSON.stringify(index, null, 2) + "\n");

      done++;
      const drift = sec - beat.sec;
      const flag = Math.abs(drift) > beat.sec * 0.35 ? "  <- drifted" : "";
      console.log(
        `  ${beat.id}  ${sec.toFixed(1)}s (est ${beat.sec}s)${flag}`,
      );
    } catch (err) {
      if (err instanceof QuotaExhausted) {
        console.log(`\n${err.message}`);
        break;
      }
      failed++;
      console.log(`  ${beat.id}  FAILED ${err.message}`);
    }
  }

  const rendered = Object.keys(index).length;
  const totalBytes = Object.values(index).reduce((a, b) => a + b.bytes, 0);
  const totalSec = Object.values(index).reduce((a, b) => a + b.sec, 0);

  console.log(
    `\n${rendered}/${beats.length} beats have audio` +
      `${failed ? `, ${failed} failed this run` : ""}\n` +
      `${Math.round(totalSec / 60)} minutes of narration, ${(totalBytes / 1e6).toFixed(1)} MB`,
  );

  if (totalBytes > 25e6) {
    console.log(
      "\nThat is a lot for a phone to cache over anything but wifi.\n" +
        "Consider a lower bitrate, or ship audio for the popular subjects only —\n" +
        "the app falls back to on-device speech per beat.",
    );
  }

  if (rendered < beats.length) {
    console.log(`\nRun again to continue; finished files are skipped.`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
