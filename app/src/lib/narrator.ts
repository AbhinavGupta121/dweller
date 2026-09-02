/**
 * Speech output, behind an interface.
 *
 * Two backends are planned. `WebSpeechNarrator` needs no API key and no network,
 * which is what makes the app usable today. `AudioNarrator` plays pre-rendered
 * files from the area pack and can pan a voice toward the building being
 * described, which speech synthesis cannot do. Swapping backends must not
 * require touching the director or the UI, hence the interface.
 */

import type { Beat } from "./types";

export interface Utterance {
  beat: Beat;
  /** Spoken before the beat text, if any. */
  preamble: string | null;
  /**
   * Where the subject is relative to the listener, in degrees (-180..180).
   * Used for stereo placement by backends that support it.
   */
  relativeDeg: number | null;
}

export interface NarratorEvents {
  onStart?: (u: Utterance) => void;
  onSentence?: (u: Utterance, charIndex: number) => void;
  onEnd?: (u: Utterance, actualSec: number, completed: boolean) => void;
  onError?: (u: Utterance, err: unknown) => void;
}

export interface Narrator {
  readonly kind: string;
  readonly available: boolean;
  /** True from the moment speech starts until it ends or is cancelled. */
  readonly speaking: boolean;
  speak(u: Utterance): void;
  /** Stop immediately. Fires onEnd with completed=false. */
  cancel(): void;
  /**
   * Finish the current sentence, then stop. Used when the listener walks away
   * mid-beat: cutting off a word sounds broken, whereas landing on a full stop
   * sounds like the narrator simply chose to move on. This is what makes it safe
   * for the director to start long material during a pause.
   */
  windDown(): void;
  /** True once windDown has been requested and speech is still finishing. */
  readonly windingDown: boolean;
  /** Duck to a low volume for a conversational reply, if supported. */
  setDucked(ducked: boolean): void;
  setRate(rate: number): void;
  dispose(): void;
}

/* ------------------------------------------------------- Web Speech --- */

/**
 * Notes from testing this API, which is more fragile than it looks:
 *  - Chrome silently drops utterances longer than roughly 200–300 characters on
 *    some platforms, so long beats are split into sentence chunks.
 *  - Chunks are spoken one at a time rather than queued all at once. Queueing is
 *    simpler but gives up control: once the queue is in, the only way to stop is
 *    a hard cancel mid-word. Sequencing lets windDown land on a full stop.
 *  - `onboundary` gives us live word position, which drives the captions.
 *  - Voices load asynchronously and the list is empty on first call.
 *  - Speech is blocked until a user gesture, which is why the start screen has
 *    an explicit begin button rather than auto-starting.
 */
export class WebSpeechNarrator implements Narrator {
  readonly kind = "web-speech";

  private synth: SpeechSynthesis | null;
  private voice: SpeechSynthesisVoice | null = null;
  private rate = 1;
  private current: Utterance | null = null;
  private chunks: string[] = [];
  private chunkOffsets: number[] = [];
  private chunkIndex = 0;
  private startedAt = 0;
  private cancelled = false;
  private winding = false;
  private watchdog: ReturnType<typeof setTimeout> | null = null;

  private events: NarratorEvents;

  constructor(events: NarratorEvents = {}) {
    this.events = events;
    this.synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (this.synth) {
      this.pickVoice();
      // The list is usually empty until this fires.
      this.synth.addEventListener?.("voiceschanged", this.pickVoice);
    }
  }

  get available(): boolean {
    return this.synth != null;
  }

  get speaking(): boolean {
    return this.current != null;
  }

  get windingDown(): boolean {
    return this.winding && this.current != null;
  }

  private pickVoice = (): void => {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    if (!voices.length) return;

    // Prefer a natural-sounding English voice; the ordering below reflects what
    // actually sounds least robotic on Android Chrome and desktop.
    const preferences = [
      /Google UK English Male/i,
      /Google UK English/i,
      /en-GB.*(Neural|Natural)/i,
      /Daniel/i,
      /Google US English/i,
      /en-US.*(Neural|Natural)/i,
    ];
    for (const re of preferences) {
      const hit = voices.find((v) => re.test(v.name) || re.test(v.voiceURI));
      if (hit) {
        this.voice = hit;
        return;
      }
    }
    this.voice = voices.find((v) => v.lang?.startsWith("en")) ?? voices[0];
  };

  setRate(rate: number): void {
    this.rate = Math.max(0.5, Math.min(2, rate));
  }

  setDucked(): void {
    // Web Speech offers no volume ramp on an in-flight utterance. Conversation
    // mode cancels instead; the audio backend will duck properly.
  }

