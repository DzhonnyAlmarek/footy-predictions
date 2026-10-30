import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticatedCutoverIdentity, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";
import { hashParticipantPassword, validNewPassword, verifyParticipantPassword } from "@/lib/participant-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: CUTOVER_HEADERS });

export async function POST(req: NextRequest) {
  if (!cutoverAuthEnabled()) return reply({ ok: false }, 404);
  if (req.headers.get("origin") !== process.env.CUTOVER_AUTH_ORIGIN) return reply({ ok: false }, 403);
  if (Number(req.headers.get("content-length") || 0) > 1024) return reply({ ok: false }, 413);
  try {
    const identity = await authenticatedCutoverIdentity(req.cookies.get(CUTOVER_COOKIE)?.value);
    if (!identity) return reply({ ok: false }, 401);
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > 1024) return reply({ ok: false }, 413);
    const body = JSON.parse(raw);
    if (typeof body?.current_password !== "string" || !validNewPassword(body?.new_password) ||
        body.new_password === body.current_password) return reply({ ok: false, error: "invalid_password" }, 400);
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    const rows = await sql`SELECT encode(password_salt,'hex') AS salt, encode(password_hash,'hex') AS digest
      FROM cutover_auth.participant_credentials WHERE user_id=${identity.userId}::uuid AND enabled=true`;
    if (rows.length !== 1 || !(await verifyParticipantPassword(body.current_password,
        Buffer.from(String(rows[0].salt), "hex"), Buffer.from(String(rows[0].digest), "hex"))))
      return reply({ ok: false, error: "invalid_password" }, 401);
    const { salt, hash } = await hashParticipantPassword(body.new_password);
    const updated = await sql`UPDATE cutover_auth.participant_credentials SET
      password_salt=decode(${salt.toString("hex")},'hex'),
      password_hash=decode(${hash.toString("hex")},'hex'),
      must_change_password=false, password_changed_at=now()
      WHERE user_id=${identity.userId}::uuid
        AND password_hash=decode(${String(rows[0].digest)},'hex') RETURNING user_id`;
    if (updated.length !== 1) return reply({ ok: false, error: "retry" }, 409);
    await sql`DELETE FROM cutover_auth.participant_sessions WHERE user_id=${identity.userId}::uuid`;
    const response = reply({ ok: true, relogin: true });
    response.cookies.set(CUTOVER_COOKIE, "", { path: "/", httpOnly: true, secure: true, sameSite: "strict", maxAge: 0 });
    return response;
  } catch { return reply({ ok: false, error: "unavailable" }, 503); }
}
