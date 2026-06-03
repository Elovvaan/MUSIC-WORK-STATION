import { create } from "zustand";
import { MidiClip, MidiNote, Project, SamplerPatch, TelemetryEvent, Track } from "@/lib/types/models";

type TransportState = {
  bpm: number;
  isPlaying: boolean;
  isRecording: boolean;
  metronomeEnabled: boolean;
  countInBars: 0 | 1 | 2;
  loopEnabled: boolean;
  currentBeat: number;
  loopStartBeat: number;
  loopEndBeat: number;
};

type RecordingNote = MidiNote & { startedAtBeat: number };
type RecordingPass = {
  id: string;
  projectId: string;
  trackId: string;
  startBeat: number;
  startedAtAudioTime: number;
  notes: MidiNote[];
};

type AppState = {
  currentProject?: Project;
  tracks: Track[];
  midiClips: MidiClip[];
  samplerPatches: SamplerPatch[];
  telemetry: TelemetryEvent[];
  transport: TransportState;
  activeRecordingNotes: Record<string, RecordingNote>;
  activeRecordingPass?: RecordingPass;
  selectedMidiClipId?: string;
  selectedMidiNoteId?: string;
  setProject: (project: Project) => void;
  setTracks: (tracks: Track[]) => void;
  addMidiClip: (clip: MidiClip) => void;
  updateMidiClip: (clipId: string, partial: Partial<MidiClip>) => void;
  deleteMidiClip: (clipId: string) => void;
  duplicateMidiClip: (clipId: string) => void;
  setTransport: (partial: Partial<TransportState>) => void;
  setTransportBeat: (currentBeat: number) => void;
  logTelemetry: (event: TelemetryEvent) => void;
  ensureSamplerTrack: () => Track;
  beginRecordingPass: (audioTime: number) => void;
  endRecordingPass: (audioTime: number) => void;
  recordMidiNoteOn: (note: number, velocity: number, channel: number, audioTime: number) => void;
  recordMidiNoteOff: (note: number, channel: number, audioTime: number) => void;
  selectMidiClip: (clipId?: string) => void;
  selectMidiNote: (noteId?: string) => void;
  updateMidiNote: (clipId: string, noteId: string, partial: Partial<MidiNote>) => void;
};

const defaultProject: Project = { id: "browser-session", name: "Browser Session", bpm: 120, key: "C", status: "active" };
const defaultSamplerTrack: Track = {
  id: "track-sampler-live",
  projectId: defaultProject.id,
  type: "sampler",
  name: "Live Sampler",
  isMuted: false,
  isSolo: false,
  isArmed: true,
  volume: 0.82,
  pan: 0,
};

const noteKey = (note: number, channel: number) => `${channel}:${note}`;
const beatDuration = (bpm: number) => 60 / Math.max(1, bpm);
const audioTimeToBeat = (audioTime: number, startedAtAudioTime: number, startBeat: number, bpm: number) => startBeat + (audioTime - startedAtAudioTime) / beatDuration(bpm);
const randomId = (prefix: string) => globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function clipEndBeat(clip: MidiClip) {
  const noteEnd = clip.notes.reduce((end, note) => Math.max(end, note.start + note.duration), 0);
  return clip.startBeat + Math.max(clip.durationBeats ?? 0, noteEnd, 1);
}

