import { create } from "zustand";
import { MidiClip, MidiNote, Project, SamplerPatch, TelemetryEvent, Track } from "@/lib/types/models";
import type { SamplerSettings } from "@/lib/audio/sampler-engine";

export type SnapGrid = "off" | "1/4" | "1/8" | "1/16" | "1/32";
export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

type TransportState = {
  bpm: number;
  isPlaying: boolean;
  isRecording: boolean;
  metronomeEnabled: boolean;
  countInBars: 0 | 1 | 2;
  countInActive: boolean;
  countInRemainingBeats: number;
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

export type PersistedProjectState = {
  schemaVersion: 1;
  savedAt: string;
  project: Project;
  transport: Pick<TransportState, "bpm" | "metronomeEnabled" | "countInBars" | "loopEnabled" | "loopStartBeat" | "loopEndBeat" | "currentBeat">;
  tracks: Track[];
  midiClips: MidiClip[];
  samplerPatches: SamplerPatch[];
  samplerSettings?: SamplerSettings;
};

type AppState = {
  currentProject?: Project;
  tracks: Track[];
  midiClips: MidiClip[];
  samplerPatches: SamplerPatch[];
  samplerSettings?: SamplerSettings;
  telemetry: TelemetryEvent[];
  transport: TransportState;
  activeRecordingNotes: Record<string, RecordingNote>;
  activeRecordingPass?: RecordingPass;
  selectedMidiClipId?: string;
  selectedMidiNoteId?: string;
  snapGrid: SnapGrid;
  saveStatus: SaveStatus;
  lastSaveError?: string;
  persistenceRevision: number;
  setProject: (project: Project) => void;
  hydrateProjectState: (snapshot: PersistedProjectState) => void;
  projectSnapshot: () => PersistedProjectState;
  markSaved: () => void;
  markSaving: () => void;
  markSaveError: (message: string) => void;
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
  setSnapGrid: (snapGrid: SnapGrid) => void;
  quantizeSelectedNotes: () => void;
  quantizeClip: (clipId: string) => void;
  setSamplerSettings: (settings: SamplerSettings) => void;
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
const defaultTransport: TransportState = { bpm: 120, isPlaying: false, isRecording: false, metronomeEnabled: true, countInBars: 1, countInActive: false, countInRemainingBeats: 0, loopEnabled: false, currentBeat: 0, loopStartBeat: 0, loopEndBeat: 16 };

const noteKey = (note: number, channel: number) => `${channel}:${note}`;
const beatDuration = (bpm: number) => 60 / Math.max(1, bpm);
const audioTimeToBeat = (audioTime: number, startedAtAudioTime: number, startBeat: number, bpm: number) => startBeat + (audioTime - startedAtAudioTime) / beatDuration(bpm);
const randomId = (prefix: string) => globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function clipEndBeat(clip: MidiClip) {
  const noteEnd = clip.notes.reduce((end, note) => Math.max(end, note.start + note.duration), 0);
  return clip.startBeat + Math.max(clip.durationBeats ?? 0, noteEnd, 1);
}

function normalizeClip(clip: MidiClip): MidiClip {
  const durationBeats = Math.max(1, clip.durationBeats ?? clip.notes.reduce((end, note) => Math.max(end, note.start + note.duration), 0));
  const startBeat = Math.max(0, clip.startBeat ?? Math.max(0, (clip.startBar - 1) * 4));
  return {
    ...clip,
    startBeat,
    startBar: Math.floor(startBeat / 4) + 1,
    durationBeats,
    endBar: Math.max(Math.floor(startBeat / 4) + 2, Math.ceil((startBeat + durationBeats) / 4) + 1),
    loopEnabled: clip.loopEnabled ?? false,
    notes: clip.notes.map((note) => ({ ...note, id: note.id ?? randomId("note"), start: Math.max(0, note.start), duration: Math.max(0.125, note.duration), note: Math.max(0, Math.min(127, Math.round(note.note))) })),
  };
}

function gridBeat(grid: SnapGrid) {
  if (grid === "off") return 0;
  const denominator = Number(grid.split("/")[1]);
  return 4 / denominator;
}

function snapBeat(value: number, grid: SnapGrid) {
  const step = gridBeat(grid);
  if (!step) return value;
  return Math.max(0, Math.round(value / step) * step);
}

function markDirty<T extends Partial<AppState>>(partial: T): T & Pick<AppState, "saveStatus" | "persistenceRevision"> {
  return { ...partial, saveStatus: "unsaved", persistenceRevision: useAppStore.getState().persistenceRevision + 1 };
}

export const useAppStore = create<AppState>((set, get) => ({
  currentProject: defaultProject,
  tracks: [defaultSamplerTrack],
  midiClips: [],
  samplerPatches: [],
  telemetry: [],
  activeRecordingNotes: {},
  transport: defaultTransport,
  snapGrid: "1/16",
  saveStatus: "saved",
  persistenceRevision: 0,
  setProject: (currentProject) => set(markDirty({ currentProject, transport: { ...get().transport, bpm: currentProject.bpm } })),
  hydrateProjectState: (snapshot) => set({
    currentProject: snapshot.project,
    tracks: snapshot.tracks.length ? snapshot.tracks : [{ ...defaultSamplerTrack, projectId: snapshot.project.id }],
    midiClips: snapshot.midiClips.map(normalizeClip),
    samplerPatches: snapshot.samplerPatches,
    samplerSettings: snapshot.samplerSettings,
    transport: { ...defaultTransport, ...snapshot.transport, bpm: snapshot.transport.bpm, isPlaying: false, isRecording: false, countInActive: false, countInRemainingBeats: 0 },
    selectedMidiClipId: snapshot.midiClips[0]?.id,
    selectedMidiNoteId: undefined,
    saveStatus: "saved",
    lastSaveError: undefined,
  }),
  projectSnapshot: () => {
    const state = get();
    const project = state.currentProject ?? defaultProject;
    return {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      project: { ...project, bpm: state.transport.bpm },
      transport: {
        bpm: state.transport.bpm,
        metronomeEnabled: state.transport.metronomeEnabled,
        countInBars: state.transport.countInBars,
        loopEnabled: state.transport.loopEnabled,
        loopStartBeat: state.transport.loopStartBeat,
        loopEndBeat: state.transport.loopEndBeat,
        currentBeat: state.transport.currentBeat,
      },
      tracks: state.tracks,
      midiClips: state.midiClips.map(normalizeClip),
      samplerPatches: state.samplerPatches,
      samplerSettings: state.samplerSettings,
    };
  },
  markSaved: () => set({ saveStatus: "saved", lastSaveError: undefined }),
  markSaving: () => set({ saveStatus: "saving", lastSaveError: undefined }),
  markSaveError: (lastSaveError) => set({ saveStatus: "error", lastSaveError }),
  setTracks: (tracks) => set(markDirty({ tracks })),
  addMidiClip: (clip) => set((state) => markDirty({ midiClips: [...state.midiClips, normalizeClip(clip)] })),
  updateMidiClip: (clipId, partial) => set((state) => ({
    ...markDirty({}),
    midiClips: state.midiClips.map((clip) => {
      if (clip.id !== clipId) return clip;
      const next = normalizeClip({ ...clip, ...partial });
      return { ...next, endBar: Math.max(next.startBar + 1, Math.ceil(clipEndBeat(next) / 4) + 1) };
    }),
  })),
  deleteMidiClip: (clipId) => set((state) => markDirty({
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
      startBeat: snapBeat(clipEndBeat(source), state.snapGrid),
      startBar: Math.floor(clipEndBeat(source) / 4) + 1,
      notes: source.notes.map((note) => ({ ...note, id: randomId("note") })),
    });
    return markDirty({ midiClips: [...state.midiClips, copy], selectedMidiClipId: copy.id });
  }),
  setTransport: (partial) => set((state) => {
    const bpm = typeof partial.bpm === "number" && Number.isFinite(partial.bpm) ? Math.max(20, Math.min(300, partial.bpm)) : state.transport.bpm;
    const loopStartBeat = Math.max(0, partial.loopStartBeat ?? state.transport.loopStartBeat);
    const loopEndBeat = Math.max(loopStartBeat + 1, partial.loopEndBeat ?? state.transport.loopEndBeat);
    const nextTransport = { ...state.transport, ...partial, bpm, loopStartBeat, loopEndBeat };
    const persistentKeys = ["bpm", "metronomeEnabled", "countInBars", "loopEnabled", "loopStartBeat", "loopEndBeat"];
    const isPersistent = Object.keys(partial).some((key) => persistentKeys.includes(key));
    return isPersistent ? markDirty({ transport: nextTransport, currentProject: state.currentProject ? { ...state.currentProject, bpm } : state.currentProject }) : { transport: nextTransport };
  }),
  setTransportBeat: (currentBeat) => set((state) => ({ transport: { ...state.transport, currentBeat: Math.max(0, currentBeat) } })),
  logTelemetry: (event) => set((state) => ({ telemetry: [...state.telemetry, event] })),
  ensureSamplerTrack: () => {
    const existing = get().tracks.find((track) => track.type === "sampler" && track.isArmed) ?? get().tracks.find((track) => track.type === "sampler");
    if (existing) return existing;
    const projectId = get().currentProject?.id ?? defaultProject.id;
    const track = { ...defaultSamplerTrack, projectId };
    set((state) => markDirty({ tracks: [...state.tracks, track] }));
    return track;
  },
  beginRecordingPass: (audioTime) => {
    const state = get();
    const track = state.ensureSamplerTrack();
    set({ activeRecordingNotes: {}, activeRecordingPass: { id: randomId("take"), projectId: state.currentProject?.id ?? defaultProject.id, trackId: track.id, startBeat: state.transport.currentBeat, startedAtAudioTime: audioTime, notes: [] } });
  },
  endRecordingPass: (audioTime) => {
    const state = get();
    const pass = state.activeRecordingPass;
    if (!pass) return;
    const finishedNotes = Object.values(state.activeRecordingNotes).map((activeNote) => ({
      id: activeNote.id,
      note: activeNote.note,
      start: Math.max(0, activeNote.startedAtBeat - pass.startBeat),
      duration: Math.max(0.125, audioTimeToBeat(audioTime, pass.startedAtAudioTime, pass.startBeat, state.transport.bpm) - activeNote.startedAtBeat),
      velocity: activeNote.velocity,
      channel: activeNote.channel,
    }));
    const notes = [...pass.notes, ...finishedNotes].sort((a, b) => a.start - b.start || a.note - b.note);
    const durationBeats = Math.max(1, notes.reduce((end, note) => Math.max(end, note.start + note.duration), 0));
    const clip: MidiClip | undefined = notes.length > 0 ? normalizeClip({
      id: randomId("clip"),
      projectId: pass.projectId,
      trackId: pass.trackId,
      startBar: Math.floor(pass.startBeat / 4) + 1,
      endBar: Math.ceil((pass.startBeat + durationBeats) / 4) + 1,
      startBeat: pass.startBeat,
      durationBeats,
      loopEnabled: false,
      notes,
    }) : undefined;
    set((current) => markDirty({
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
    ...markDirty({}),
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
  setSnapGrid: (snapGrid) => set({ snapGrid }),
  quantizeSelectedNotes: () => {
    const state = get();
    const clipId = state.selectedMidiClipId;
    if (!clipId || state.snapGrid === "off") return;
    const selectedNoteId = state.selectedMidiNoteId;
    set({
      ...markDirty({}),
      midiClips: state.midiClips.map((clip) => {
        if (clip.id !== clipId) return clip;
        const notes = clip.notes.map((note) => (!selectedNoteId || note.id === selectedNoteId) ? { ...note, start: snapBeat(note.start, state.snapGrid), duration: Math.max(0.125, snapBeat(note.duration, state.snapGrid) || gridBeat(state.snapGrid)) } : note);
        return normalizeClip({ ...clip, notes });
      }),
    });
  },
  quantizeClip: (clipId) => {
    const state = get();
    if (state.snapGrid === "off") return;
    set({
      ...markDirty({}),
      midiClips: state.midiClips.map((clip) => {
        if (clip.id !== clipId) return clip;
        const notes = clip.notes.map((note) => ({ ...note, start: snapBeat(note.start, state.snapGrid), duration: Math.max(0.125, snapBeat(note.duration, state.snapGrid) || gridBeat(state.snapGrid)) }));
        return normalizeClip({ ...clip, notes });
      }),
    });
  },
  setSamplerSettings: (samplerSettings) => set(markDirty({ samplerSettings })),
}));

export const quantizeBeatToGrid = snapBeat;
export const snapGridToBeats = gridBeat;
