import { NextResponse } from "next/server";
export const ok = <T>(data: T, init?: ResponseInit) => NextResponse.json({ ok: true, data }, init);
export const accepted = <T>(data: T) => NextResponse.json({ ok: true, data }, { status: 202 });
