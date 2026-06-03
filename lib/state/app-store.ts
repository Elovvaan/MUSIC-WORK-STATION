import { create } from "zustand";
import { MidiClip, MidiNote, Project, SamplerPatch, TelemetryEvent, Track } from "@/lib/types/models";

type TransportState = { bpm: number; isPlaying: boolean; isRecording: boolean; metronomeEnabled: boolean; countInBars: 0|1|2; loopEnabled: boolean; };

type RecordingNote = MidiNote & { startedAtAudioTime: number };

type AppState = {
  currentProject?: Project;
  tracks: Track[];
  midiClips: MidiClip[];
  samplerPatches: SamplerPatch[];
  telemetry: TelemetryEvent[];
  transport: TransportState;
  activeRecordingNotes: Record<string, RecordingNote>;
  setProject: (project: Project) => void;
  setTracks: (tracks: Track[]) => void;
  addMidiClip: (clip: MidiClip) => void;
  setTransport: (partial: Partial<TransportState>) => void;
  logTelemetry: (event: TelemetryEvent) => void;
  ensureSamplerTrack: () => Track;
  recordMidiNoteOn: (note: number, velocity: number, channel: number, audioTime: number) => void;
  recordMidiNoteOff: (note: number, channel: number, audioTime: number) => void;
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

export const useAppStore = create<AppState>((set, get) => ({
  currentProject: defaultProject,
  tracks: [defaultSamplerTrack], midiClips: [], samplerPatches: [], telemetry: [], activeRecordingNotes: {},
  transport: { bpm: 120, isPlaying: false, isRecording: false, metronomeEnabled: true, countInBars: 1, loopEnabled: false },
  setProject: (currentProject) => set({ currentProject }),
  setTracks: (tracks) => set({ tracks }),
  addMidiClip: (clip) => set((state) => ({ midiClips: [...state.midiClips, clip] })),
  setTransport: (partial) => set((state) => {
    const nextTransport = { ...state.transport, ...partial };
    return {
      transport: nextTransport,
      activeRecordingNotes: partial.isRecording === false ? {} : state.activeRecordingNotes,
    };
  }),
  logTelemetry: (event) => set((state) => ({ telemetry: [...state.telemetry, event] })),
  ensureSamplerTrack: () => {
    const existing = get().tracks.find((track) => track.type === "sampler" && track.isArmed) ?? get().tracks.find((track) => track.type === "sampler");
    if (existing) return existing;
    set((state) => ({ tracks: [...state.tracks, defaultSamplerTrack] }));
    return defaultSamplerTrack;
  },
  recordMidiNoteOn: (note, velocity, channel, audioTime) => {
    const state = get();
    if (!state.transport.isRecording) return;
    const track = state.ensureSamplerTrack();
    const key = noteKey(note, channel);
    set((current) => ({
      activeRecordingNotes: {
        ...current.activeRecordingNotes,
        [key]: { note, start: audioTime, duration: 0, velocity, channel, startedAtAudioTime: audioTime },
      },
      tracks: current.tracks.some((candidate) => candidate.id === track.id) ? current.tracks : [...current.tracks, track],
    }));
  },
  recordMidiNoteOff: (note, channel, audioTime) => {
    const state = get();
    const key = noteKey(note, channel);
    const activeNote = state.activeRecordingNotes[key];
    if (!activeNote || !state.transport.isRecording) return;
    const track = state.ensureSamplerTrack();
    const project = state.currentProject ?? defaultProject;
    const duration = Math.max(0.03, audioTime - activeNote.startedAtAudioTime);
    const completedNote: MidiNote = { note, start: activeNote.start, duration, velocity: activeNote.velocity, channel };
    const clip: MidiClip = {
      id: `clip-${Date.now()}-${note}-${channel}`,
      projectId: project.id,
      trackId: track.id,
      startBar: 1,
      endBar: Math.max(2, Math.ceil((completedNote.start + completedNote.duration) / (60 / state.transport.bpm * 4)) + 1),
      notes: [completedNote],
    };
    set((current) => {
      const { [key]: _released, ...remaining } = current.activeRecordingNotes;
      return { activeRecordingNotes: remaining, midiClips: [...current.midiClips, clip] };
    });
  },
}));
