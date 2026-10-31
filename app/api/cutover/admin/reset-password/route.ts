import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { randomBytes, createHash } from "node:crypto";
import { authenticatedCutoverIdentity, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";
import { hashParticipantPassword } from "@/lib/participant-auth";

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
    if (typeof body?.username !== "string" || body.username.length > 100) return reply({ ok: false, error: "invalid_input" }, 400);
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    const user = await sql`SELECT p.id FROM footy_cutover.profiles p
      JOIN cutover_auth.participant_credentials c ON c.user_id=p.id
      WHERE p.username=${body.username} AND upper(p.username)<>'ADMIN' AND c.enabled=true LIMIT 1`;
    if (user.length !== 1) return reply({ ok: false, error: "not_found" }, 404);
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await sql`DELETE FROM cutover_auth.password_reset_links WHERE user_id=${user[0].id}::uuid`;
    await sql`INSERT INTO cutover_auth.password_reset_links(token_hash,user_id,expires_at)
      VALUES(decode(${tokenHash},'hex'),${user[0].id}::uuid,now()+interval '24 hours')`;
    return reply({ ok: true, reset_link: process.env.CUTOVER_AUTH_ORIGIN + "/cutover-participant#reset=" + token });

  } catch { return reply({ ok: false, error: "unavailable" }, 503); }
}
