/**
 * Isolated Neon participant authentication primitives.
 * This module does not query Supabase and must not accept production credentials.
 * Callers must provide validated user UUIDs and perform server-side rate limiting.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export function isParticipantId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function validNewPassword(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= MIN_PASSWORD_LENGTH &&
    value.length <= MAX_PASSWORD_LENGTH &&
    Buffer.byteLength(value, "utf8") <= 256;
}

export async function hashParticipantPassword(password: string): Promise<{salt: Buffer; hash: Buffer}> {
  if (!validNewPassword(password)) throw new Error("Invalid password length");
  const salt = randomBytes(32);
  const hash = (await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })) as Buffer;
  return { salt, hash };
}

export async function verifyParticipantPassword(
  password: unknown, salt: Uint8Array | null, expectedHash: Uint8Array | null
): Promise<boolean> {
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") > 256 ||
      !salt || !expectedHash || salt.byteLength !== 32 || expectedHash.byteLength !== 64) {
    return false;
  }
  const actual = (await scrypt(password, Buffer.from(salt), 64,
    { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })) as Buffer;
  return timingSafeEqual(actual, Buffer.from(expectedHash));
}
