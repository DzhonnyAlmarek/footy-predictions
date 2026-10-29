import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { neon } from "@neondatabase/serverless";
import { verifyParticipantPassword } from "@/lib/participant-auth";
import { createOpaqueToken } from "@/lib/participant-auth-tokens";
import { CUTOVER_COOKIE, CUTOVER_HEADERS, cutoverAuthEnabled } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cutoverAuthEnabled() || process.env.ENABLE_CUTOVER_LOGIN !== "true") {
    return NextResponse.json({ ok: false }, { status: 404, headers: CUTOVER_HEADERS });
  }
  const origin = process.env.CUTOVER_AUTH_ORIGIN;
  if (!origin || !origin.startsWith("https://") || request.headers.get("origin") !== origin) {
    return NextResponse.json({ ok: false }, { status: 403, headers: CUTOVER_HEADERS });
  }
  if (Number(request.headers.get("content-length") || 0) > 4096) {
    return NextResponse.json({ ok: false }, { status: 413, headers: CUTOVER_HEADERS });
  }
  try {
    // Stop reading at 4 KiB, including when Content-Length is absent.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 4096) {
            await reader.cancel();
            return NextResponse.json({ ok: false }, { status: 413, headers: CUTOVER_HEADERS });
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = body?.password;
    if (!username || username.length > 100 || typeof password !== "string" ||
        Buffer.byteLength(password, "utf8") > 256) {
      return NextResponse.json({ ok: false, error: "invalid_credentials" },
        { status: 401, headers: CUTOVER_HEADERS });
    }
    const pepper = process.env.CUTOVER_RATE_PEPPER;
    if (!pepper || pepper.length < 32) throw new Error("missing rate limit secret");
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    const subject = createHmac("sha256", pepper).update(username.toLowerCase()).digest("hex");
    const attempts = await sql`
      INSERT INTO cutover_auth.login_rate_limits (subject_hash, attempts, window_started_at)
      VALUES (decode(${subject}, 'hex'), 1, now())
      ON CONFLICT (subject_hash) DO UPDATE
      SET attempts = CASE WHEN cutover_auth.login_rate_limits.window_started_at < now() - interval '15 minutes'
        THEN 1 ELSE cutover_auth.login_rate_limits.attempts + 1 END,
        window_started_at = CASE WHEN cutover_auth.login_rate_limits.window_started_at < now() - interval '15 minutes'
        THEN now() ELSE cutover_auth.login_rate_limits.window_started_at END
      RETURNING attempts
    `;
    // On the direct Yandex Serverless Containers HTTPS endpoint the gateway
    // appends the invoking client's IP to X-Forwarded-For. Earlier entries
    // are client-supplied and MUST NOT be used for security decisions.
    if (process.env.DEPLOY_TARGET === "yandex-neon-production-candidate") {
      const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
      if (!ip || !isIP(ip)) {
        return NextResponse.json({ ok: false, error: "source_unavailable" },
          { status: 503, headers: CUTOVER_HEADERS });
      }
      const sourceHash = createHmac("sha256", pepper).update("ip:" + ip).digest("hex");
      const sourceAttempts = await sql`
        INSERT INTO cutover_auth.login_rate_limits (subject_hash, attempts, window_started_at)
        VALUES (decode(${sourceHash}, 'hex'), 1, now())
        ON CONFLICT (subject_hash) DO UPDATE
        SET attempts = CASE WHEN cutover_auth.login_rate_limits.window_started_at < now() - interval '15 minutes'
          THEN 1 ELSE cutover_auth.login_rate_limits.attempts + 1 END,
          window_started_at = CASE WHEN cutover_auth.login_rate_limits.window_started_at < now() - interval '15 minutes'
          THEN now() ELSE cutover_auth.login_rate_limits.window_started_at END
        RETURNING attempts
      `;
      if (Number(sourceAttempts[0]?.attempts) > 30) {
        return NextResponse.json({ ok: false, error: "too_many_attempts" },
          { status: 429, headers: CUTOVER_HEADERS });
      }
    }
    if (Number(attempts[0]?.attempts) > 5) {
      return NextResponse.json({ ok: false, error: "too_many_attempts" },
        { status: 429, headers: CUTOVER_HEADERS });
    }
    const rows = await sql`
      SELECT p.id, encode(c.password_salt, 'hex') AS salt, encode(c.password_hash, 'hex') AS digest
      FROM footy_cutover.profiles p
      JOIN cutover_auth.participant_credentials c ON c.user_id=p.id
      WHERE p.username=${username} AND c.enabled=true LIMIT 2
    `;
    if (rows.length !== 1 || typeof rows[0]?.salt !== "string" ||
        typeof rows[0]?.digest !== "string" ||
        !(await verifyParticipantPassword(password,
          Buffer.from(rows[0].salt as string, "hex"),
          Buffer.from(rows[0].digest as string, "hex")))) {
      return NextResponse.json({ ok: false, error: "invalid_credentials" },
        { status: 401, headers: CUTOVER_HEADERS });
    }
    const { token, tokenHash } = createOpaqueToken();
    await sql`
      INSERT INTO cutover_auth.participant_sessions(session_hash,user_id,expires_at)
      VALUES (decode(${tokenHash}, 'hex'), ${rows[0].id}::uuid, now() + interval '4 hours')
    `;
    const response = NextResponse.json({ ok: true }, { headers: CUTOVER_HEADERS });
    response.cookies.set(CUTOVER_COOKIE, token, {
      httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 14400
    });
    return response;
  } catch {
    return NextResponse.json({ ok: false, error: "auth_unavailable" },
      { status: 503, headers: CUTOVER_HEADERS });
  }
}
