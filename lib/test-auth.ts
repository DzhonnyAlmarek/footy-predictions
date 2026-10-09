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

export async function issueTestSession(userId: string): Promise<string | null> {
  const value = secret();
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return null;
  const expires = Math.floor(Date.now() / 1000) + 4 * 3600;
  const payload = toBase64url(encoder.encode(JSON.stringify({ v: 2, sub: userId, exp: expires })));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await keyFor(value), encoder.encode(payload)));
  return payload + "." + toBase64url(mac);
}

export async function getTestUserId(token: string | undefined): Promise<string | null> {
  const value = secret();
  if (!value || !token || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const bytes = fromBase64url(signature);
  const content = fromBase64url(payload);
  if (!bytes || !content || bytes.length !== 32) return null;
  const valid = await crypto.subtle.verify("HMAC", await keyFor(value), new Uint8Array(bytes), encoder.encode(payload));
  if (!valid) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(content));
    const now = Math.floor(Date.now() / 1000);
    if (obj.v !== 2 || typeof obj.sub !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(obj.sub) ||
      !Number.isSafeInteger(obj.exp) || obj.exp <= now || obj.exp > now + 4 * 3600) return null;
    return obj.sub;
  } catch {
    return null;
  }
}

export async function verifyTestSession(token: string | undefined): Promise<boolean> {
  return (await getTestUserId(token)) !== null;
}

