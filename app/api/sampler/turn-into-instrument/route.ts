import { accepted } from "@/lib/api/response";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return accepted({ received: body, route: request.url });
}
