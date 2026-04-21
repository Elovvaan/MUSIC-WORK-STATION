export type CoreModule = "dashboard"|"studio"|"ai-create"|"my-sound"|"vocal-lab"|"sampler"|"performance"|"mastering"|"exports"|"settings";
export type TrackType = "audio" | "midi" | "vocal" | "sampler" | "bus";
export type SamplerMode = "one_shot" | "chromatic" | "slice" | "loop";
export type VocalStage = "analysis" | "restoration" | "enhancement" | "vocal_master";
export type MasteringMode = "quick" | "pro" | "restore_master";
export type JobStatus = "queued" | "running" | "completed" | "failed";
export type TelemetryEventType = "save"|"export"|"reuse"|"reject"|"delete"|"repeated_edit"|"preset_usage"|"project_reopen";

export interface Project { id: string; name: string; bpm: number; key: string; status: "draft" | "active"; lastOpenedAt?: string; }
export interface Track { id: string; projectId: string; type: TrackType; name: string; isMuted: boolean; isSolo: boolean; isArmed: boolean; volume: number; pan: number; }
export interface MidiNote { note: number; start: number; duration: number; velocity: number; channel: number; }
export interface MidiClip { id: string; projectId: string; trackId: string; startBar: number; endBar: number; notes: MidiNote[]; }
export interface PerformanceTake { id: string; projectId: string; trackId: string; sourceDeviceId: string; rawMidi: number[][]; }
export interface MidiDeviceProfile { id: string; deviceName: string; manufacturer: string; inputPortName: string; isDefault: boolean; }
export interface ControllerMapping { id: string; profileId: string; mappingName: string; mapping: Record<string, string>; }

export interface SampleAsset { id: string; name: string; projectId?: string; format: string; durationSec: number; detectedRootNote?: string; }
export interface SamplerPatch { id: string; projectId?: string; sampleAssetId: string; name: string; mode: SamplerMode; rootNote: string; rootOctave: number; adsr: { attack: number; decay: number; sustain: number; release: number; }; loop: { startMs: number; endMs: number; enabled: boolean; }; }

export interface VocalProcessingJob { id: string; projectId: string; stemId: string; stage: VocalStage; status: JobStatus; settings: Record<string, unknown>; }
export interface MasteringJob { id: string; projectId: string; mode: MasteringMode; status: JobStatus; loudnessTargetLufs: number; }
export interface AiContinuationJob { id: string; projectId?: string; sourceType: "midi"|"audio"|"vocal"|"prompt"; status: JobStatus; request: Record<string, unknown>; }

export interface StyleProfile { id: string; name: string; bpmRange: [number, number]; keyPreferences: string[]; moodTags: string[]; }
export interface ExportJob { id: string; projectId: string; exportType: "mp3"|"wav"|"midi"|"vocal_stem"; versionLabel: string; status: JobStatus; }

export interface TelemetryEvent { id: string; projectId?: string; eventType: TelemetryEventType; targetType: string; targetId?: string; metadata?: Record<string, unknown>; createdAt: string; }
