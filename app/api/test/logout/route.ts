import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/test-auth";

export const runtime = "nodejs";
export async function POST(req: Request) {
  if (process.env.DEPLOY_TARGET !== "yandex-neon-test") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0, httpOnly: true, secure: true, sameSite: "strict" });
  return res;
}
