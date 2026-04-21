import { create } from "zustand";
import { MidiClip, Project, SamplerPatch, TelemetryEvent, Track } from "@/lib/types/models";

type TransportState = { bpm: number; isPlaying: boolean; isRecording: boolean; metronomeEnabled: boolean; countInBars: 0|1|2; loopEnabled: boolean; };

type AppState = {
  currentProject?: Project;
  tracks: Track[];
  midiClips: MidiClip[];
  samplerPatches: SamplerPatch[];
  telemetry: TelemetryEvent[];
  transport: TransportState;
  setProject: (project: Project) => void;
  setTracks: (tracks: Track[]) => void;
  addMidiClip: (clip: MidiClip) => void;
  setTransport: (partial: Partial<TransportState>) => void;
  logTelemetry: (event: TelemetryEvent) => void;
};

export const useAppStore = create<AppState>((set) => ({
  tracks: [], midiClips: [], samplerPatches: [], telemetry: [],
  transport: { bpm: 120, isPlaying: false, isRecording: false, metronomeEnabled: true, countInBars: 1, loopEnabled: false },
  setProject: (currentProject) => set({ currentProject }),
  setTracks: (tracks) => set({ tracks }),
  addMidiClip: (clip) => set((state) => ({ midiClips: [...state.midiClips, clip] })),
  setTransport: (partial) => set((state) => ({ transport: { ...state.transport, ...partial } })),
  logTelemetry: (event) => set((state) => ({ telemetry: [...state.telemetry, event] }))
}));
