"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { samplerEngine, type SamplerRuntimeState, type SamplerSettings, type SamplerSettingsPatch } from "@/lib/audio/sampler-engine";
import { midiRuntime, type MidiRuntimeState } from "@/lib/midi/browser-midi";
import { loadProjectState, saveProjectState } from "@/lib/persistence/browser-project-adapter";
import { quantizeBeatToGrid, useAppStore } from "@/lib/state/app-store";
import type { MidiClip, MidiNote } from "@/lib/types/models";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ROOT_NOTE_OPTIONS = Array.from({ length: 49 }, (_, index) => index + 36);
const PIANO_ROLL_LOW_NOTE = 36;
const PIANO_ROLL_HIGH_NOTE = 84;
const PIANO_ROLL_NOTE_COUNT = PIANO_ROLL_HIGH_NOTE - PIANO_ROLL_LOW_NOTE + 1;
const BEAT_WIDTH = 44;
const NOTE_HEIGHT = 12;
const SCHEDULER_MS = 25;
const LOOKAHEAD_SECONDS = 0.16;

function midiNoteLabel(note: number) {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

function beatDuration(bpm: number) {
  return 60 / Math.max(1, bpm);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clipEndBeat(clip: MidiClip) {
  return clip.startBeat + Math.max(clip.durationBeats, clip.notes.reduce((end, note) => Math.max(end, note.start + note.duration), 0), 1);
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

type PlayAnchor = { audioStart: number; beatStart: number; lastBeat: number };
type DragState =
  | { type: "clip-move"; clipId: string; pointerStartX: number; originalStartBeat: number }
  | { type: "clip-trim-left"; clipId: string; pointerStartX: number; originalStartBeat: number; originalDuration: number }
  | { type: "clip-trim-right"; clipId: string; pointerStartX: number; originalDuration: number }
  | { type: "note-move"; clipId: string; noteId: string; pointerStartX: number; pointerStartY: number; originalStart: number; originalNote: number }
  | { type: "note-resize"; clipId: string; noteId: string; pointerStartX: number; originalDuration: number };

export function SamplerPage() {
  const transport = useAppStore((s) => s.transport);
  const ensureSamplerTrack = useAppStore((s) => s.ensureSamplerTrack);
  const beginRecordingPass = useAppStore((s) => s.beginRecordingPass);
  const endRecordingPass = useAppStore((s) => s.endRecordingPass);
  const recordMidiNoteOn = useAppStore((s) => s.recordMidiNoteOn);
  const recordMidiNoteOff = useAppStore((s) => s.recordMidiNoteOff);
  const setTransportBeat = useAppStore((s) => s.setTransportBeat);
  const updateMidiClip = useAppStore((s) => s.updateMidiClip);
  const duplicateMidiClip = useAppStore((s) => s.duplicateMidiClip);
  const deleteMidiClip = useAppStore((s) => s.deleteMidiClip);
  const selectMidiClip = useAppStore((s) => s.selectMidiClip);
  const selectMidiNote = useAppStore((s) => s.selectMidiNote);
  const updateMidiNote = useAppStore((s) => s.updateMidiNote);
  const hydrateProjectState = useAppStore((s) => s.hydrateProjectState);
  const projectSnapshot = useAppStore((s) => s.projectSnapshot);
  const markSaved = useAppStore((s) => s.markSaved);
  const markSaving = useAppStore((s) => s.markSaving);
  const markSaveError = useAppStore((s) => s.markSaveError);
  const setSnapGrid = useAppStore((s) => s.setSnapGrid);
  const quantizeSelectedNotes = useAppStore((s) => s.quantizeSelectedNotes);
  const quantizeClip = useAppStore((s) => s.quantizeClip);
  const setSamplerSettings = useAppStore((s) => s.setSamplerSettings);
  const midiClips = useAppStore((s) => s.midiClips);
  const selectedMidiClipId = useAppStore((s) => s.selectedMidiClipId);
  const selectedMidiNoteId = useAppStore((s) => s.selectedMidiNoteId);
  const tracks = useAppStore((s) => s.tracks);
  const currentProject = useAppStore((s) => s.currentProject);
  const snapGrid = useAppStore((s) => s.snapGrid);
  const saveStatus = useAppStore((s) => s.saveStatus);
  const lastSaveError = useAppStore((s) => s.lastSaveError);
  const persistenceRevision = useAppStore((s) => s.persistenceRevision);
  const [audioState, setAudioState] = useState<SamplerRuntimeState>(initialAudioState);
  const [midiState, setMidiState] = useState<MidiRuntimeState>(initialMidiState);
  const [settings, setSettings] = useState<SamplerSettings>(() => samplerEngine.getSettings());
  const playAnchor = useRef<PlayAnchor | null>(null);
  const scheduledNotes = useRef(new Set<string>());
  const dragState = useRef<DragState | null>(null);
  const recordingWasActive = useRef(false);
  const metronomeBeat = useRef(-1);
  const hasHydrated = useRef(false);

  const armedSamplerTrack = useMemo(() => tracks.find((track) => track.type === "sampler" && track.isArmed), [tracks]);
  const selectedClip = useMemo(() => midiClips.find((clip) => clip.id === selectedMidiClipId) ?? midiClips[0], [midiClips, selectedMidiClipId]);

  useEffect(() => {
    let cancelled = false;
    loadProjectState(currentProject?.id ?? "browser-session").then((snapshot) => {
      if (!cancelled && snapshot) {
        hydrateProjectState(snapshot);
        if (snapshot.samplerSettings) {
          samplerEngine.updateSettings(snapshot.samplerSettings);
          setSettings(snapshot.samplerSettings);
        }
      }
      hasHydrated.current = true;
    }).catch((error) => {
      hasHydrated.current = true;
      markSaveError(error instanceof Error ? error.message : "Project load failed");
    });
    return () => { cancelled = true; };
  }, [currentProject?.id, hydrateProjectState, markSaveError]);

  useEffect(() => {
    if (!hasHydrated.current || saveStatus !== "unsaved") return;
    const projectId = currentProject?.id ?? "browser-session";
    const timeout = window.setTimeout(() => {
      markSaving();
      saveProjectState(projectId, projectSnapshot()).then(() => {
        markSaved();
      }).catch((error) => markSaveError(error instanceof Error ? error.message : "Autosave failed"));
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [currentProject?.id, markSaveError, markSaved, markSaving, persistenceRevision, projectSnapshot, saveStatus]);

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

  useEffect(() => {
    if (transport.isRecording && !recordingWasActive.current && !transport.countInActive) {
      samplerEngine.initialize().then(() => beginRecordingPass(samplerEngine.audioClockTime));
      recordingWasActive.current = true;
    }
    if (!transport.isRecording && recordingWasActive.current) {
      endRecordingPass(samplerEngine.audioClockTime);
      recordingWasActive.current = false;
    }
  }, [beginRecordingPass, endRecordingPass, transport.countInActive, transport.isRecording]);

  useEffect(() => {
    if (!transport.isPlaying) {
      playAnchor.current = null;
      scheduledNotes.current.clear();
      samplerEngine.allNotesOff();
      return;
    }

    let disposed = false;
    samplerEngine.initialize().then(() => {
      if (disposed) return;
      playAnchor.current = { audioStart: samplerEngine.audioClockTime, beatStart: transport.currentBeat, lastBeat: transport.currentBeat };
      scheduledNotes.current.clear();
    });

    const interval = window.setInterval(() => {
      const anchor = playAnchor.current;
      if (!anchor) return;
      const secondsPerBeat = beatDuration(transport.bpm);
      const now = samplerEngine.audioClockTime;
      let currentBeat = anchor.beatStart + (now - anchor.audioStart) / secondsPerBeat;

      if (transport.loopEnabled && currentBeat >= transport.loopEndBeat) {
        samplerEngine.allNotesOff();
        currentBeat = transport.loopStartBeat;
        playAnchor.current = { audioStart: now, beatStart: transport.loopStartBeat, lastBeat: transport.loopStartBeat };
        scheduledNotes.current.clear();
      } else if (currentBeat < anchor.lastBeat) {
        scheduledNotes.current.clear();
      } else {
        anchor.lastBeat = currentBeat;
      }

      setTransportBeat(currentBeat);
      scheduleMetronome(currentBeat, now, secondsPerBeat);
      scheduleClipPlayback(currentBeat, now, secondsPerBeat);
    }, SCHEDULER_MS);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      scheduledNotes.current.clear();
      samplerEngine.allNotesOff();
    };
  }, [midiClips, setTransportBeat, transport.bpm, transport.currentBeat, transport.isPlaying, transport.loopEnabled, transport.loopEndBeat, transport.loopStartBeat, transport.metronomeEnabled]);

  function scheduleMetronome(currentBeat: number, audioNow: number, secondsPerBeat: number) {
    if (!transport.metronomeEnabled) return;
    const nextBeat = Math.floor(currentBeat + LOOKAHEAD_SECONDS / secondsPerBeat);
    if (nextBeat <= metronomeBeat.current) return;
    metronomeBeat.current = nextBeat;
    samplerEngine.click(audioNow + Math.max(0, nextBeat - currentBeat) * secondsPerBeat, nextBeat % 4 === 0);
  }

  function scheduleClipPlayback(currentBeat: number, audioNow: number, secondsPerBeat: number) {
    const lookaheadBeats = LOOKAHEAD_SECONDS / secondsPerBeat;
    const windowEnd = currentBeat + lookaheadBeats;
    midiClips.forEach((clip) => {
      const clipLength = Math.max(1, clip.durationBeats);
      const firstLoop = clip.loopEnabled ? Math.max(0, Math.floor((currentBeat - clip.startBeat) / clipLength) - 1) : 0;
      const lastLoop = clip.loopEnabled ? Math.ceil((windowEnd - clip.startBeat) / clipLength) + 1 : 0;
      for (let loopIndex = firstLoop; loopIndex <= lastLoop; loopIndex += 1) {
        const occurrenceStart = clip.startBeat + loopIndex * clipLength;
        const occurrenceEnd = occurrenceStart + clipLength;
        if (occurrenceEnd < currentBeat || occurrenceStart > windowEnd) continue;
        clip.notes.forEach((note) => {
          const noteBeat = occurrenceStart + note.start;
          if (noteBeat < currentBeat || noteBeat > windowEnd) return;
          const noteId = `${clip.id}:${loopIndex}:${note.id ?? `${note.note}-${note.start}`}`;
          if (scheduledNotes.current.has(noteId)) return;
          scheduledNotes.current.add(noteId);
          const when = audioNow + Math.max(0, noteBeat - currentBeat) * secondsPerBeat;
          samplerEngine.noteOn(note.note, note.velocity, when);
          samplerEngine.noteOff(note.note, when + Math.max(0.03, note.duration * secondsPerBeat));
        });
      }
    });
  }

  function applySettings(next: SamplerSettingsPatch) {
    const merged = { ...settings, ...next, adsr: { ...settings.adsr, ...(next.adsr ?? {}) } };
    setSettings(merged);
    samplerEngine.updateSettings(next);
    setSamplerSettings(merged);
  }

  function audition(note = settings.rootNote) {
    samplerEngine.initialize().then(() => {
      samplerEngine.noteOn(note, 104);
      window.setTimeout(() => samplerEngine.noteOff(note), 650);
    });
  }

  function beginDrag(event: PointerEvent<HTMLElement>, nextDrag: DragState) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = nextDrag;
  }

  function handleDrag(event: PointerEvent<HTMLElement>) {
    const drag = dragState.current;
    if (!drag) return;
    const rawBeatDelta = (event.clientX - drag.pointerStartX) / BEAT_WIDTH;
    const beatDelta = snapGrid === "off" ? rawBeatDelta : quantizeBeatToGrid(rawBeatDelta, snapGrid);
    if (drag.type === "clip-move") updateMidiClip(drag.clipId, { startBeat: Math.max(0, drag.originalStartBeat + beatDelta), startBar: Math.floor(Math.max(0, drag.originalStartBeat + beatDelta) / 4) + 1 });
    if (drag.type === "clip-trim-left") {
      const nextStart = clamp(drag.originalStartBeat + beatDelta, 0, drag.originalStartBeat + drag.originalDuration - 1);
      updateMidiClip(drag.clipId, { startBeat: nextStart, startBar: Math.floor(nextStart / 4) + 1, durationBeats: Math.max(1, drag.originalDuration - (nextStart - drag.originalStartBeat)) });
    }
    if (drag.type === "clip-trim-right") updateMidiClip(drag.clipId, { durationBeats: Math.max(1, drag.originalDuration + beatDelta) });
    if (drag.type === "note-move") {
      const pitchDelta = Math.round((event.clientY - drag.pointerStartY) / NOTE_HEIGHT);
      updateMidiNote(drag.clipId, drag.noteId, { start: Math.max(0, drag.originalStart + beatDelta), note: clamp(drag.originalNote - pitchDelta, 0, 127) });
    }
    if (drag.type === "note-resize") updateMidiNote(drag.clipId, drag.noteId, { duration: Math.max(0.125, drag.originalDuration + beatDelta) });
  }

  function endDrag() {
    dragState.current = null;
  }

  function noteId(note: MidiNote) {
    return note.id ?? `${note.note}-${note.start}-${note.channel}`;
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
          <button onClick={() => samplerEngine.panic()}>All Notes Off</button>
          <span>Autosave: {saveStatus}{lastSaveError ? ` (${lastSaveError})` : ""}</span>
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
          <p>Clock: {audioState.currentTime.toFixed(3)}s · transport beat: {transport.currentBeat.toFixed(2)} · BPM: {transport.bpm}</p>
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
          <p>Transport play schedules recorded clips through this sampler, with polyphony and looping.</p>
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
          <p>Recording: {transport.isRecording ? "capturing one pass into one clip" : "idle"}</p>
          <p>Recorded MIDI clips this session: {midiClips.length}</p>
        </div>
      </section>

      <section className="panel">
        <h3>Sampler Timeline</h3>
        <div className="control-row">
          <span>Cursor beat {transport.currentBeat.toFixed(2)}</span>
          <span>Loop {transport.loopStartBeat}–{transport.loopEndBeat}</span>
          <label>Snap <select value={snapGrid} onChange={(event) => setSnapGrid(event.target.value as typeof snapGrid)}><option value="off">off</option><option value="1/4">1/4</option><option value="1/8">1/8</option><option value="1/16">1/16</option><option value="1/32">1/32</option></select></label>
          {selectedClip ? <button onClick={() => duplicateMidiClip(selectedClip.id)}>Duplicate selected clip</button> : null}
          {selectedClip ? <button onClick={() => quantizeClip(selectedClip.id)}>Quantize whole clip</button> : null}
          {selectedClip ? <button onClick={() => quantizeSelectedNotes()}>Quantize selected notes</button> : null}
          {selectedClip ? <button onClick={() => updateMidiClip(selectedClip.id, { loopEnabled: !selectedClip.loopEnabled })}>Clip loop: {selectedClip.loopEnabled ? "On" : "Off"}</button> : null}
          {selectedClip ? <button onClick={() => deleteMidiClip(selectedClip.id)}>Delete selected clip</button> : null}
        </div>
        <div className="sampler-timeline" onPointerMove={handleDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <div className="timeline-cursor" style={{ left: `${transport.currentBeat * BEAT_WIDTH}px` }} />
          {Array.from({ length: 17 }, (_, beat) => <div className="timeline-gridline" style={{ left: `${beat * BEAT_WIDTH}px` }} key={beat}>{beat + 1}</div>)}
          {midiClips.map((clip) => (
            <div
              className={`timeline-clip ${clip.id === selectedClip?.id ? "selected" : ""}`}
              key={clip.id}
              style={{ left: `${clip.startBeat * BEAT_WIDTH}px`, width: `${Math.max(1, clip.durationBeats) * BEAT_WIDTH}px` }}
              onPointerDown={(event) => { selectMidiClip(clip.id); beginDrag(event, { type: "clip-move", clipId: clip.id, pointerStartX: event.clientX, originalStartBeat: clip.startBeat }); }}
            >
              <span className="clip-trim left" onPointerDown={(event) => { event.stopPropagation(); selectMidiClip(clip.id); beginDrag(event, { type: "clip-trim-left", clipId: clip.id, pointerStartX: event.clientX, originalStartBeat: clip.startBeat, originalDuration: clip.durationBeats }); }} />
              <strong>{clip.notes.length} notes</strong>
              <small>{clip.loopEnabled ? " loop" : ""}</small>
              <span className="clip-trim right" onPointerDown={(event) => { event.stopPropagation(); selectMidiClip(clip.id); beginDrag(event, { type: "clip-trim-right", clipId: clip.id, pointerStartX: event.clientX, originalDuration: clip.durationBeats }); }} />
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Piano Roll</h3>
        {selectedClip ? (
          <div className="piano-roll" style={{ height: `${PIANO_ROLL_NOTE_COUNT * NOTE_HEIGHT}px` }} onPointerMove={handleDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            {selectedClip.notes.map((note) => {
              const id = noteId(note);
              return (
                <div
                  className={`piano-note ${selectedMidiNoteId === id ? "selected" : ""}`}
                  key={id}
                  style={{
                    left: `${note.start * BEAT_WIDTH}px`,
                    top: `${clamp(PIANO_ROLL_HIGH_NOTE - note.note, 0, PIANO_ROLL_NOTE_COUNT - 1) * NOTE_HEIGHT}px`,
                    width: `${Math.max(0.125, note.duration) * BEAT_WIDTH}px`,
                  }}
                  title={`${midiNoteLabel(note.note)} · ${note.duration.toFixed(2)} beats · velocity ${note.velocity}`}
                  onPointerDown={(event) => { selectMidiClip(selectedClip.id); selectMidiNote(id); beginDrag(event, { type: "note-move", clipId: selectedClip.id, noteId: id, pointerStartX: event.clientX, pointerStartY: event.clientY, originalStart: note.start, originalNote: note.note }); }}
                >
                  <span>{midiNoteLabel(note.note)}</span>
                  <i onPointerDown={(event) => { event.stopPropagation(); selectMidiNote(id); beginDrag(event, { type: "note-resize", clipId: selectedClip.id, noteId: id, pointerStartX: event.clientX, originalDuration: note.duration }); }} />
                </div>
              );
            })}
          </div>
        ) : <p>Record a MIDI pass to create a clip and show notes here.</p>}
      </section>
    </>
  );
}
