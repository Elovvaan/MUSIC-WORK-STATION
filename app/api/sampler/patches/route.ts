import { ok, accepted } from "@/lib/api/response";

export async function GET() {
  return ok([]);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return accepted({ id: crypto.randomUUID(), ...body });
}
