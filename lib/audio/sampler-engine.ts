import type { SamplerMode } from "@/lib/types/models";

export type AdsrEnvelope = { attack: number; decay: number; sustain: number; release: number };

export type SamplerSettings = {
  rootNote: number;
  mode: Extract<SamplerMode, "one_shot" | "chromatic">;
  adsr: AdsrEnvelope;
  transpose: number;
  fineTune: number;
  gain: number;
};

export type SamplerSettingsPatch = Omit<Partial<SamplerSettings>, "adsr"> & { adsr?: Partial<AdsrEnvelope> };

export type SamplerRuntimeState = {
  status: "idle" | "initializing" | "ready" | "error";
  sampleName: string;
  sampleLoaded: boolean;
  activeVoices: number;
  audioContextState: AudioContextState | "unavailable";
  currentTime: number;
  bpm: number;
  error?: string;
};

type Voice = {
  id: number;
  note: number;
  source: AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number;
  released: boolean;
};

type Listener = (state: SamplerRuntimeState) => void;

const DEFAULT_SETTINGS: SamplerSettings = {
  rootNote: 60,
  mode: "chromatic",
  adsr: { attack: 0.008, decay: 0.18, sustain: 0.72, release: 0.28 },
  transpose: 0,
  fineTune: 0,
  gain: 0.82,
};

const MIDI_A4 = 69;
const A4_HZ = 440;

function midiToFrequency(note: number) {
  return A4_HZ * 2 ** ((note - MIDI_A4) / 12);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
}

function createPianoStyleWavArrayBuffer() {
  const sampleRate = 44100;
  const duration = 2.4;
  const frames = Math.floor(sampleRate * duration);
  const channels = 1;
  const bytesPerSample = 2;
  const dataBytes = frames * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  const fundamental = midiToFrequency(60);
  for (let frame = 0; frame < frames; frame += 1) {
    const t = frame / sampleRate;
    const strike = Math.exp(-t * 7.5);
    const body = Math.exp(-t * 1.35);
    const hammer = Math.sin(2 * Math.PI * 3150 * t) * Math.exp(-t * 28) * 0.08;
    const tone =
      Math.sin(2 * Math.PI * fundamental * t) * 0.72 * body +
      Math.sin(2 * Math.PI * fundamental * 2.01 * t) * 0.25 * Math.exp(-t * 2.0) +
      Math.sin(2 * Math.PI * fundamental * 3.01 * t) * 0.12 * Math.exp(-t * 2.8) +
      Math.sin(2 * Math.PI * fundamental * 4.98 * t) * 0.06 * strike +
      hammer;
    const sample = clamp(tone * 0.72, -1, 1);
    view.setInt16(44 + frame * bytesPerSample, sample * 0x7fff, true);
  }

  return buffer;
}

