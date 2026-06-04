"use client";

import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { samplerEngine } from "@/lib/audio/sampler-engine";
import { midiRuntime } from "@/lib/midi/browser-midi";
import { useAppStore } from "@/lib/state/app-store";
import { logEvent } from "@/lib/intelligence/telemetry";
import type { MidiClip, MidiNote, Track, TrackType } from "@/lib/types/models";

const BAR_COUNT = 20;
const BEATS_PER_BAR = 4;
const TOTAL_BEATS = BAR_COUNT * BEATS_PER_BAR;
const TRACK_HEIGHT = 92;
const TIMELINE_BEAT_WIDTH = 38;
const LOOKAHEAD_SECONDS = 0.12;
const SCHEDULER_MS = 45;
const NOTE_LOW = 48;
const NOTE_HIGH = 84;

const trackSeed: Array<{ type: TrackType; name: string; input: string }> = [
  { type: "sampler", name: "Live Sampler", input: "Sampler Engine" },
  { type: "audio", name: "Audio 1", input: "Input 1" },
  { type: "midi", name: "MIDI Keys", input: "Web MIDI" },
  { type: "vocal", name: "Lead Vocal", input: "Mic Input" },
];

function beatDuration(bpm: number) {
  return 60 / Math.max(1, bpm);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(totalBeats: number, bpm: number) {
  const seconds = Math.max(0, totalBeats * beatDuration(bpm));
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  const frames = Math.floor((seconds % 1) * 100).toString().padStart(2, "0");
  return `${minutes}:${remainder}.${frames}`;
}

function formatBarsBeats(totalBeats: number) {
  const safeBeat = Math.max(0, totalBeats);
  const bar = Math.floor(safeBeat / BEATS_PER_BAR) + 1;
  const beat = Math.floor(safeBeat % BEATS_PER_BAR) + 1;
  const tick = Math.floor((safeBeat % 1) * 960);
  return `${bar}.${beat}.${tick.toString().padStart(3, "0")}`;
}

function trackTypeLabel(type: TrackType) {
  if (type === "sampler") return "MIDI/Sampler";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function makeTrack(projectId: string, type: TrackType, index: number): Track {
  const name = type === "sampler" ? `Sampler ${index}` : type === "midi" ? `MIDI ${index}` : type === "vocal" ? `Vocal ${index}` : `Audio ${index}`;
  return {
    id: `track-${type}-${Date.now()}-${index}`,
    projectId,
    type,
    name,
    isMuted: false,
    isSolo: false,
    isArmed: type === "sampler" || type === "midi",
    volume: 0.8,
    pan: 0,
  };
}

function StudioRuntime() {
  const transport = useAppStore((s) => s.transport);
  const midiClips = useAppStore((s) => s.midiClips);
  const beginRecordingPass = useAppStore((s) => s.beginRecordingPass);
  const endRecordingPass = useAppStore((s) => s.endRecordingPass);
  const recordMidiNoteOn = useAppStore((s) => s.recordMidiNoteOn);
  const recordMidiNoteOff = useAppStore((s) => s.recordMidiNoteOff);
  const setTransportBeat = useAppStore((s) => s.setTransportBeat);
  const recordingWasActive = useRef(false);
  const playAnchor = useRef<{ audioStart: number; beatStart: number; lastBeat: number } | null>(null);
  const scheduledNotes = useRef(new Set<string>());
  const metronomeBeat = useRef(-1);

  useEffect(() => {
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
      unsubscribeMidiEvents();
      samplerEngine.allNotesOff();
    };
  }, [recordMidiNoteOff, recordMidiNoteOn]);

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
      } else {
        anchor.lastBeat = currentBeat;
      }

      setTransportBeat(currentBeat);
      if (transport.metronomeEnabled) {
        const nextBeat = Math.floor(currentBeat + LOOKAHEAD_SECONDS / secondsPerBeat);
        if (nextBeat > metronomeBeat.current) {
          metronomeBeat.current = nextBeat;
          samplerEngine.click(now + Math.max(0, nextBeat - currentBeat) * secondsPerBeat, nextBeat % BEATS_PER_BAR === 0);
        }
      }

      const windowEnd = currentBeat + LOOKAHEAD_SECONDS / secondsPerBeat;
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
            const when = now + Math.max(0, noteBeat - currentBeat) * secondsPerBeat;
            samplerEngine.noteOn(note.note, note.velocity, when);
            samplerEngine.noteOff(note.note, when + Math.max(0.03, note.duration * secondsPerBeat));
          });
        }
      });
    }, SCHEDULER_MS);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      scheduledNotes.current.clear();
      samplerEngine.allNotesOff();
    };
  }, [midiClips, setTransportBeat, transport.bpm, transport.currentBeat, transport.isPlaying, transport.loopEnabled, transport.loopEndBeat, transport.loopStartBeat, transport.metronomeEnabled]);

  return null;
}