  speak(u: Utterance): void {
    if (!this.synth) return;
    this.cancel();

    this.current = u;
    this.cancelled = false;
    this.winding = false;
    this.startedAt = performance.now();

    const full = u.preamble ? `${u.preamble} ${u.beat.text}` : u.beat.text;
    this.chunks = chunkForSpeech(full);
    this.chunkOffsets = [];
    let offset = 0;
    for (const chunk of this.chunks) {
      this.chunkOffsets.push(offset);
      offset += chunk.length + 1;
    }
    this.chunkIndex = 0;
    this.armWatchdog(u.beat.sec);
    this.speakChunk();
  }

  /**
   * Web Speech fails silently more often than any other browser API I have used:
   * a device with no installed voices, a backgrounded tab, or an Android WebView
   * quirk can all accept `speak()` and then never fire `onend`. Without this the
   * director would see `speaking === true` forever and the walk would go quiet
   * permanently. The watchdog gives up a bit after the beat should have ended.
   */
  private armWatchdog(expectedSec: number): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    const limitMs = (expectedSec * 2 + 10) * 1000;
    this.watchdog = setTimeout(() => {
      if (!this.current) return;
      this.events.onError?.(
        this.current,
        new Error("speech synthesis timed out"),
      );
      if (this.synth) this.synth.cancel();
      this.finish(false);
    }, limitMs);
  }

  private speakChunk(): void {
    const u = this.current;
    if (!this.synth || !u) return;

    const index = this.chunkIndex;
    const chunk = this.chunks[index];
    if (chunk == null) {
      this.finish(true);
      return;
    }

    const utter = new SpeechSynthesisUtterance(chunk);
    if (this.voice) utter.voice = this.voice;
    utter.rate = this.rate;
    utter.pitch = 1;
    utter.lang = this.voice?.lang ?? "en-GB";

    if (index === 0) {
      utter.onstart = () => {
        if (this.current) this.events.onStart?.(this.current);
      };
    }
    utter.onboundary = (ev) => {
      if (this.current) {
        this.events.onSentence?.(
          this.current,
          this.chunkOffsets[index] + (ev.charIndex ?? 0),
        );
      }
    };
    utter.onend = () => {
      if (this.current !== u) return; // superseded by a cancel
      // A wind-down request is honoured here, on a sentence boundary.
      if (this.winding) {
        this.finish(false);
        return;
      }
      this.chunkIndex += 1;
      if (this.chunkIndex >= this.chunks.length) this.finish(true);
      else this.speakChunk();
    };
    utter.onerror = (ev) => {
      // "interrupted" and "canceled" are our own cancel() and not failures.
      const reason = (ev as SpeechSynthesisErrorEvent).error;
      if (reason === "interrupted" || reason === "canceled") return;
      if (this.current) this.events.onError?.(this.current, reason);
      this.finish(false);
    };

    this.synth.speak(utter);
  }

  private finish(completed: boolean): void {
    const u = this.current;
    if (!u) return;
    if (this.watchdog) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
    this.current = null;
    this.chunks = [];
    this.winding = false;
    const sec = (performance.now() - this.startedAt) / 1000;
    this.events.onEnd?.(u, sec, completed && !this.cancelled);
  }

  windDown(): void {
    if (this.current) this.winding = true;
  }

  cancel(): void {
    if (!this.synth) return;
    if (this.current) {
      this.cancelled = true;
      this.synth.cancel();
      this.finish(false);
    } else {
      this.synth.cancel();
    }
  }

  dispose(): void {
    this.cancel();
    this.synth?.removeEventListener?.("voiceschanged", this.pickVoice);
  }
}

/**
 * Split text into utterance-sized chunks on sentence boundaries.
 *
 * Chrome drops long utterances, and splitting also gives the caption view
 * something to highlight. Chunks are merged up to a target length so we do not
 * introduce an audible gap after every short sentence.
 */
