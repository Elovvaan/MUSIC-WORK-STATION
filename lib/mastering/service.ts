import { MasteringJob, MasteringMode } from "@/lib/types/models";

export function createMasteringJob(projectId: string, mode: MasteringMode): MasteringJob {
  return { id: crypto.randomUUID(), projectId, mode, status: "queued", loudnessTargetLufs: -9 };
}
