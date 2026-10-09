import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Isolated Neon participant auth helpers. No credentials, IPs or raw session
 * tokens should be written to logs or persisted in Git.
 */
export function hashRateSubject(scope: string, subject: string, pepper: string): string {
  if (pepper.length < 32) throw new Error("Rate-limit secret not configured");
  return createHmac("sha256", pepper).update(scope).update("\0").update(subject).digest("hex");
}

export function createOpaqueToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashOpaqueToken(token) };
}

export function hashOpaqueToken(token: string): string {
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Invalid token");
  return createHash("sha256").update(Buffer.from(token, "hex")).digest("hex");
}

/** Hash only; database must store tokenHash, never the bearer token. */
export function isSecureTokenHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}
