import { cookies } from "next/headers";
import { LEGACY_SESSION_COOKIE, verifyLegacySession } from "@/lib/legacy-session";

/** Use the verified HMAC identity, not a separately encoded fp_login cookie. */
export async function getVerifiedLegacyLogin(): Promise<string | null> {
  const jar = await cookies();
  return verifyLegacySession(jar.get(LEGACY_SESSION_COOKIE)?.value);
}
