import { ok } from "@/lib/api/response";
import { projectPersistenceAdapter } from "@/lib/persistence/project-file-adapter";
import type { PersistedProjectState } from "@/lib/state/app-store";

export const runtime = "nodejs";

function emptyProject(id: string): PersistedProjectState {
  return {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    project: { id, name: id === "browser-session" ? "Browser Session" : `Project ${id}`, bpm: 120, key: "C", status: "active" },
    transport: { bpm: 120, metronomeEnabled: true, countInBars: 1, loopEnabled: false, loopStartBeat: 0, loopEndBeat: 16, currentBeat: 0 },
    tracks: [{ id: "track-sampler-live", projectId: id, type: "sampler", name: "Live Sampler", isMuted: false, isSolo: false, isArmed: true, volume: 0.82, pan: 0 }],
    midiClips: [],
    samplerPatches: [],
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snapshot = await projectPersistenceAdapter.loadProject(id) ?? emptyProject(id);
  return ok({ id, snapshot });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const existing = await projectPersistenceAdapter.loadProject(id) ?? emptyProject(id);
  const snapshot = await projectPersistenceAdapter.saveProject(id, { ...existing, ...body, project: { ...existing.project, ...(body.project ?? {}), id } });
  return ok({ id, snapshot });
}
