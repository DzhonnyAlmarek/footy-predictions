import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { hashParticipantPassword } from "@/lib/participant-auth";
import { cutoverAuthEnabled, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (data: object, status = 200) => NextResponse.json(data, { status, headers: CUTOVER_HEADERS });

export async function POST(req: NextRequest) {
  if (!cutoverAuthEnabled()) return reply({ ok: false }, 404);
  if (!process.env.CUTOVER_AUTH_ORIGIN || req.headers.get("origin") !== process.env.CUTOVER_AUTH_ORIGIN)
    return reply({ ok: false }, 403);
  if (Number(req.headers.get("content-length") || 0) > 1024) return reply({ ok: false }, 413);
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > 1024) return reply({ ok: false }, 413);
    const body = JSON.parse(raw);
    if (typeof body?.token !== "string" || !/^[0-9a-f]{64}$/.test(body.token))
      return reply({ ok: false, error: "invalid_link" }, 400);
    const digest = createHash("sha256").update(body.token).digest("hex");
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    const consumed = await sql`DELETE FROM cutover_auth.password_reset_links
      WHERE token_hash=decode(${digest},'hex') AND expires_at>now() RETURNING user_id`;
    if (consumed.length !== 1) return reply({ ok: false, error: "expired_or_used" }, 410);
    const userId = String(consumed[0].user_id);
    const temporaryPassword = randomBytes(12).toString("base64url");
    const { salt, hash } = await hashParticipantPassword(temporaryPassword);
    const updated = await sql`UPDATE cutover_auth.participant_credentials SET
      password_salt=decode(${salt.toString("hex")},'hex'),
      password_hash=decode(${hash.toString("hex")},'hex'),
      must_change_password=true, password_changed_at=now()
      WHERE user_id=${userId}::uuid AND enabled=true RETURNING user_id`;
    if (updated.length !== 1) return reply({ ok: false, error: "unavailable" }, 503);
    await sql`DELETE FROM cutover_auth.participant_sessions WHERE user_id=${userId}::uuid`;
    const users = await sql`SELECT username FROM footy_cutover.profiles WHERE id=${userId}::uuid`;
    if (users.length !== 1) return reply({ ok: false, error: "unavailable" }, 503);
    return reply({ ok: true, username: users[0].username, temporary_password: temporaryPassword });
  } catch {
    return reply({ ok: false, error: "unavailable" }, 503);
  }
}
