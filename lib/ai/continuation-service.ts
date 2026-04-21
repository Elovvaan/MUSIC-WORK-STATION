import { AiContinuationJob } from "@/lib/types/models";

export function createContinuationJob(sourceType: AiContinuationJob["sourceType"], projectId?: string): AiContinuationJob {
  return { id: crypto.randomUUID(), sourceType, projectId, status: "queued", request: {} };
}
