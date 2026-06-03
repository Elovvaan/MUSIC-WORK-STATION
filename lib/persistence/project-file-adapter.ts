import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PersistedProjectState } from "@/lib/state/app-store";

export interface ProjectPersistenceAdapter {
  loadProject(projectId: string): Promise<PersistedProjectState | undefined>;
  saveProject(projectId: string, snapshot: PersistedProjectState): Promise<PersistedProjectState>;
}

const dataDir = path.join(process.cwd(), ".local-data", "projects");
const safeProjectId = (projectId: string) => projectId.replace(/[^a-zA-Z0-9._-]/g, "_");

export class JsonFileProjectPersistenceAdapter implements ProjectPersistenceAdapter {
  private filePath(projectId: string) {
    return path.join(dataDir, `${safeProjectId(projectId)}.json`);
  }

  async loadProject(projectId: string) {
    try {
      const raw = await readFile(this.filePath(projectId), "utf8");
      return JSON.parse(raw) as PersistedProjectState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async saveProject(projectId: string, snapshot: PersistedProjectState) {
    await mkdir(dataDir, { recursive: true });
    const saved = { ...snapshot, savedAt: new Date().toISOString() } satisfies PersistedProjectState;
    await writeFile(this.filePath(projectId), JSON.stringify(saved, null, 2));
    return saved;
  }
}

export const projectPersistenceAdapter: ProjectPersistenceAdapter = new JsonFileProjectPersistenceAdapter();
