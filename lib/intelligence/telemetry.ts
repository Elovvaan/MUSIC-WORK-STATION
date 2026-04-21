import { TelemetryEvent, TelemetryEventType } from "@/lib/types/models";

export const logEvent = (eventType: TelemetryEventType, targetType: string, payload?: Partial<TelemetryEvent>): TelemetryEvent => ({
  id: crypto.randomUUID(),
  eventType,
  targetType,
  targetId: payload?.targetId,
  projectId: payload?.projectId,
  metadata: payload?.metadata,
  createdAt: new Date().toISOString()
});
