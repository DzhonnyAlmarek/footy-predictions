import {NextRequest,NextResponse} from "next/server";
import {hashOpaqueToken} from "@/lib/participant-auth-tokens";
import {AUTH_HEADERS,PARTICIPANT_COOKIE,participantAuthEnabled,participantDatabase} from "@/lib/neon-participant-server";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 if(!participantAuthEnabled())return NextResponse.json({error:"not_available"},{status:404,headers:AUTH_HEADERS});
 const token=req.cookies.get(PARTICIPANT_COOKIE)?.value;
 if(!token||!/^[a-f0-9]{64}$/i.test(token))return NextResponse.json({error:"unauthorized"},{status:401,headers:AUTH_HEADERS});
 try{
  const sql=participantDatabase(),hash=hashOpaqueToken(token);
  const s=await sql`SELECT test_auth.session_user(decode(${hash},'hex')) AS user_id`;
  if(typeof s[0]?.user_id!=="string")return NextResponse.json({error:"unauthorized"},{status:401,headers:AUTH_HEADERS});
  const rows=await sql`SELECT username,original_points,test_delta,effective_points FROM footy_sandbox.rating_effective_v2 ORDER BY effective_points DESC,username ASC`;
  return NextResponse.json({rows,readOnly:true,sandbox:true},{headers:AUTH_HEADERS});
 }catch{return NextResponse.json({error:"data_unavailable"},{status:503,headers:AUTH_HEADERS});}
}