function TransportBar({ projectId }: { projectId: string }) {
  const transport = useAppStore((s) => s.transport);
  const setTransport = useAppStore((s) => s.setTransport);
  const saveStatus = useAppStore((s) => s.saveStatus);

  function stopAndReturn() {
    samplerEngine.allNotesOff();
    setTransport({ isPlaying: false, isRecording: false, countInActive: false, countInRemainingBeats: 0, currentBeat: 0 });
  }

  function togglePlay() {
    if (transport.isPlaying) {
      samplerEngine.allNotesOff();
      setTransport({ isPlaying: false, isRecording: false });
      return;
    }
    setTransport({ isPlaying: true });
  }

  function toggleRecord() {
    if (transport.isRecording || transport.countInActive) {
      setTransport({ isRecording: false, countInActive: false, countInRemainingBeats: 0, isPlaying: false });
      return;
    }
    if (transport.countInBars > 0) {
      const countInBeats = transport.countInBars * BEATS_PER_BAR;
      setTransport({ isPlaying: true, isRecording: false, countInActive: true, countInRemainingBeats: countInBeats });
      samplerEngine.initialize().then(() => {
        const secondsPerBeat = beatDuration(transport.bpm);
        const startAt = samplerEngine.audioClockTime + 0.05;
        for (let beat = 0; beat < countInBeats; beat += 1) {
          window.setTimeout(() => setTransport({ countInRemainingBeats: countInBeats - beat }), beat * secondsPerBeat * 1000);
          samplerEngine.click(startAt + beat * secondsPerBeat, beat % BEATS_PER_BAR === 0);
        }
        window.setTimeout(() => setTransport({ isRecording: true, countInActive: false, countInRemainingBeats: 0 }), countInBeats * secondsPerBeat * 1000);
      });
      return;
    }
    setTransport({ isRecording: true, isPlaying: true });
  }

  return (
    <header className="studio-transport" aria-label="Studio transport">
      <div className="transport-left">
        <button className={transport.isPlaying ? "transport-btn active" : "transport-btn"} onClick={togglePlay}>▶ Play</button>
        <button className="transport-btn" onClick={stopAndReturn}>■ Stop/Return</button>
        <button className={transport.isRecording || transport.countInActive ? "transport-btn record active" : "transport-btn record"} onClick={toggleRecord}>
          ● {transport.countInActive ? `Count ${transport.countInRemainingBeats}` : "Record"}
        </button>
        <button className={transport.loopEnabled ? "transport-btn active" : "transport-btn"} onClick={() => setTransport({ loopEnabled: !transport.loopEnabled })}>↻ Loop</button>
      </div>
      <div className="transport-center">
        <label>BPM <input value={transport.bpm} type="number" min={20} max={300} onChange={(event) => setTransport({ bpm: Number(event.target.value) })} /></label>
        <span className="transport-readout">{formatTime(transport.currentBeat, transport.bpm)}</span>
        <span className="transport-readout bars">{formatBarsBeats(transport.currentBeat)}</span>
        <label className="toggle"><input type="checkbox" checked={transport.metronomeEnabled} onChange={(event) => setTransport({ metronomeEnabled: event.target.checked })} /> Metro</label>
        <label>Count <select value={transport.countInBars} onChange={(event) => setTransport({ countInBars: Number(event.target.value) as 0 | 1 | 2 })}><option value={0}>Off</option><option value={1}>1 bar</option><option value={2}>2 bars</option></select></label>
      </div>
      <div className="transport-right">
        <label>Master <input type="range" min="0" max="100" defaultValue="82" /></label>
        <span className={`save-pill ${saveStatus}`}>{saveStatus}</span>
        <span className="project-pill">/{projectId}</span>
      </div>
    </header>
  );
}

