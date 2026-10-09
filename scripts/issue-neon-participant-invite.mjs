// Manual administrator-only utility. DO NOT run from CI or application runtime.
// Intended only for isolated Neon work branch. Stores an invitation token HASH in
// PostgreSQL and the raw token in a local 0600 file outside Git.
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const expectedHosts = new Set([
  "ep-holy-smoke-b1y4pzhn.c-5.eu-central-1.aws.neon.tech",
  "ep-holy-smoke-b1y4pzhn-pooler.c-5.eu-central-1.aws.neon.tech"
]);
const url = process.env.NEON_URL;
const userId = process.argv[2];
const path = process.argv[3];
if (!url || !expectedHosts.has(new URL(url).hostname) ||
    process.env.CONFIRM_NEON_MIGRATION_INVITE !== "yes" ||
    !/^[a-f0-9-]{36}$/i.test(userId || "") || !path ||
    !path.startsWith("/tmp/") || !path.endsWith(".invite")) {
  console.error("Usage: CONFIRM_NEON_MIGRATION_INVITE=yes NEON_URL=... node scripts/issue-neon-participant-invite.mjs <user-uuid> /tmp/<name>.invite");
  process.exit(2);
}
const sql = neon(url);
const rows = await sql`SELECT c.user_id FROM test_auth.participant_credentials c
 WHERE c.user_id = ${userId}::uuid AND c.enabled = false AND c.password_hash IS NULL LIMIT 1`;
if (rows.length !== 1) {
  console.error("No inactive, unconfigured participant found");
  process.exit(1);
}
const token = randomBytes(32).toString("hex");
const tokenHash = createHash("sha256").update(Buffer.from(token,"hex")).digest("hex");
const inserted = await sql`INSERT INTO test_auth.enrollment_invitations(token_hash,user_id,expires_at)
  VALUES(decode(${tokenHash},'hex'), ${userId}::uuid, now() + interval '24 hours')
  RETURNING 1 AS inserted`;
if (inserted.length !== 1) process.exit(1);
try {
  writeFileSync(path, token + "\n", { flag: "wx", mode: 0o600 });
} catch {
  console.error("Invitation stored in Neon, but secure local file could not be created; do not retry blindly.");
  process.exit(1);
}
console.log("Invitation created; token stored only in private file:",path);
console.log("Share through a secure channel; never commit it to Git or paste it into chat.");
