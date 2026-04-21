import { ok } from "@/lib/api/response";

export async function GET(_: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return ok({
    projectId,
    suggestions: {
      bpm: [112, 124],
      keys: ["A minor", "C major"],
      presets: ["Vocal Presence Chain", "Punch Glue Quick Master"]
    }
  });
}
