import { NextResponse } from "next/server";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { COOKIE_NAME, issueTestSession } from "@/lib/test-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (process.env.DEPLOY_TARGET !== "yandex-neon-test") {
    return NextResponse.json({ ok: false }, { status: 404, headers });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false }, { status: 403, headers });
  }

  const configuredLogin = process.env.TEST_LOGIN;
  const configuredHash = process.env.TEST_PASSWORD_SCRYPT;
  if (!configuredLogin || !configuredHash || !process.env.TEST_AUTH_SECRET) {
    return NextResponse.json({ ok: false, error: "test_auth_not_configured" }, { status: 503, headers });
  }

  const body = await request.json().catch(() => ({}));
  const login = typeof body.login === "string" ? body.login : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!login || !password || password.length > 256) {
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401, headers });
  }
  const [salt, expected] = configuredHash.split(":");
  if (!salt || !expected || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(expected)) {
    return NextResponse.json({ ok: false, error: "test_auth_not_configured" }, { status: 503, headers });
  }
  const computed = scryptSync(password, Buffer.from(salt, "hex"), 64);
  const matched = login === configuredLogin &&
    timingSafeEqual(computed, Buffer.from(expected, "hex"));
  if (!matched) {
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401, headers });
  }
  const token = await issueTestSession();
  if (!token) {
    return NextResponse.json({ ok: false, error: "test_auth_not_configured" }, { status: 503, headers });
  }
  const res = NextResponse.json({ ok: true, redirect: "/test-area" }, { headers });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 4 * 3600
  });
  return res;
}
