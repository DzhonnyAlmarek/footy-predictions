import { createHmac } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export const PARTICIPANT_COOKIE = "fp_neon_participant";
export const AUTH_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export function participantAuthEnabled(): boolean {
  // Hard pin to the isolated migration branch endpoint; never fall back to default Neon.
  let host = "";
  try { host = new URL(process.env.DATABASE_URL || "").hostname; } catch { return false; }
  return process.env.DEPLOY_TARGET === "yandex-neon-test" &&
    process.env.ENABLE_NEON_PARTICIPANT_AUTH === "true" &&
    (host === "ep-holy-smoke-b1y4pzhn.c-5.eu-central-1.aws.neon.tech" ||
     host === "ep-holy-smoke-b1y4pzhn-pooler.c-5.eu-central-1.aws.neon.tech") &&
    typeof process.env.PARTICIPANT_RATE_PEPPER === "string" &&
    process.env.PARTICIPANT_RATE_PEPPER.length >= 32;
}

export function participantOriginAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !!origin && origin === "https://bbadj1vr2rcdeh9k8tna.containers.yandexcloud.net";
}

export function participantDatabase() {
  if (!participantAuthEnabled()) throw new Error("participant auth disabled");
  return neon(process.env.DATABASE_URL!);
}

export async function consumeAttempt(
  sql: ReturnType<typeof neon>, scope: "login_ip" | "login_account" | "enroll_token",
  subject: string, limit: number, seconds = 900
): Promise<boolean> {
  const pepper = process.env.PARTICIPANT_RATE_PEPPER!;
  const hash = createHmac("sha256", pepper).update(scope).update("\0").update(subject).digest("hex");
  const result = await sql`SELECT test_auth.consume_rate_limit(
     ${scope}, decode(${hash},'hex'), ${limit}, ${seconds}
   ) AS allowed`;
  return result[0]?.allowed === true;
}
