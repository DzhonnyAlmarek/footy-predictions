/**
 * End-to-end Neon auth test, run manually in Codespaces.
 * The ONLY target is the isolated Neon migration-work branch.
 * No production profiles are touched. Synthetic rows are cleaned in finally.
 *
 * Prerequisites: exported NEON_URL (never print it), npm ci.
 * Run: node scripts/test-neon-participant-e2e.mjs
 */
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { neon } from "@neondatabase/serverless";

const HOSTS = new Set([
  "ep-holy-smoke-b1y4pzhn.c-5.eu-central-1.aws.neon.tech",
  "ep-holy-smoke-b1y4pzhn-pooler.c-5.eu-central-1.aws.neon.tech"
]);
const url = process.env.NEON_URL;
let hostname;
try { hostname = new URL(url).hostname; } catch { throw new Error("NEON_URL missing or invalid"); }
if (!HOSTS.has(hostname)) throw new Error("STOP: URL is not isolated Neon migration branch");
const port = 3100, root = `http://127.0.0.1:${port}`, origin = root;
const sql = neon(url);
const userId = randomUUID();
const username = `e2e_${randomBytes(9).toString("hex")}`;
const token = randomBytes(32).toString("hex");
const tokenHash = createHash("sha256").update(Buffer.from(token,"hex")).digest("hex");
const password = `Test!_${randomBytes(24).toString("base64url")}`;
let seeded = false, child;

const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
function assert(condition, message) { if (!condition) throw new Error("FAIL: "+message); }
async function call(path, method="GET", body, cookie) {
  const headers = { Origin: origin };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(root+path,{method,headers,
    ...(body===undefined ? {} : {body:JSON.stringify(body)}), redirect:"manual"});
  let payload={}; try { payload = await response.json(); } catch {}
  return {status:response.status,payload,cookie:response.headers.get("set-cookie")};
}
async function main() {
  // Fail before ANY database mutation if port is already occupied.
  try {
    const existing=await fetch(root+"/",{signal:AbortSignal.timeout(1500)});
    throw new Error("STOP: 3100 already occupied (HTTP "+existing.status+")");
  } catch(e) {
    if (String(e).includes("already occupied")) throw e;
  }

  // Synthetic participant only, with no entries in historic predictions/ledger.
  await sql`INSERT INTO migration_source.profiles (id,username,role,created_at)
    VALUES (${userId}::uuid,${username},'user',now())`;
  seeded=true;
  await sql`INSERT INTO test_auth.participant_credentials(user_id)
    VALUES(${userId}::uuid)`;
  await sql`INSERT INTO test_auth.enrollment_invitations(token_hash,user_id,expires_at)
    VALUES(decode(${tokenHash},'hex'),${userId}::uuid,now()+interval '1 hour')`;
  console.log("PASS: synthetic participant + invitation prepared");

  child=spawn(process.execPath,["node_modules/next/dist/bin/next","dev",
    "--hostname","127.0.0.1","--port",String(port)], {
    stdio:"ignore",detached:true,
    env:{...process.env, DATABASE_URL:url, DEPLOY_TARGET:"yandex-neon-test",
      LOCAL_NEON_AUTH_E2E:"true",ENABLE_NEON_PARTICIPANT_AUTH:"true",
      ENABLE_NEON_PARTICIPANT_ENROLLMENT:"true",
      PARTICIPANT_RATE_PEPPER:randomBytes(32).toString("hex")}
  });
  let ready=false;
  for(let i=0;i<45;i++){
    if(child.exitCode!==null) throw new Error("Next dev exited early");
    try {
      const r=await fetch(root+"/",{signal:AbortSignal.timeout(2000)});
      if(r) {ready=true;break;}
    }catch{}
    await delay(1000);
  }
  assert(ready,"Next dev server not ready");

  const invalid=await call("/api/test/enroll","POST",{token:"00".repeat(32),password});
  assert(invalid.status===400,"invalid invitation rejected (got "+invalid.status+")");
  console.log("PASS: invalid invitation rejected");

  const enrollment=await call("/api/test/enroll","POST",{token,password});
  assert(enrollment.status===200 && enrollment.payload.ok===true,
    "valid enrollment (HTTP "+enrollment.status+")");
  console.log("PASS: enrollment");

  const replay=await call("/api/test/enroll","POST",{token,password});
  assert(replay.status===400,"invite replay rejected (HTTP "+replay.status+")");
  console.log("PASS: invitation one-time use");

  const badLogin=await call("/api/test/participant-login","POST",{username,password:password+"wrong"});
  assert(badLogin.status===401,"wrong password rejected (HTTP "+badLogin.status+")");
  console.log("PASS: wrong password rejected");

  const login=await call("/api/test/participant-login","POST",{username,password});
  assert(login.status===200 && login.payload.ok===true,"login (HTTP "+login.status+")");
  const cookie=(login.cookie||"").split(";")[0];
  assert(cookie.startsWith("fp_neon_participant="),"session cookie issued");
  console.log("PASS: login and secure-cookie issued");

  const session=await call("/api/test/participant-session","GET",undefined,cookie);
  assert(session.status===200 && session.payload.authenticated===true &&
    session.payload.username===username,"session accepted");
  console.log("PASS: session lookup");

  const logout=await call("/api/test/participant-logout","POST",undefined,cookie);
  assert(logout.status===200 && logout.payload.ok===true,"logout");
  const after=await call("/api/test/participant-session","GET",undefined,cookie);
  assert(after.status===200 && after.payload.authenticated===false,"revoked session rejected");
  console.log("PASS: logout and server-side session revocation");
}
let failed=false;
try { await main(); }
catch(error) {failed=true; console.error(error instanceof Error ? error.message : "E2E failed");}
finally {
  if(child?.pid){
    try { process.kill(-child.pid,"SIGTERM"); }catch {}
    await delay(500);
    try { process.kill(-child.pid,"SIGKILL"); }catch {}
  }
  if(seeded){
    try {
      await sql`DELETE FROM test_auth.participant_sessions WHERE user_id=${userId}::uuid`;
      await sql`DELETE FROM test_auth.enrollment_invitations WHERE user_id=${userId}::uuid`;
      await sql`DELETE FROM test_auth.participant_credentials WHERE user_id=${userId}::uuid`;
      await sql`DELETE FROM migration_source.profiles WHERE id=${userId}::uuid`;
      const r=await sql`SELECT count(*)::integer AS n FROM migration_source.profiles WHERE id=${userId}::uuid`;
      assert(r[0]?.n===0,"cleanup confirmed");
      console.log("PASS: synthetic participant and sessions removed");
    } catch(e) {
      failed=true;
      console.error("CLEANUP FAILED. Manual cleanup required for synthetic UUID:",userId);
      console.error(e instanceof Error ? e.message : "unknown cleanup error");
    }
  }
}
if(failed)process.exitCode=1;
