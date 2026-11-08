// Stateless, server-signed legacy site session. Never trust fp_login on its own.
export const LEGACY_SESSION_COOKIE = "fp_session";
const SESSION_SECONDS = 8 * 60 * 60;

function secret(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value || value.length < 32) throw new Error("Legacy session signing key unavailable");
  return value;
}
function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function decode(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  return encode(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message))));
}
export async function createLegacySession(login: string): Promise<string> {
  const payload = JSON.stringify({ login, exp: Math.floor(Date.now()/1000)+SESSION_SECONDS, nonce: crypto.randomUUID() });
  const body = encode(new TextEncoder().encode(payload));
  return body+"."+await hmac(body);
}
export async function verifyLegacySession(value: string | undefined): Promise<string | null> {
  if (!value || value.length > 2048) return null;
  const pieces = value.split(".");
  if (pieces.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(pieces[0]) || !/^[A-Za-z0-9_-]+$/.test(pieces[1])) return null;
  const expected = await hmac(pieces[0]);
  if (expected.length !== pieces[1].length) return null;
  // Compare fixed-width signatures without short-circuiting on the first mismatch.
  let unequal=0;
  for(let i=0;i<expected.length;i++) unequal |= expected.charCodeAt(i)^pieces[1].charCodeAt(i);
  if (unequal!==0) return null;
  try {
    const data=JSON.parse(new TextDecoder().decode(decode(pieces[0])));
    if (typeof data.login!=="string" || !/^(ADMIN|АМН|БАА|КДЛ|КЕН|СВС)$/.test(data.login)) return null;
    if (typeof data.exp!=="number" || data.exp<=Date.now()/1000 || data.exp>Date.now()/1000+SESSION_SECONDS+60) return null;
    return data.login;
  } catch { return null; }
}
