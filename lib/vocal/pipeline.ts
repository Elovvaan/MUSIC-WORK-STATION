import { VocalProcessingJob } from "@/lib/types/models";

export function queueVocalStage(job: VocalProcessingJob) {
  return { ...job, status: "queued" as const, queuedAt: new Date().toISOString() };
}
