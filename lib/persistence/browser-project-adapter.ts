import type { PersistedProjectState } from "@/lib/state/app-store";

const storageKey = (projectId: string) => `mws:project:${projectId}`;

export async function loadProjectState(projectId: string): Promise<PersistedProjectState | undefined> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
  if (response.ok) {
    const payload = await response.json();
    if (payload?.data?.snapshot) return payload.data.snapshot as PersistedProjectState;
  }
  const local = typeof window !== "undefined" ? window.localStorage.getItem(storageKey(projectId)) : null;
  return local ? JSON.parse(local) as PersistedProjectState : undefined;
}

export async function saveProjectState(projectId: string, snapshot: PersistedProjectState): Promise<PersistedProjectState> {
  const localSave = () => {
    const saved = { ...snapshot, savedAt: new Date().toISOString() } satisfies PersistedProjectState;
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey(projectId), JSON.stringify(saved));
    return saved;
  };

  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/autosave`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    if (!response.ok) return localSave();
    const payload = await response.json();
    const saved = (payload?.data?.snapshot ?? snapshot) as PersistedProjectState;
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey(projectId), JSON.stringify(saved));
    return saved;
  } catch {
    return localSave();
  }
}
