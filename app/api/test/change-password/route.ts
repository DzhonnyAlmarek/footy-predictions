import { NextRequest, NextResponse } from "next/server";
import { hashOpaqueToken } from "@/lib/participant-auth-tokens";
import { hashParticipantPassword, validNewPassword, verifyParticipantPassword } from "@/lib/participant-auth";
import { AUTH_HEADERS, PARTICIPANT_COOKIE, consumeAttempt, participantAuthEnabled, participantDatabase, participantOriginAllowed } from "@/lib/neon-participant-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (error:string,status:number) => NextResponse.json({ok:false,error},{status,headers:AUTH_HEADERS});
export async function POST(req:NextRequest) {
 if(!participantAuthEnabled()) return response("not_available",404);
 if(!participantOriginAllowed(req)) return response("forbidden",403);
 if(Number(req.headers.get("content-length")||0)>4096) return response("bad_request",400);
 const token=req.cookies.get(PARTICIPANT_COOKIE)?.value;
 if(!token || !/^[a-f0-9]{64}$/i.test(token)) return response("unauthorized",401);
 try {
  const body=await req.json();
  const oldPassword=body?.oldPassword, newPassword=body?.newPassword;
  if(typeof oldPassword!=="string" || Buffer.byteLength(oldPassword,"utf8")>256 || !validNewPassword(newPassword) || oldPassword===newPassword) return response("invalid_password",400);
  const sql=participantDatabase();
  const tokenHash=hashOpaqueToken(token);
  const session=await sql`SELECT test_auth.session_user(decode(${tokenHash},'hex')) AS user_id`;
  const userId=session[0]?.user_id;
  if(typeof userId!=="string") return response("unauthorized",401);
  const allowed=await consumeAttempt(sql,"login_account","change-password:"+userId,5);
  if(!allowed) return response("too_many_attempts",429);
  const credentials=await sql`SELECT encode(password_salt,'hex') AS salt, encode(password_hash,'hex') AS digest FROM test_auth.participant_credentials WHERE user_id=${userId}::uuid AND enabled=true LIMIT 1`;
  const row=credentials[0];
  if(typeof row?.salt!=="string" || typeof row?.digest!=="string") return response("unauthorized",401);
  const valid=await verifyParticipantPassword(oldPassword,Buffer.from(row.salt,"hex"),Buffer.from(row.digest,"hex"));
  if(!valid) return response("invalid_credentials",401);
  const next=await hashParticipantPassword(newPassword);
  const oldHash=Buffer.from(row.digest,"hex").toString("hex");
  const updated=await sql`
    WITH changed AS (
      UPDATE test_auth.participant_credentials
      SET password_salt=decode(${next.salt.toString("hex")},'hex'),
          password_hash=decode(${next.hash.toString("hex")},'hex'),password_set_at=now()
      WHERE user_id=${userId}::uuid AND enabled=true AND password_hash=decode(${oldHash},'hex')
      RETURNING user_id
    ), revoked AS (
      UPDATE test_auth.participant_sessions
      SET revoked_at=now()
      WHERE user_id IN (SELECT user_id FROM changed) AND revoked_at IS NULL
      RETURNING 1
    )
    SELECT user_id FROM changed`;
  if(updated.length!==1) return response("retry_required",409);
  const out=NextResponse.json({ok:true},{headers:AUTH_HEADERS});
  out.cookies.set(PARTICIPANT_COOKIE,"",{httpOnly:true,secure:true,sameSite:"strict",path:"/",maxAge:0});
  return out;
 } catch {return response("unavailable",503);}
}
