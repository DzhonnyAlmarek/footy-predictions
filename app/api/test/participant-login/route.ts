import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { verifyParticipantPassword } from "@/lib/participant-auth";
import {
  AUTH_HEADERS, PARTICIPANT_COOKIE, consumeAttempt, participantAuthEnabled,
  participantDatabase, participantOriginAllowed
} from "@/lib/neon-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const denied = () => NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401, headers: AUTH_HEADERS });

export async function POST(req: Request) {
  if (!participantAuthEnabled()) return NextResponse.json({ ok: false }, { status: 404, headers: AUTH_HEADERS });
  if (!participantOriginAllowed(req)) return NextResponse.json({ ok: false }, { status: 403, headers: AUTH_HEADERS });
  if (Number(req.headers.get("content-length") || 0) > 4096) return denied();
  try {
    const body = await req.json();
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = body?.password;
    if (!username || username.length > 100 || typeof password !== "string" ||
        Buffer.byteLength(password, "utf8") > 256) return denied();

    const sql = participantDatabase();
    // Shared database counters. No reliance on untrusted X-Forwarded-For headers.
    // Global limit is a failsafe; per-account limit is the primary brute-force control.
    const globalAllowed = await consumeAttempt(sql, "login_ip", "global", 100);
    const accountAllowed = await consumeAttempt(sql, "login_account", username.toLowerCase(), 5);
    if (!globalAllowed || !accountAllowed) {
      return NextResponse.json({ ok: false, error: "too_many_attempts" },
        { status: 429, headers: AUTH_HEADERS });
    }

    const users = await sql`SELECT p.id, encode(c.password_salt, 'hex') AS salt,
       encode(c.password_hash, 'hex') AS digest
       FROM migration_source.profiles p
       JOIN test_auth.participant_credentials c ON c.user_id = p.id
       WHERE p.username = ${username} AND c.enabled = true LIMIT 2`;
    // Exactly one matching enabled account, not just the first match.
    if (users.length !== 1 || typeof users[0]?.salt !== "string" ||
        typeof users[0]?.digest !== "string") return denied();
    const ok = await verifyParticipantPassword(password,
      Buffer.from(users[0].salt as string, "hex"),
      Buffer.from(users[0].digest as string, "hex"));
    if (!ok) return denied();
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(Buffer.from(token, "hex")).digest("hex");
    const written = await sql`INSERT INTO test_auth.participant_sessions
      (session_hash, user_id, expires_at)
      VALUES (decode(${tokenHash}, 'hex'), ${users[0].id}::uuid, now() + interval '4 hours')
      RETURNING 1 AS ok`;
    if (written.length !== 1) return denied();
    const response = NextResponse.json({ ok: true }, { headers: AUTH_HEADERS });
    response.cookies.set(PARTICIPANT_COOKIE, token, {
      httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 4 * 3600
    });
    return response;
  } catch {
    return NextResponse.json({ ok: false, error: "auth_unavailable" },
      { status: 503, headers: AUTH_HEADERS });
  }
}