function normalizeClip(clip: MidiClip): MidiClip {
  const durationBeats = Math.max(1, clip.notes.reduce((end, note) => Math.max(end, note.start + note.duration), 0));
  return {
    ...clip,
    startBeat: clip.startBeat ?? Math.max(0, (clip.startBar - 1) * 4),
    durationBeats: clip.durationBeats ?? durationBeats,
    loopEnabled: clip.loopEnabled ?? false,
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  currentProject: defaultProject,
  tracks: [defaultSamplerTrack],
  midiClips: [],
  samplerPatches: [],
  telemetry: [],
  activeRecordingNotes: {},
  transport: { bpm: 120, isPlaying: false, isRecording: false, metronomeEnabled: true, countInBars: 1, loopEnabled: false, currentBeat: 0, loopStartBeat: 0, loopEndBeat: 16 },
  setProject: (currentProject) => set({ currentProject }),
  setTracks: (tracks) => set({ tracks }),
  addMidiClip: (clip) => set((state) => ({ midiClips: [...state.midiClips, normalizeClip(clip)] })),
  updateMidiClip: (clipId, partial) => set((state) => ({
    midiClips: state.midiClips.map((clip) => {
      if (clip.id !== clipId) return clip;
      const next = normalizeClip({ ...clip, ...partial });
      return { ...next, endBar: Math.max(next.startBar + 1, Math.ceil(clipEndBeat(next) / 4) + 1) };
    }),
  })),
  deleteMidiClip: (clipId) => set((state) => ({
    midiClips: state.midiClips.filter((clip) => clip.id !== clipId),
    selectedMidiClipId: state.selectedMidiClipId === clipId ? undefined : state.selectedMidiClipId,
    selectedMidiNoteId: state.selectedMidiClipId === clipId ? undefined : state.selectedMidiNoteId,
  })),
  duplicateMidiClip: (clipId) => set((state) => {
    const source = state.midiClips.find((clip) => clip.id === clipId);
    if (!source) return {};
    const copy: MidiClip = normalizeClip({
      ...source,
      id: randomId("clip"),
      startBeat: clipEndBeat(source),
      startBar: Math.floor(clipEndBeat(source) / 4) + 1,
      notes: source.notes.map((note) => ({ ...note, id: randomId("note") })),
    });
    return { midiClips: [...state.midiClips, copy], selectedMidiClipId: copy.id };
  }),
  setTransport: (partial) => set((state) => {
    const bpm = typeof partial.bpm === "number" && Number.isFinite(partial.bpm) ? Math.max(20, Math.min(300, partial.bpm)) : state.transport.bpm;
    const nextTransport = { ...state.transport, ...partial, bpm };
    return { transport: nextTransport };
  }),
  setTransportBeat: (currentBeat) => set((state) => ({ transport: { ...state.transport, currentBeat: Math.max(0, currentBeat) } })),
  logTelemetry: (event) => set((state) => ({ telemetry: [...state.telemetry, event] })),
  ensureSamplerTrack: () => {
    const existing = get().tracks.find((track) => track.type === "sampler" && track.isArmed) ?? get().tracks.find((track) => track.type === "sampler");
    if (existing) return existing;
    set((state) => ({ tracks: [...state.tracks, defaultSamplerTrack] }));
    return defaultSamplerTrack;
  },
  beginRecordingPass: (audioTime) => {
    const state = get();
    const track = state.ensureSamplerTrack();
    const project = state.currentProject ?? defaultProject;
    set((current) => ({
      activeRecordingNotes: {},
      activeRecordingPass: {
        id: randomId("take"),
        projectId: project.id,
        trackId: track.id,
        startBeat: current.transport.currentBeat,
        startedAtAudioTime: audioTime,
        notes: [],
      },
      tracks: current.tracks.some((candidate) => candidate.id === track.id) ? current.tracks : [...current.tracks, track],
    }));
  },
  endRecordingPass: (audioTime) => {
    const state = get();
    const pass = state.activeRecordingPass;
    if (!pass) {
      set({ activeRecordingNotes: {} });
      return;
    }
    const finishedNotes = Object.values(state.activeRecordingNotes).map((activeNote) => ({
      id: activeNote.id ?? randomId("note"),
      note: activeNote.note,
      start: activeNote.start,
      duration: Math.max(0.125, audioTimeToBeat(audioTime, pass.startedAtAudioTime, pass.startBeat, state.transport.bpm) - activeNote.startedAtBeat),
      velocity: activeNote.velocity,
      channel: activeNote.channel,
    }));
    const notes = [...pass.notes, ...finishedNotes].sort((a, b) => a.start - b.start || a.note - b.note);
    const durationBeats = Math.max(1, notes.reduce((end, note) => Math.max(end, note.start + note.duration), 0));
    const clip: MidiClip | undefined = notes.length > 0 ? {
      id: randomId("clip"),
      projectId: pass.projectId,
      trackId: pass.trackId,
      startBar: Math.floor(pass.startBeat / 4) + 1,
      endBar: Math.ceil((pass.startBeat + durationBeats) / 4) + 1,
      startBeat: pass.startBeat,
      durationBeats,
      loopEnabled: false,
      notes,
    } : undefined;
    set((current) => ({
      activeRecordingNotes: {},
      activeRecordingPass: undefined,
      midiClips: clip ? [...current.midiClips, clip] : current.midiClips,
      selectedMidiClipId: clip?.id ?? current.selectedMidiClipId,
    }));
  },
  recordMidiNoteOn: (note, velocity, channel, audioTime) => {
    const state = get();
    if (!state.transport.isRecording || !state.activeRecordingPass) return;
    const key = noteKey(note, channel);
    const startBeat = audioTimeToBeat(audioTime, state.activeRecordingPass.startedAtAudioTime, state.activeRecordingPass.startBeat, state.transport.bpm);
    set((current) => ({
      activeRecordingNotes: {
        ...current.activeRecordingNotes,
        [key]: { id: randomId("note"), note, start: Math.max(0, startBeat - state.activeRecordingPass!.startBeat), duration: 0, velocity, channel, startedAtBeat: startBeat },
      },
    }));
  },
  recordMidiNoteOff: (note, channel, audioTime) => {
    const state = get();
    const key = noteKey(note, channel);
    const activeNote = state.activeRecordingNotes[key];
    const pass = state.activeRecordingPass;
    if (!activeNote || !state.transport.isRecording || !pass) return;
    const endBeat = audioTimeToBeat(audioTime, pass.startedAtAudioTime, pass.startBeat, state.transport.bpm);
    const completedNote: MidiNote = { ...activeNote, duration: Math.max(0.125, endBeat - activeNote.startedAtBeat) };
    set((current) => {
      const { [key]: _released, ...remaining } = current.activeRecordingNotes;
      return { activeRecordingNotes: remaining, activeRecordingPass: current.activeRecordingPass ? { ...current.activeRecordingPass, notes: [...current.activeRecordingPass.notes, completedNote] } : undefined };
    });
  },
  selectMidiClip: (selectedMidiClipId) => set({ selectedMidiClipId, selectedMidiNoteId: undefined }),
  selectMidiNote: (selectedMidiNoteId) => set({ selectedMidiNoteId }),
  updateMidiNote: (clipId, noteId, partial) => set((state) => ({
    midiClips: state.midiClips.map((clip) => {
      if (clip.id !== clipId) return clip;
      const notes = clip.notes.map((note) => note.id === noteId ? {
        ...note,
        ...partial,
        start: Math.max(0, partial.start ?? note.start),
        duration: Math.max(0.125, partial.duration ?? note.duration),
        note: Math.max(0, Math.min(127, Math.round(partial.note ?? note.note))),
      } : note);
      const durationBeats = Math.max(1, notes.reduce((end, candidate) => Math.max(end, candidate.start + candidate.duration), 0));
      return normalizeClip({ ...clip, notes, durationBeats });
    }),
  })),
}));
