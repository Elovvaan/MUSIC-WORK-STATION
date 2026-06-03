import { accepted, ok } from "@/lib/api/response";
import { projectPersistenceAdapter } from "@/lib/persistence/project-file-adapter";
import type { PersistedProjectState } from "@/lib/state/app-store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => undefined) as PersistedProjectState | undefined;
  if (!body || body.schemaVersion !== 1) return ok({ projectId: id, error: "Invalid autosave payload" }, { status: 400 });
  const snapshot = await projectPersistenceAdapter.saveProject(id, body);
  return accepted({ projectId: id, snapshot });
}
