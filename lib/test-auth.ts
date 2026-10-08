// Dedicated, dependency-free authentication for the isolated test sandbox.
// NEVER accepts production Supabase auth cookies or credentials.
export const COOKIE_NAME = "fp_test_session";
const encoder = new TextEncoder();

function secret(): string | null {
  const s = process.env.TEST_AUTH_SECRET;
  return s && s.length >= 32 ? s : null;
}

function fromBase64url(value: string): Uint8Array | null {
  try {
    const raw = value.replace(/-/g, "+").replace(/_/g, "/");
    const b64 = raw + "=".repeat((4 - (raw.length % 4)) % 4);
    const binary = atob(b64);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function keyFor(secretValue: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secretValue),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function issueTestSession(): Promise<string | null> {
  const value = secret();
  if (!value) return null;
  const expires = Math.floor(Date.now() / 1000) + 4 * 3600;
  const payload = toBase64url(encoder.encode(JSON.stringify({ v: 1, sub: "sandbox-tester", exp: expires })));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await keyFor(value), encoder.encode(payload)));
  return payload + "." + toBase64url(mac);
}

export async function verifyTestSession(token: string | undefined): Promise<boolean> {
  const value = secret();
  if (!value || !token || token.length > 2048) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const bytes = fromBase64url(signature);
  const content = fromBase64url(payload);
  if (!bytes || !content || bytes.length !== 32) return false;
  const valid = await crypto.subtle.verify("HMAC", await keyFor(value), new Uint8Array(bytes), encoder.encode(payload));
  if (!valid) return false;
  try {
    const obj = JSON.parse(new TextDecoder().decode(content));
    const now = Math.floor(Date.now() / 1000);
    return obj.v === 1 && obj.sub === "sandbox-tester" &&
      Number.isSafeInteger(obj.exp) && obj.exp > now && obj.exp <= now + 4 * 3600;
  } catch {
    return false;
  }
}
