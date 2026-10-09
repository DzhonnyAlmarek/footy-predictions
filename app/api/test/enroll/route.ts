import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { hashParticipantPassword, validNewPassword } from "@/lib/participant-auth";
import { consumeAttempt, participantAuthEnabled, participantDatabase, participantOriginAllowed } from "@/lib/neon-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADER = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const GENERIC = { ok: false, error: "invalid_or_expired_invitation" };
const TOKEN_RE = /^[a-f0-9]{64}$/i;

export async function POST(request: Request) {
  // Enrollment is intentionally disabled even in the isolated sandbox
  // until a separate security review, rate limiting and controlled rollout.
  if (!participantAuthEnabled() ||
      process.env.ENABLE_NEON_PARTICIPANT_ENROLLMENT !== "true") {
    return NextResponse.json({ ok: false }, { status: 404, headers: HEADER });
  }
  if (!participantOriginAllowed(request)) {
    return NextResponse.json({ ok: false }, { status: 403, headers: HEADER });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false }, { status: 503, headers: HEADER });
  }
  // Middleware intentionally blocks this endpoint until a future reviewed rollout.
  if (Number(request.headers.get("content-length") || 0) > 4096) {
    return NextResponse.json(GENERIC, { status: 400, headers: HEADER });
  }
  try {
    const { token, password } = await request.json();
    if (typeof token !== "string" || !TOKEN_RE.test(token) || !validNewPassword(password)) {
      return NextResponse.json(GENERIC, { status: 400, headers: HEADER });
    }
    // Not hashing the raw invitation into logs, URLs or error messages.
    const tokenHash = createHash("sha256").update(Buffer.from(token, "hex")).digest("hex");
    const sql = participantDatabase();
    // Rate limiting occurs before the expensive password derivation.
    const globalAllowed = await consumeAttempt(sql, "login_ip", "enrollment-global", 100);
    const tokenAllowed = await consumeAttempt(sql, "enroll_token", tokenHash, 5);
    if (!globalAllowed || !tokenAllowed) {
      return NextResponse.json(GENERIC, { status: 429, headers: HEADER });
    }
    const { salt, hash } = await hashParticipantPassword(password);
    const result = await sql`SELECT test_auth.redeem_enrollment(
      decode(${tokenHash}, 'hex'),
      decode(${salt.toString("hex")}, 'hex'),
      decode(${hash.toString("hex")}, 'hex')
    ) AS redeemed`;
    if (result[0]?.redeemed !== true) {
      return NextResponse.json(GENERIC, { status: 400, headers: HEADER });
    }
    return NextResponse.json({ ok: true }, { headers: HEADER });
  } catch {
    return NextResponse.json({ ok: false, error: "enrollment_unavailable" }, { status: 503, headers: HEADER });
  }
}