function TrackRail({ selectedTrackId, onSelectTrack }: { selectedTrackId?: string; onSelectTrack: (trackId: string) => void }) {
  const tracks = useAppStore((s) => s.tracks);
  const setTracks = useAppStore((s) => s.setTracks);
  const currentProject = useAppStore((s) => s.currentProject);

  function addTrack(type: TrackType = "sampler") {
    const next = makeTrack(currentProject?.id ?? "demo-project", type, tracks.length + 1);
    setTracks([...tracks, next]);
    onSelectTrack(next.id);
  }

  function patchTrack(trackId: string, partial: Partial<Track>) {
    setTracks(tracks.map((track) => track.id === trackId ? { ...track, ...partial } : track));
  }

  return (
    <aside className="studio-track-rail">
      <div className="rail-header">
        <button className="add-track" onClick={() => addTrack("sampler")}>＋ Add Track</button>
        <div className="track-type-buttons">
          <button onClick={() => addTrack("audio")}>Audio</button>
          <button onClick={() => addTrack("midi")}>MIDI/Sampler</button>
          <button onClick={() => addTrack("vocal")}>Vocal</button>
        </div>
      </div>
      <div className="track-list" style={{ minHeight: TRACK_HEIGHT * Math.max(tracks.length, trackSeed.length) }}>
        {tracks.map((track, index) => (
          <div key={track.id} className={selectedTrackId === track.id ? "track-strip selected" : "track-strip"} onClick={() => onSelectTrack(track.id)} style={{ height: TRACK_HEIGHT }}>
            <span className="track-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="track-main"><strong>{track.name}</strong><small>{trackTypeLabel(track.type)}</small></span>
            <span className="track-controls" onClick={(event) => event.stopPropagation()}>
              <button className={track.isMuted ? "mini active" : "mini"} onClick={() => patchTrack(track.id, { isMuted: !track.isMuted })}>M</button>
              <button className={track.isSolo ? "mini active" : "mini"} onClick={() => patchTrack(track.id, { isSolo: !track.isSolo })}>S</button>
              <button className={track.isArmed ? "mini arm active" : "mini arm"} onClick={() => patchTrack(track.id, { isArmed: !track.isArmed })}>R</button>
            </span>
            <select value={track.type === "audio" ? "Input 1" : track.type === "vocal" ? "Mic Input" : track.type === "midi" ? "Web MIDI" : "Sampler Engine"} onChange={() => undefined} onClick={(event) => event.stopPropagation()}>
              <option>Sampler Engine</option><option>Web MIDI</option><option>Input 1</option><option>Mic Input</option>
            </select>
          </div>
        ))}
      </div>
    </aside>
  );
}

function MidiClipView({ clip, trackIndex, isSelected, onSelect }: { clip: MidiClip; trackIndex: number; isSelected: boolean; onSelect: () => void }) {
  const left = clip.startBeat * TIMELINE_BEAT_WIDTH;
  const width = Math.max(90, clip.durationBeats * TIMELINE_BEAT_WIDTH);
  const top = trackIndex * TRACK_HEIGHT + 18;
  const low = Math.min(...clip.notes.map((note) => note.note), NOTE_LOW);
  const high = Math.max(...clip.notes.map((note) => note.note), NOTE_HIGH);
  const range = Math.max(1, high - low);

  return (
    <button className={isSelected ? "arrangement-clip midi selected" : "arrangement-clip midi"} style={{ left, top, width }} onClick={onSelect}>
      <span className="clip-title">MIDI Take</span>
      <span className="clip-meta">{clip.notes.length} notes</span>
      <span className="clip-notes">
        {clip.notes.map((note) => (
          <i key={note.id ?? `${note.note}-${note.start}`} style={{ left: `${(note.start / Math.max(clip.durationBeats, 1)) * 100}%`, width: `${clamp((note.duration / Math.max(clip.durationBeats, 1)) * 100, 3, 60)}%`, top: `${8 + ((high - note.note) / range) * 30}px` }} />
        ))}
      </span>
    </button>
  );
}