export class BrowserSamplerEngine {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private limiter?: DynamicsCompressorNode;
  private sampleBuffer?: AudioBuffer;
  private voices = new Map<number, Voice[]>();
  private listeners = new Set<Listener>();
  private nextVoiceId = 1;
  private settings: SamplerSettings = DEFAULT_SETTINGS;
  private state: SamplerRuntimeState = {
    status: "idle",
    sampleName: "Built-in Soft Piano C4",
    sampleLoaded: false,
    activeVoices: 0,
    audioContextState: "unavailable",
    currentTime: 0,
    bpm: 120,
  };

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): SamplerRuntimeState {
    const audioContextState: AudioContextState | "unavailable" = this.context?.state ?? "unavailable";
    return { ...this.state, currentTime: this.context?.currentTime ?? 0, activeVoices: this.activeVoiceCount(), audioContextState };
  }

  get audioClockTime() {
    return this.context?.currentTime ?? 0;
  }

  getSettings() {
    return { ...this.settings, adsr: { ...this.settings.adsr } };
  }

  async initialize() {
    if (typeof window === "undefined") return;
    if (this.context) {
      if (this.context.state === "suspended") await this.context.resume();
      if (!this.sampleBuffer) await this.loadDefaultInstrument();
      this.emit({ status: "ready" });
      return;
    }

    this.emit({ status: "initializing", error: undefined });
    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextCtor({ latencyHint: "interactive" });
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.settings.gain;
      this.limiter = this.context.createDynamicsCompressor();
      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.12;
      this.masterGain.connect(this.limiter).connect(this.context.destination);
      await this.loadDefaultInstrument();
      this.context.onstatechange = () => this.emit({ audioContextState: this.context?.state ?? "unavailable" });
      this.emit({ status: "ready" });
    } catch (error) {
      this.emit({ status: "error", error: error instanceof Error ? error.message : "Audio initialization failed" });
    }
  }

  async loadDefaultInstrument() {
    if (!this.context) throw new Error("Audio engine must initialize before loading a sample.");
    const wav = createPianoStyleWavArrayBuffer();
    this.sampleBuffer = await this.context.decodeAudioData(wav.slice(0));
    this.emit({ sampleLoaded: true, sampleName: "Built-in Soft Piano C4" });
  }

  updateSettings(settings: SamplerSettingsPatch) {
    this.settings = { ...this.settings, ...settings, adsr: { ...this.settings.adsr, ...(settings.adsr ?? {}) } };
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(this.settings.gain, this.context?.currentTime ?? 0, 0.01);
    this.emit({});
  }

  setBpm(bpm: number) {
    this.emit({ bpm });
  }

  noteOn(note: number, velocity: number, when = this.context?.currentTime ?? 0) {
    if (!this.context || !this.masterGain || !this.sampleBuffer || velocity <= 0) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const { attack, decay, sustain } = this.settings.adsr;
    const playbackNote = this.settings.mode === "one_shot" ? this.settings.rootNote : note + this.settings.transpose;
    const semitones = playbackNote - this.settings.rootNote + this.settings.fineTune / 100;
    const velocityGain = clamp(velocity / 127, 0, 1);
    const startAt = Math.max(this.context.currentTime, when);
    const peak = velocityGain * velocityGain;

    source.buffer = this.sampleBuffer;
    source.playbackRate.value = 2 ** (semitones / 12);
    gain.gain.cancelScheduledValues(startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), startAt + Math.max(0.001, attack));
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), startAt + Math.max(0.001, attack) + Math.max(0.001, decay));
    source.connect(gain).connect(this.masterGain);

    const voice: Voice = { id: this.nextVoiceId, note, source, gain, startedAt: startAt, released: false };
    this.nextVoiceId += 1;
    const voicesForNote = this.voices.get(note) ?? [];
    voicesForNote.push(voice);
    this.voices.set(note, voicesForNote);
    source.onended = () => this.removeVoice(voice);
    source.start(startAt);
    this.emit({});
  }

  noteOff(note: number, when = this.context?.currentTime ?? 0) {
    if (!this.context) return;
    const voices = this.voices.get(note) ?? [];
    const releaseAt = Math.max(this.context.currentTime, when);
    voices.forEach((voice) => this.releaseVoice(voice, releaseAt));
  }

  allNotesOff() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.voices.forEach((voices) => voices.forEach((voice) => this.releaseVoice(voice, now, 0.03)));
  }

  private releaseVoice(voice: Voice, when: number, releaseOverride?: number) {
    if (voice.released) return;
    voice.released = true;
    const release = releaseOverride ?? this.settings.adsr.release;
    voice.gain.gain.cancelScheduledValues(when);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), when);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.01, release));
    voice.source.stop(when + Math.max(0.012, release) + 0.02);
    this.emit({});
  }

  private removeVoice(voice: Voice) {
    const voices = (this.voices.get(voice.note) ?? []).filter((candidate) => candidate.id !== voice.id);
    if (voices.length > 0) this.voices.set(voice.note, voices);
    else this.voices.delete(voice.note);
    voice.gain.disconnect();
    this.emit({});
  }

  private activeVoiceCount() {
    let count = 0;
    this.voices.forEach((voices) => { count += voices.length; });
    return count;
  }

  private emit(partial: Partial<SamplerRuntimeState>) {
    this.state = { ...this.state, ...partial };
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

declare global {
  interface Window { webkitAudioContext?: typeof AudioContext; }
}

export const samplerEngine = new BrowserSamplerEngine();
