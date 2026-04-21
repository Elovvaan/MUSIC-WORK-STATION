import { ok } from "@/lib/api/response";

export async function GET() {
  return ok([{ id: "mock-device", name: "USB MIDI Keyboard", manufacturer: "Generic" }]);
}
