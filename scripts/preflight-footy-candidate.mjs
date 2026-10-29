#!/usr/bin/env node
// Offline, read-only preflight. No network calls, credentials, or deployments.
import fs from "node:fs";
const config=fs.readFileSync("deploy/yandex/footy-cutover-candidate.yaml","utf8");
const docker=fs.readFileSync("Dockerfile.cutover-production-candidate","utf8");
const server=fs.readFileSync("lib/cutover-participant-server.ts","utf8");
const middleware=fs.readFileSync("middleware.ts","utf8");
const errors=[],warnings=[];
const get=(key)=>config.match(new RegExp("^  "+key+":\\s*([^\\n#]+)","m"))?.[1]?.trim().replace(/^["']|["']$/g,"");
const must=(condition,message)=>{if(!condition)errors.push(message)};
const warn=(condition,message)=>{if(condition)warnings.push(message)};
const expectedHost="ep-divine-rain-b1d1r892.c-5.eu-central-1.aws.neon.tech";
must(get("DEPLOY_TARGET")==="yandex-neon-production-candidate","Wrong DEPLOY_TARGET");
for(const k of ["ENABLE_CUTOVER_PRODUCTION_CANDIDATE","ENABLE_CUTOVER_PREVIEW","ENABLE_CUTOVER_AUTH","ENABLE_CUTOVER_LOGIN"])
  must(get(k)==="true",k+" must be explicitly true for candidate login");
for(const k of ["ENABLE_CUTOVER_PREDICTION_WRITES","ENABLE_CUTOVER_ADMIN_WRITES","ENABLE_CUTOVER_RESULT_WRITES"])
  must(get(k)==="false",k+" must be false");
must(get("CUTOVER_AUTH_ALLOWED_HOST")===expectedHost,"CUTOVER_AUTH_ALLOWED_HOST missing or wrong");
const origin=get("CUTOVER_AUTH_ORIGIN");
must(Boolean(origin&&/^https:\/\/[^/]+\/?$/.test(origin)&&!origin.includes("<")),"CUTOVER_AUTH_ORIGIN must be a concrete candidate-only HTTPS origin");
must(config.includes("expected_neon_host: "+expectedHost),"Expected candidate Neon hostname mismatch");
must(server.includes('process.env.ENABLE_CUTOVER_PRODUCTION_CANDIDATE !== "true"'),"Candidate authorization guard missing");
must(middleware.includes('process.env.ENABLE_CUTOVER_PRODUCTION_CANDIDATE === "true"'),"Candidate middleware guard missing");
must(docker.includes("ENV DEPLOY_TARGET=yandex-neon-production-candidate"),"Docker target mismatch");
must(docker.includes("NEXT_PUBLIC_SUPABASE_URL=https://isolated.invalid"),"Build placeholder missing");
must(config.includes("CUTOVER_AUTH_DATABASE_URL: CUTOVER_AUTH_DATABASE_URL"),"Runtime database secret binding missing");
must(config.includes("CUTOVER_RATE_PEPPER: CUTOVER_RATE_PEPPER"),"Runtime rate pepper binding missing");
must(/^image:\s*cr\.yandex\/crpocq57tud830bhe7ck\/footy-cutover-candidate:[a-f0-9]{40}$/m.test(config),"Image reference invalid");
warn(/^image:.*eb584d5735678f0808d1ce9e3280f2e7a33ab144/m.test(config),"Image reference is old and not confirmed present in registry");
warn(/^network:\s*none$/m.test(config),"network: none — verify outbound connectivity to Neon; do not assume networking works");
warn(true,"Login writes session and rate-limit records to isolated Neon even with feature write flags disabled");
warn(true,"Offline check cannot verify image existence, Lockbox values, IAM, network, or Neon branch identity");
for(const e of errors) console.error("FAIL:",e);
for(const w of warnings) console.log("WARN:",w);
console.log("Candidate preflight:",errors.length?"FAIL":"PASS","errors="+errors.length,"warnings="+warnings.length);
process.exitCode=errors.length?1:0;
