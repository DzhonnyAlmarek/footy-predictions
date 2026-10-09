import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { COOKIE_NAME, getTestUserId } from "@/lib/test-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (process.env.DEPLOY_TARGET !== "yandex-neon-test") {
    return NextResponse.json({ ok: false }, { status: 404, headers });
  }
  const id = await getTestUserId(req.cookies.get(COOKIE_NAME)?.value);
  if (!id) return NextResponse.json({ authenticated: false }, { headers });
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ authenticated: false }, { status: 503, headers });
  }
  try {
    const sql = neon(process.env.DATABASE_URL);
    const profiles = await sql`SELECT username FROM public.profiles WHERE id = ${id} LIMIT 1`;
    if (profiles.length !== 1 || typeof profiles[0]?.username !== "string") {
      return NextResponse.json({ authenticated: false }, { headers });
    }
    return NextResponse.json({ authenticated: true, username: profiles[0].username }, { headers });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 503, headers });
  }
}
