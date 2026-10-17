import { neon } from "@neondatabase/serverless";
import { hashOpaqueToken } from "@/lib/participant-auth-tokens";

export const CUTOVER_COOKIE = "fp_cutover_session";
export const CUTOVER_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export function cutoverAuthEnabled(): boolean {
  const raw = process.env.CUTOVER_AUTH_DATABASE_URL;
  const allowed = process.env.CUTOVER_AUTH_ALLOWED_HOST;
  if (process.env.DEPLOY_TARGET !== "yandex-neon-cutover-preview" ||
      process.env.ENABLE_CUTOVER_AUTH !== "true" || !raw || !allowed ||
      !allowed.endsWith(".neon.tech")) return false;
  try {
    const url = new URL(raw);
    return (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
      url.hostname === allowed && url.searchParams.get("sslmode") === "require";
  } catch { return false; }
}

function cutoverAuthDatabase() {
  if (!cutoverAuthEnabled()) throw new Error("cutover auth disabled");
  return neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
}

export async function authenticatedCutoverParticipant(token: unknown): Promise<string | null> {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const hash = hashOpaqueToken(token);
  const sql = cutoverAuthDatabase();
  const rows = await sql`
    SELECT p.id::text AS user_id
    FROM cutover_auth.participant_sessions s
    JOIN cutover_auth.participant_credentials c ON c.user_id = s.user_id
    JOIN footy_cutover.profiles p ON p.id = s.user_id
    WHERE s.session_hash = decode(${hash}, 'hex')
      AND s.revoked_at IS NULL AND s.expires_at > now() AND c.enabled = true
    LIMIT 1
  `;
  return typeof rows[0]?.user_id === "string" ? rows[0].user_id : null;
}

export async function cutoverOwnPredictions(userId: string) {
  const sql = cutoverAuthDatabase();
  return sql`
    SELECT p.match_id::text AS match_id, p.home_pred, p.away_pred,
           m.kickoff_at, m.status, m.home_score, m.away_score,
           h.name AS home_team, a.name AS away_team
    FROM footy_cutover.predictions p
    JOIN footy_cutover.matches m ON m.id=p.match_id
    LEFT JOIN footy_cutover.teams h ON h.id=m.home_team_id
    LEFT JOIN footy_cutover.teams a ON a.id=m.away_team_id
    WHERE p.user_id = ${userId}::uuid
    ORDER BY m.kickoff_at DESC NULLS LAST, p.id DESC LIMIT 500
  `;
}
