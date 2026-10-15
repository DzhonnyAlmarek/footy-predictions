import { NextRequest } from "next/server";
import { hashOpaqueToken } from "@/lib/participant-auth-tokens";
import { PARTICIPANT_COOKIE, participantAuthEnabled, participantDatabase } from "@/lib/neon-participant-server";

export function testAdminEnabled(): boolean {
  return participantAuthEnabled() && process.env.ENABLE_NEON_TEST_ADMIN === "true";
}

// The session token alone does not confer administrative privileges.
// Enforce the exact ADMIN identity, enabled credentials and admin role in Neon on EVERY request.
export async function requireTestAdmin(req: NextRequest): Promise<boolean> {
  if (!testAdminEnabled()) return false;
  const token = req.cookies.get(PARTICIPANT_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return false;
  const sql = participantDatabase();
  const tokenHash = hashOpaqueToken(token);
  const rows = await sql`
    SELECT p.id
    FROM migration_source.profiles p
    JOIN test_auth.participant_credentials c ON c.user_id=p.id
    WHERE p.id=test_auth.session_user(decode(${tokenHash},'hex'))
      AND p.username='ADMIN' AND p.role='admin' AND c.enabled=true
    LIMIT 1
  `;
  return rows.length===1;
}
