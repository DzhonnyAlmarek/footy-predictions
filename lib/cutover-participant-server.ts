import { neon } from "@neondatabase/serverless";
import { hashOpaqueToken } from "@/lib/participant-auth-tokens";

export const CUTOVER_COOKIE = "fp_cutover_session";
export const CUTOVER_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export function cutoverAuthEnabled(): boolean {
  const raw = process.env.CUTOVER_AUTH_DATABASE_URL;
  const allowed = process.env.CUTOVER_AUTH_ALLOWED_HOST;
  // Production candidate must be pinned to its dedicated cleaned Neon branch.
  // Host pinning alone is insufficient because one Neon project has multiple branches.
  if (process.env.DEPLOY_TARGET === "yandex-neon-production-candidate" &&
      process.env.CUTOVER_AUTH_ALLOWED_HOST !== "ep-divine-rain-b1d1r892.c-5.eu-central-1.aws.neon.tech") return false;
  const target = process.env.DEPLOY_TARGET;
  const preview = target === "yandex-neon-cutover-preview";
  const candidate = target === "yandex-neon-production-candidate";
  // Candidate auth stays disabled until explicitly gated on an isolated deployment.
  // Never authorize candidate access using the preview enable flag alone.
  if ((!preview && !candidate) ||
      (candidate && process.env.ENABLE_CUTOVER_PRODUCTION_CANDIDATE !== "true") ||
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

export type CutoverIdentity = { userId: string; username: string; role: string };

export async function authenticatedCutoverIdentity(token: unknown): Promise<CutoverIdentity | null> {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const hash = hashOpaqueToken(token);
  const sql = cutoverAuthDatabase();
  const rows = await sql`
    SELECT p.id::text AS user_id, p.username, p.role
    FROM cutover_auth.participant_sessions s
    JOIN cutover_auth.participant_credentials c ON c.user_id = s.user_id
    JOIN footy_cutover.profiles p ON p.id = s.user_id
    WHERE s.session_hash = decode(${hash}, 'hex')
      AND s.revoked_at IS NULL AND s.expires_at > now() AND c.enabled = true
    LIMIT 1
  `;
  const row = rows[0];
  return typeof row?.user_id === "string" && typeof row?.username === "string" &&
    typeof row?.role === "string"
    ? { userId: row.user_id, username: row.username, role: row.role }
    : null;
}

export async function authenticatedCutoverParticipant(token: unknown): Promise<string | null> {
  const identity = await authenticatedCutoverIdentity(token);
  if (!identity) return null;
  const rows = await cutoverAuthDatabase()`SELECT must_change_password FROM cutover_auth.participant_credentials WHERE user_id=${identity.userId}::uuid`;
  return rows[0]?.must_change_password === true ? null : identity.userId;
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
      AND ( ${process.env.CUTOVER_SHOW_TEST_MATCHES === "true"}::boolean
            OR NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id = m.id) )
    ORDER BY m.kickoff_at DESC NULLS LAST, p.id DESC LIMIT 500
  `;
}
