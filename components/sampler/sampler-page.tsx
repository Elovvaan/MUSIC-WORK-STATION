"use client";

import { useEffect, useMemo, useState } from "react";
import { samplerEngine, type SamplerRuntimeState, type SamplerSettings, type SamplerSettingsPatch } from "@/lib/audio/sampler-engine";
import { midiRuntime, type MidiRuntimeState } from "@/lib/midi/browser-midi";
import { useAppStore } from "@/lib/state/app-store";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ROOT_NOTE_OPTIONS = Array.from({ length: 49 }, (_, index) => index + 36);

function midiNoteLabel(note: number) {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

const initialAudioState: SamplerRuntimeState = {
  status: "idle",
  sampleName: "Built-in Soft Piano C4",
  sampleLoaded: false,
  activeVoices: 0,
  audioContextState: "unavailable",
  currentTime: 0,
  bpm: 120,
};

const initialMidiState: MidiRuntimeState = { status: "idle", inputs: [], sustainActive: false };

export function SamplerPage() {
  const transport = useAppStore((s) => s.transport);
  const ensureSamplerTrack = useAppStore((s) => s.ensureSamplerTrack);
  const recordMidiNoteOn = useAppStore((s) => s.recordMidiNoteOn);
  const recordMidiNoteOff = useAppStore((s) => s.recordMidiNoteOff);
  const midiClips = useAppStore((s) => s.midiClips);
  const tracks = useAppStore((s) => s.tracks);
  const [audioState, setAudioState] = useState<SamplerRuntimeState>(initialAudioState);
  const [midiState, setMidiState] = useState<MidiRuntimeState>(initialMidiState);
  const [settings, setSettings] = useState<SamplerSettings>(() => samplerEngine.getSettings());

  const armedSamplerTrack = useMemo(() => tracks.find((track) => track.type === "sampler" && track.isArmed), [tracks]);

  useEffect(() => {
    ensureSamplerTrack();
    const unsubscribeAudio = samplerEngine.subscribe(setAudioState);
    const unsubscribeMidiState = midiRuntime.subscribe(setMidiState);
    const unsubscribeMidiEvents = midiRuntime.onMidi((event) => {
      if (event.type === "noteon" && typeof event.note === "number" && typeof event.velocity === "number") {
        samplerEngine.initialize().then(() => {
          samplerEngine.noteOn(event.note!, event.velocity!);
          recordMidiNoteOn(event.note!, event.velocity!, event.channel, samplerEngine.audioClockTime);
        });
      }
      if (event.type === "noteoff" && typeof event.note === "number") {
        samplerEngine.noteOff(event.note);
        recordMidiNoteOff(event.note, event.channel, samplerEngine.audioClockTime);
      }
    });

    samplerEngine.initialize();
    midiRuntime.initialize();

    return () => {
      unsubscribeAudio();
      unsubscribeMidiState();
      unsubscribeMidiEvents();
      samplerEngine.allNotesOff();
    };
  }, [ensureSamplerTrack, recordMidiNoteOff, recordMidiNoteOn]);

  useEffect(() => {
    samplerEngine.setBpm(transport.bpm);
  }, [transport.bpm]);

  function applySettings(next: SamplerSettingsPatch) {
    const merged = { ...settings, ...next, adsr: { ...settings.adsr, ...(next.adsr ?? {}) } };
    setSettings(merged);
    samplerEngine.updateSettings(next);
  }

  function audition(note = settings.rootNote) {
    samplerEngine.initialize().then(() => {
      samplerEngine.noteOn(note, 104);
      window.setTimeout(() => samplerEngine.noteOff(note), 650);
    });
  }

  const lastMidi = midiState.lastEvent;

  return (
    <>
      <section className="panel">
        <h1>Sampler</h1>
        <div className="control-row">
          <button onClick={() => samplerEngine.initialize()}>{audioState.status === "ready" ? "Audio Ready" : "Enable Audio"}</button>
          <button onClick={() => midiRuntime.initialize()}>{midiState.status === "ready" ? "Refresh MIDI" : "Enable MIDI"}</button>
          <button onClick={() => audition()}>Audition Root</button>
          <button onClick={() => samplerEngine.allNotesOff()}>All Notes Off</button>
          <select value={settings.mode} onChange={(event) => applySettings({ mode: event.target.value as SamplerSettings["mode"] })}>
            <option value="chromatic">chromatic</option>
            <option value="one_shot">one_shot</option>
          </select>
        </div>
      </section>

      <section className="grid-2">
        <div className="panel">
          <h3>Audio Engine Runtime</h3>
          <p>Status: {audioState.status} / context: {audioState.audioContextState}</p>
          <p>Master bus: connected · gain: {Math.round(settings.gain * 100)}% · active voices: {audioState.activeVoices}</p>
          <p>Clock: {audioState.currentTime.toFixed(3)}s · transport BPM: {transport.bpm}</p>
          {audioState.error ? <p>{audioState.error}</p> : null}
        </div>
        <div className="panel">
          <h3>MIDI Runtime</h3>
          <p>Status: {midiState.status} · Inputs: {midiState.inputs.length} · Sustain: {midiState.sustainActive ? "down" : "up"}</p>
          <div className="control-row">
            {midiState.inputs.length === 0 ? <span>No MIDI inputs detected.</span> : midiState.inputs.map((input) => <span key={input.id}>{input.name} ({input.state ?? "connected"})</span>)}
          </div>
          <p>MIDI activity: {lastMidi ? `${lastMidi.type} ${typeof lastMidi.note === "number" ? midiNoteLabel(lastMidi.note) : lastMidi.controller} velocity ${lastMidi.velocity ?? lastMidi.value ?? 0} from ${lastMidi.sourceName}` : "waiting"}</p>
          {midiState.error ? <p>{midiState.error}</p> : null}
        </div>
      </section>

      <section className="grid-3">
        <div className="panel">
          <h3>Default Test Instrument</h3>
          <p>Sample: {audioState.sampleName}</p>
          <p>Load state: {audioState.sampleLoaded ? "decoded and mapped" : "loading"}</p>
          <p>Root note: C4 piano-style sample, mapped chromatically by playback-rate pitch shifting.</p>
        </div>
        <div className="panel">
          <h3>Root Note Assignment</h3>
          <label>
            Root note{" "}
            <select value={settings.rootNote} onChange={(event) => applySettings({ rootNote: Number(event.target.value) })}>
              {ROOT_NOTE_OPTIONS.map((note) => <option value={note} key={note}>{midiNoteLabel(note)}</option>)}
            </select>
          </label>
          <p>Current root: {midiNoteLabel(settings.rootNote)}</p>
        </div>
        <div className="panel">
          <h3>Playback</h3>
          <p>Play a connected MIDI keyboard, or audition test notes here.</p>
          <div className="control-row">
            {[60, 62, 64, 67, 72].map((note) => <button key={note} onClick={() => audition(note)}>{midiNoteLabel(note)}</button>)}
          </div>
        </div>
      </section>

      <section className="grid-3">
        <div className="panel">
          <h3>ADSR Envelope</h3>
          {(["attack", "decay", "sustain", "release"] as const).map((key) => (
            <label key={key}>
              {key} {settings.adsr[key].toFixed(key === "sustain" ? 2 : 3)}
              <input
                type="range"
                min={key === "sustain" ? 0 : 0.001}
                max={key === "sustain" ? 1 : 2}
                step={key === "sustain" ? 0.01 : 0.001}
                value={settings.adsr[key]}
                onChange={(event) => applySettings({ adsr: { [key]: Number(event.target.value) } as Partial<SamplerSettings["adsr"]> })}
              />
            </label>
          ))}
        </div>
        <div className="panel">
          <h3>Tune / Gain</h3>
          <label>Transpose {settings.transpose} st <input type="range" min={-24} max={24} step={1} value={settings.transpose} onChange={(event) => applySettings({ transpose: Number(event.target.value) })} /></label>
          <label>Fine tune {settings.fineTune} cents <input type="range" min={-100} max={100} step={1} value={settings.fineTune} onChange={(event) => applySettings({ fineTune: Number(event.target.value) })} /></label>
          <label>Master gain {Math.round(settings.gain * 100)}% <input type="range" min={0} max={1} step={0.01} value={settings.gain} onChange={(event) => applySettings({ gain: Number(event.target.value) })} /></label>
        </div>
        <div className="panel">
          <h3>Studio Integration</h3>
          <p>Armed route: {armedSamplerTrack?.name ?? "creating sampler track"}</p>
          <p>Recording: {transport.isRecording ? "capturing MIDI note clips" : "idle"}</p>
          <p>Recorded MIDI clips this session: {midiClips.length}</p>
        </div>
      </section>
    </>
  );
}