function Timeline({ selectedClipId, onSelectClip, onDropClip }: { selectedClipId?: string; onSelectClip: (clipId?: string) => void; onDropClip: (trackId: string, beat: number) => void }) {
  const tracks = useAppStore((s) => s.tracks);
  const midiClips = useAppStore((s) => s.midiClips);
  const transport = useAppStore((s) => s.transport);
  const width = TOTAL_BEATS * TIMELINE_BEAT_WIDTH;

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const beat = clamp((event.clientX - rect.left + event.currentTarget.scrollLeft) / TIMELINE_BEAT_WIDTH, 0, TOTAL_BEATS - 1);
    const lane = clamp(Math.floor((event.clientY - rect.top - 34 + event.currentTarget.scrollTop) / TRACK_HEIGHT), 0, Math.max(0, tracks.length - 1));
    onDropClip(tracks[lane]?.id ?? tracks[0]?.id, beat);
  }

  return (
    <section className="studio-timeline" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <div className="timeline-ruler" style={{ width }}>
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <div className="bar-marker" key={index + 1} style={{ left: index * BEATS_PER_BAR * TIMELINE_BEAT_WIDTH }}><strong>{index + 1}</strong></div>
        ))}
        <div className="loop-region" style={{ left: transport.loopStartBeat * TIMELINE_BEAT_WIDTH, width: Math.max(TIMELINE_BEAT_WIDTH, (transport.loopEndBeat - transport.loopStartBeat) * TIMELINE_BEAT_WIDTH) }} />
        <div className="playhead" style={{ left: transport.currentBeat * TIMELINE_BEAT_WIDTH }} />
      </div>
      <div className="arrangement-canvas" style={{ width, height: Math.max(TRACK_HEIGHT * tracks.length, 420) }}>
        {Array.from({ length: TOTAL_BEATS + 1 }, (_, beat) => <span key={beat} className={beat % BEATS_PER_BAR === 0 ? "grid-line bar" : "grid-line"} style={{ left: beat * TIMELINE_BEAT_WIDTH }} />)}
        {tracks.map((track, index) => <div key={track.id} className="track-lane" style={{ top: index * TRACK_HEIGHT, height: TRACK_HEIGHT }} />)}
        <div className="drop-zone">Drop audio, MIDI, or sample here</div>
        {tracks.map((track, index) => track.type === "audio" || track.type === "vocal" ? <div key={`${track.id}-placeholder`} className="arrangement-clip audio" style={{ left: (index + 2) * TIMELINE_BEAT_WIDTH * 3, top: index * TRACK_HEIGHT + 18, width: 160 }}><span>Audio placeholder</span><em /></div> : null)}
        {midiClips.map((clip) => <MidiClipView key={clip.id} clip={clip} trackIndex={Math.max(0, tracks.findIndex((track) => track.id === clip.trackId))} isSelected={selectedClipId === clip.id} onSelect={() => onSelectClip(clip.id)} />)}
      </div>
    </section>
  );
}

function PianoRoll({ selectedClip }: { selectedClip?: MidiClip }) {
  const selectedNoteId = useAppStore((s) => s.selectedMidiNoteId);
  const selectMidiNote = useAppStore((s) => s.selectMidiNote);
  const updateMidiNote = useAppStore((s) => s.updateMidiNote);
  const quantizeSelectedNotes = useAppStore((s) => s.quantizeSelectedNotes);
  const snapGrid = useAppStore((s) => s.snapGrid);
  const setSnapGrid = useAppStore((s) => s.setSnapGrid);
  const notes = selectedClip?.notes ?? [];
  const selectedNote = notes.find((note) => note.id === selectedNoteId);
  const noteRows = NOTE_HIGH - NOTE_LOW + 1;

  return (
    <div className="piano-editor">
      <div className="editor-toolbar">
        <strong>{selectedClip ? "Piano Roll" : "Piano Roll — select a MIDI clip"}</strong>
        <label>Snap <select value={snapGrid} onChange={(event) => setSnapGrid(event.target.value as typeof snapGrid)}><option value="off">Off</option><option value="1/4">1/4</option><option value="1/8">1/8</option><option value="1/16">1/16</option><option value="1/32">1/32</option></select></label>
        <button onClick={quantizeSelectedNotes} disabled={!selectedClip}>Quantize</button>
        {selectedNote && selectedClip ? <span className="note-readout">Note {selectedNote.note} · {selectedNote.start.toFixed(2)} beat · {selectedNote.duration.toFixed(2)} len</span> : null}
      </div>
      <div className="piano-grid" style={{ height: noteRows * 16, width: Math.max(TIMELINE_BEAT_WIDTH * (selectedClip?.durationBeats ?? 8), 760) }}>
        {Array.from({ length: noteRows }, (_, index) => <span key={index} className="piano-row" style={{ top: index * 16 }} />)}
        {Array.from({ length: Math.ceil(selectedClip?.durationBeats ?? 8) * 4 + 1 }, (_, index) => <span key={index} className={index % 4 === 0 ? "piano-beat bar" : "piano-beat"} style={{ left: index * (TIMELINE_BEAT_WIDTH / 4) }} />)}
        {notes.map((note: MidiNote) => (
          <button key={note.id ?? `${note.note}-${note.start}`} className={selectedNoteId === note.id ? "piano-roll-note selected" : "piano-roll-note"} style={{ left: note.start * TIMELINE_BEAT_WIDTH, top: (NOTE_HIGH - note.note) * 16, width: Math.max(16, note.duration * TIMELINE_BEAT_WIDTH) }} onClick={() => selectMidiNote(note.id)}>
            {note.note}
          </button>
        ))}
      </div>
      {selectedNote && selectedClip ? (
        <div className="note-inspector">
          <label>Pitch <input type="number" value={selectedNote.note} min={0} max={127} onChange={(event) => updateMidiNote(selectedClip.id, selectedNote.id!, { note: Number(event.target.value) })} /></label>
          <label>Start <input type="number" step="0.125" value={selectedNote.start} onChange={(event) => updateMidiNote(selectedClip.id, selectedNote.id!, { start: Number(event.target.value) })} /></label>
          <label>Length <input type="number" step="0.125" value={selectedNote.duration} onChange={(event) => updateMidiNote(selectedClip.id, selectedNote.id!, { duration: Number(event.target.value) })} /></label>
          <label>Velocity <input type="number" min={1} max={127} value={selectedNote.velocity} onChange={(event) => updateMidiNote(selectedClip.id, selectedNote.id!, { velocity: Number(event.target.value) })} /></label>
        </div>
      ) : null}
    </div>
  );
}