export function chunkForSpeech(text: string, targetChars = 180): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];
  const chunks: string[] = [];
  let buffer = "";

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (!buffer) {
      buffer = sentence;
    } else if (buffer.length + sentence.length + 1 <= targetChars) {
      buffer += " " + sentence;
    } else {
      chunks.push(buffer);
      buffer = sentence;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

/* -------------------------------------------------- pre-rendered audio --- */

/** One entry of app/public/areas/<area>/audio/index.json, written by tts.mjs. */
interface AudioEntry {
  file: string;
  sec: number;
}

/**
 * Plays audio rendered at build time by `tools/gemini/tts.mjs`.
 *
 * Worth the extra complexity over Web Speech for two reasons. The voice is
 * chosen and directed once, at build time, instead of being whatever the phone
 * happens to ship. And because it runs through Web Audio, the voice can be
 * placed toward the building being described, which turns "on your left" from an
 * instruction into something you simply hear.
 *
 * Any beat without a rendered file falls through to the supplied backend, so a
 * partial render is still shippable — which matters, because rendering the whole
 * corpus on the free tier takes a while.
 */
export class AudioNarrator implements Narrator {
  readonly kind = "audio";

  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private panner: StereoPannerNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffers = new Map<string, AudioBuffer>();

  private current: Utterance | null = null;
  private startedAt = 0;
  private cancelled = false;
  private winding = false;
  private captionTimer: ReturnType<typeof setInterval> | null = null;
  private rate = 1;

  private events: NarratorEvents;
  private index: Record<string, AudioEntry>;
  private baseUrl: string;
  private fallback: Narrator;

  /** Fade applied on wind-down and cancel; long enough to sound deliberate. */
  private static readonly FADE_SEC = 0.9;

  private constructor(
    events: NarratorEvents,
    index: Record<string, AudioEntry>,
    baseUrl: string,
    fallback: Narrator,
  ) {
    this.events = events;
    this.index = index;
    this.baseUrl = baseUrl;
    this.fallback = fallback;
  }

  /**
   * Returns an AudioNarrator if the area ships any rendered audio, otherwise the
   * fallback unchanged. Callers do not need to know which they got.
   */
  static async load(
    areaId: string,
    events: NarratorEvents,
    fallback: Narrator,
    base = import.meta.env.BASE_URL,
  ): Promise<Narrator> {
    const baseUrl = `${base}areas/${areaId}/audio/`;
    try {
      const res = await fetch(`${baseUrl}index.json`);
      if (!res.ok) return fallback;
      const index = (await res.json()) as Record<string, AudioEntry>;
      if (!index || !Object.keys(index).length) return fallback;
      return new AudioNarrator(events, index, baseUrl, fallback);
    } catch {
      return fallback;
    }
  }

  get available(): boolean {
    return true;
  }

  get speaking(): boolean {
    return this.current != null || this.fallback.speaking;
  }

  get windingDown(): boolean {
    if (this.current) return this.winding;
    return this.fallback.windingDown;
  }

  /** How many of this area's beats have real audio, for the debug panel. */
  get coverage(): number {
    return Object.keys(this.index).length;
  }

  /**
   * Measured length of a beat's rendered audio, or null if it has none. The
   * director needs this: the corpus figure is a word-count estimate and the
   * rendered voice does not match it closely enough to gate on.
   */
  durationOf(beatId: string): number | null {
    return this.index[beatId]?.sec ?? null;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.panner = this.ctx.createStereoPanner();
      this.gain = this.ctx.createGain();
      this.panner.connect(this.gain);
      this.gain.connect(this.ctx.destination);
    }
    // Suspended by autoplay policy until a gesture, and again after a phone
    // locks its screen mid-walk, which is the normal case here.
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private async bufferFor(entry: AudioEntry): Promise<AudioBuffer> {
    const hit = this.buffers.get(entry.file);
    if (hit) return hit;
    const ctx = this.ensureContext();
    const res = await fetch(this.baseUrl + entry.file);
    if (!res.ok) throw new Error(`audio ${entry.file}: HTTP ${res.status}`);
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    this.buffers.set(entry.file, buffer);
    return buffer;
  }

  speak(u: Utterance): void {
    const entry = this.index[u.beat.id];
    if (!entry) {
      this.fallback.speak(u);
      return;
    }

    this.cancel();
    this.current = u;
    this.cancelled = false;
    this.winding = false;

    void this.play(u, entry).catch((err) => {
      // A missing or corrupt file should not cost the listener the beat.
      if (this.current !== u) return;
      this.current = null;
      this.events.onError?.(u, err);
      this.fallback.speak(u);
    });
  }

  private async play(u: Utterance, entry: AudioEntry): Promise<void> {
    const buffer = await this.bufferFor(entry);
    if (this.current !== u) return; // cancelled while decoding

    const ctx = this.ensureContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.rate;
    source.connect(this.panner!);

    // Never hard-pan: at full width the voice sounds like a fault in one
    // earbud. Sixty percent is enough to be unmistakably directional.
    if (this.panner) {
      const deg = u.relativeDeg;
      this.panner.pan.value =
        deg == null ? 0 : Math.sin((deg * Math.PI) / 180) * 0.6;
    }
    if (this.gain) {
      this.gain.gain.cancelScheduledValues(ctx.currentTime);
      this.gain.gain.setValueAtTime(1, ctx.currentTime);
    }

    source.onended = () => {
      if (this.source !== source) return;
      this.finish(!this.winding && !this.cancelled);
    };

    this.source = source;
    this.startedAt = performance.now();
    source.start();
    this.events.onStart?.(u);
    this.trackCaptions(u, buffer.duration / this.rate);
  }

  /**
   * Rendered audio carries no word timings, so captions advance on elapsed
   * fraction of the clip. Imperfect, but the captions exist to be glanceable in
   * bright sun, not to be read word by word, and the drift is not noticeable at
   * a sentence's scale.
   */
  private trackCaptions(u: Utterance, durationSec: number): void {
    const total = (u.preamble ? `${u.preamble} ${u.beat.text}` : u.beat.text)
      .length;
    if (this.captionTimer) clearInterval(this.captionTimer);
    this.captionTimer = setInterval(() => {
      if (this.current !== u) return;
      const elapsed = (performance.now() - this.startedAt) / 1000;
      const fraction = Math.min(1, elapsed / Math.max(0.1, durationSec));
      this.events.onSentence?.(u, Math.round(total * fraction));
    }, 220);
  }

  /**
   * With synthesis we can stop cleanly on a full stop. With a rendered clip the
   * boundaries are baked in, so the nearest equivalent is a short fade, which
   * reads as the narrator trailing off rather than being cut.
   */
  windDown(): void {
    if (!this.current) {
      this.fallback.windDown();
      return;
    }
    if (this.winding) return;
    this.winding = true;
    this.fadeOutAndStop(AudioNarrator.FADE_SEC);
  }

  private fadeOutAndStop(fadeSec: number): void {
    const ctx = this.ctx;
    const source = this.source;
    if (!ctx || !source || !this.gain) return;
    const now = ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
    try {
      source.stop(now + fadeSec);
    } catch {
      // Already stopped; onended will do the rest.
    }
  }

  private finish(completed: boolean): void {
    const u = this.current;
    if (!u) return;
    if (this.captionTimer) {
      clearInterval(this.captionTimer);
      this.captionTimer = null;
    }
    this.current = null;
    this.source = null;
    this.winding = false;
    const sec = (performance.now() - this.startedAt) / 1000;
    this.events.onEnd?.(u, sec, completed && !this.cancelled);
  }

  cancel(): void {
    this.fallback.cancel();
    if (!this.current) return;
    this.cancelled = true;
    const source = this.source;
    this.source = null;
    try {
      source?.stop();
    } catch {
      // Not yet started.
    }
    this.finish(false);
  }

  setDucked(ducked: boolean): void {
    this.fallback.setDucked(ducked);
    const ctx = this.ctx;
    if (!ctx || !this.gain) return;
    const now = ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(ducked ? 0.18 : 1, now + 0.25);
  }

  setRate(rate: number): void {
    this.rate = Math.max(0.5, Math.min(2, rate));
    this.fallback.setRate(rate);
    if (this.source) this.source.playbackRate.value = this.rate;
  }

  dispose(): void {
    this.cancel();
    if (this.captionTimer) clearInterval(this.captionTimer);
    this.fallback.dispose();
    void this.ctx?.close();
    this.ctx = null;
    this.buffers.clear();
  }
}

/* ------------------------------------------------------------ silent --- */

/** Used by the simulator and by tests: consumes time without making noise. */
export class SilentNarrator implements Narrator {
  readonly kind = "silent";
  readonly available = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private current: Utterance | null = null;
  private startedAt = 0;
  private winding = false;

  private events: NarratorEvents;
  /** Multiplier on real time; 0 means resolve immediately. */
  private timeScale: number;

  constructor(events: NarratorEvents = {}, timeScale = 1) {
    this.events = events;
    this.timeScale = timeScale;
  }

  get speaking(): boolean {
    return this.current != null;
  }

  get windingDown(): boolean {
    return this.winding && this.current != null;
  }

  windDown(): void {
    if (this.current) this.winding = true;
  }

  speak(u: Utterance): void {
    this.cancel();
    this.current = u;
    this.winding = false;
    this.startedAt = performance.now();
    this.events.onStart?.(u);

    const ms = u.beat.sec * 1000 * this.timeScale;
    const done = () => {
      const cur = this.current;
      if (!cur) return;
      this.current = null;
      this.timer = null;
      this.events.onEnd?.(cur, u.beat.sec, true);
    };
    if (ms <= 0) done();
    else this.timer = setTimeout(done, ms);
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const cur = this.current;
    if (cur) {
      this.current = null;
      this.events.onEnd?.(
        cur,
        (performance.now() - this.startedAt) / 1000,
        false,
      );
    }
  }

  setDucked(): void {}
  setRate(): void {}
  dispose(): void {
    this.cancel();
  }
}
