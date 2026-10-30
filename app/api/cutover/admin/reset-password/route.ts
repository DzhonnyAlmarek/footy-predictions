import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticatedCutoverIdentity, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";
import { hashParticipantPassword, validNewPassword } from "@/lib/participant-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: CUTOVER_HEADERS });

export async function POST(req: NextRequest) {
  if (!cutoverAuthEnabled()) return reply({ ok: false }, 404);
  if (req.headers.get("origin") !== process.env.CUTOVER_AUTH_ORIGIN) return reply({ ok: false }, 403);
  if (Number(req.headers.get("content-length") || 0) > 1024) return reply({ ok: false }, 413);
  try {
    const admin = await authenticatedCutoverIdentity(req.cookies.get(CUTOVER_COOKIE)?.value);
    if (!admin || admin.role !== "admin") return reply({ ok: false }, 403);
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > 1024) return reply({ ok: false }, 413);
    const body = JSON.parse(raw);
    if (typeof body?.username !== "string" || body.username.length > 100 ||
      !validNewPassword(body?.temporary_password)) return reply({ ok: false, error: "invalid_input" }, 400);
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    const user = await sql`SELECT p.id FROM footy_cutover.profiles p
      JOIN cutover_auth.participant_credentials c ON c.user_id=p.id
      WHERE p.username=${body.username} AND upper(p.username)<>'ADMIN' AND c.enabled=true LIMIT 1`;
    if (user.length !== 1) return reply({ ok: false, error: "not_found" }, 404);
    const { salt, hash } = await hashParticipantPassword(body.temporary_password);
    await sql`UPDATE cutover_auth.participant_credentials SET
      password_salt=decode(${salt.toString("hex")},'hex'),
      password_hash=decode(${hash.toString("hex")},'hex'),
      must_change_password=true, password_changed_at=now()
      WHERE user_id=${user[0].id}::uuid`;
    await sql`DELETE FROM cutover_auth.participant_sessions WHERE user_id=${user[0].id}::uuid`;
    return reply({ ok: true });
  } catch { return reply({ ok: false, error: "unavailable" }, 503); }
}