function BottomEditor({ selectedClip }: { selectedClip?: MidiClip }) {
  const [tab, setTab] = useState("Piano Roll");
  const tabs = ["Piano Roll", "Drum Grid", "Mixer", "Effects", "Lyrics/Notes"];
  return (
    <section className="studio-editor">
      <nav className="editor-tabs">{tabs.map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>
      {tab === "Piano Roll" ? <PianoRoll selectedClip={selectedClip} /> : <div className="editor-placeholder"><strong>{tab}</strong><span>Phase 1 shell connected to the Studio layout. Detailed execution comes in a later pass.</span></div>}
    </section>
  );
}

export function StudioPage({ projectId }: { projectId: string }) {
  const logTelemetry = useAppStore((s) => s.logTelemetry);
  const ensureSamplerTrack = useAppStore((s) => s.ensureSamplerTrack);
  const tracks = useAppStore((s) => s.tracks);
  const setTracks = useAppStore((s) => s.setTracks);
  const addMidiClip = useAppStore((s) => s.addMidiClip);
  const midiClips = useAppStore((s) => s.midiClips);
  const selectedMidiClipId = useAppStore((s) => s.selectedMidiClipId);
  const selectMidiClip = useAppStore((s) => s.selectMidiClip);
  const selectedClip = useMemo(() => midiClips.find((clip) => clip.id === selectedMidiClipId), [midiClips, selectedMidiClipId]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | undefined>(tracks[0]?.id);

  useEffect(() => {
    const samplerTrack = ensureSamplerTrack();
    setSelectedTrackId((current) => current ?? samplerTrack.id);
    const missingTypes = trackSeed.filter((seed) => !useAppStore.getState().tracks.some((track) => track.type === seed.type));
    if (missingTypes.length) {
      const currentTracks = useAppStore.getState().tracks;
      setTracks([...currentTracks, ...missingTypes.map((seed, index) => ({
        id: `track-${seed.type}-default`,
        projectId,
        type: seed.type,
        name: seed.name,
        isMuted: false,
        isSolo: false,
        isArmed: seed.type === "sampler",
        volume: 0.8,
        pan: 0,
      }))]);
    }
    const id = setInterval(() => logTelemetry(logEvent("save", "project", { projectId })), 12000);
    return () => clearInterval(id);
  }, [ensureSamplerTrack, logTelemetry, projectId, setTracks]);

  function createDroppedMidiClip(trackId: string, beat: number) {
    const startBeat = Math.round(beat * 4) / 4;
    const clip: MidiClip = {
      id: `clip-drop-${Date.now()}`,
      projectId,
      trackId,
      startBar: Math.floor(startBeat / BEATS_PER_BAR) + 1,
      endBar: Math.floor(startBeat / BEATS_PER_BAR) + 3,
      startBeat,
      durationBeats: 8,
      loopEnabled: false,
      notes: [
        { id: `note-drop-${Date.now()}-1`, note: 60, start: 0, duration: 1, velocity: 96, channel: 1 },
        { id: `note-drop-${Date.now()}-2`, note: 64, start: 1, duration: 1, velocity: 90, channel: 1 },
        { id: `note-drop-${Date.now()}-3`, note: 67, start: 2, duration: 1.5, velocity: 94, channel: 1 },
      ],
    };
    addMidiClip(clip);
    selectMidiClip(clip.id);
  }

  return (
    <div className="studio-workstation">
      <StudioRuntime />
      <TransportBar projectId={projectId} />
      <div className="studio-body">
        <TrackRail selectedTrackId={selectedTrackId} onSelectTrack={setSelectedTrackId} />
        <Timeline selectedClipId={selectedMidiClipId} onSelectClip={selectMidiClip} onDropClip={createDroppedMidiClip} />
      </div>
      <BottomEditor selectedClip={selectedClip} />
    </div>
  );
}
