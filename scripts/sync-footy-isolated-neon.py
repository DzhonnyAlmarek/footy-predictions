#!/usr/bin/env python3
"""Footy Supabase -> isolated Neon sync; PREVIEW ONLY by default.

17 keyed tables can be planned for upsert; import_rpl_matches is audited
but never changed automatically because its production source has no PK.
No data is deleted, and no source database writes are ever performed.
Requires psql and private SUPABASE_READONLY_URL / NEON_URL environment variables.
"""
import argparse, csv, io, hashlib, json, os, re, subprocess, sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

NEON_HOSTS = {"ep-holy-smoke-b1y4pzhn.c-5.eu-central-1.aws.neon.tech",
              "ep-holy-smoke-b1y4pzhn-pooler.c-5.eu-central-1.aws.neon.tech"}
KEYS = {
 "tournaments": ("id",), "teams": ("id",), "stages": ("id",),
 "tours": ("id",), "grand_prix_seasons": ("id",),
 "grand_prix_rounds": ("id",), "profiles": ("id",),
 "matches": ("id",), "predictions": ("id",),
 "grand_prix_manual_scores": ("id",), "points_ledger": ("id",),
 "match_scores": ("match_id","user_id"),
 "prediction_scores": ("prediction_id",),
 "analytics_stage_baseline": ("stage_id",),
 "analytics_stage_user": ("stage_id","user_id"),
 "analytics_stage_user_archetype": ("stage_id","user_id"),
 "analytics_stage_user_momentum": ("stage_id","user_id"),
}
UNKEYED = "import_rpl_matches"

def stop(reason): raise SystemExit("STOP: "+reason)
def ident(x):
    if not re.fullmatch(r"[a-z][a-z0-9_]*",x): stop("invalid identifier")
    return '"'+x+'"'
def literal(x): return "'"+str(x).replace("'","''")+"'"

def connections():
    src,dst=os.getenv("SUPABASE_READONLY_URL"),os.getenv("NEON_URL")
    if not src or not dst: stop("missing source/target URL; never paste secrets in chat")
    try: a,b=urlsplit(src),urlsplit(dst)
    except ValueError: stop("invalid connection URL")
    if a.hostname!="db.dfcfixmvplkhkaayfbbd.supabase.co" or a.username!="footy_migration_reader":
        stop("source must use dedicated Supabase read-only role and direct project endpoint")
    if b.hostname not in NEON_HOSTS: stop("target is NOT isolated migration-work Neon branch")
    if a.scheme not in ("postgres","postgresql") or b.scheme not in ("postgres","postgresql"):
        stop("unexpected DB URL scheme")
    return src,dst

def run_psql(url,script,readonly=True):
    env=dict(os.environ)
    env["PGDATABASE"]=url
    env["PGCONNECT_TIMEOUT"]="12"
    env.pop("PGOPTIONS",None)
    if readonly: env["PGOPTIONS"]="-c default_transaction_read_only=on"
    try:
        r=subprocess.run(["psql","-X","-q","-v","ON_ERROR_STOP=1"],
            input=script,text=True,capture_output=True,env=env,timeout=180)
    except (FileNotFoundError,subprocess.TimeoutExpired):
        stop("psql unavailable or timed out; inspect DB status before retry")
    if r.returncode:
        # Never reveal stdout/stderr: generated SQL may contain participant data.
        stop("database command failed; review state before retry (details suppressed)")
    return r.stdout

def snapshot(url,schema):
    parts=[]
    for t,ks in KEYS.items():
        key=",".join("x."+ident(k) for k in ks)
        parts.append("SELECT "+literal(t)+",jsonb_build_array("+key+
                     ")::text,to_jsonb(x)::text FROM "+ident(schema)+"."+ident(t)+" x")
    parts.append("SELECT "+literal(UNKEYED)+",to_jsonb(x)::text,to_jsonb(x)::text FROM "+
                 ident(schema)+"."+ident(UNKEYED)+" x")
    script=("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
            "SET LOCAL statement_timeout='60000ms';\nCOPY ("+
            " UNION ALL ".join(parts)+
            ") TO STDOUT WITH (FORMAT csv);\nCOMMIT;\n")
    out={t:{} for t in KEYS};out[UNKEYED]=Counter()
    for row in csv.reader(io.StringIO(run_psql(url,script))):
        if len(row)!=3 or row[0] not in out: stop("snapshot output invalid")
        t,k,raw=row
        try: record=json.loads(raw)
        except ValueError: stop("snapshot JSON invalid")
        fp=hashlib.sha256(raw.encode()).hexdigest()
        if t==UNKEYED:
            out[t][fp]+=1
        else:
            if k in out[t]: stop("duplicate source/destination key: "+t)
            out[t][k]=(fp,record)
    return out

def compare(a,b):
    result={}
    for t in KEYS:
        x,y=a[t],b[t]
        result[t]=dict(source=len(x),neon=len(y),
            new=sorted(x.keys()-y.keys()),
            changed=sorted(k for k in x.keys()&y.keys() if x[k][0]!=y[k][0]),
            only_neon=sorted(y.keys()-x.keys()))
    x,y=a[UNKEYED],b[UNKEYED]
    result[UNKEYED]=dict(source=sum(x.values()),neon=sum(y.values()),
        new=list((x-y).elements()),changed=[],only_neon=list((y-x).elements()))
    return result

def report(d):
    for t in (*KEYS,UNKEYED):
        v=d[t]
        print(f"{t}: source={v['source']}, neon={v['neon']}, "+
              f"new={len(v['new'])}, changed={len(v['changed'])}, "+
              f"only_neon={len(v['only_neon'])}"+
              (" (AUDIT ONLY)" if t==UNKEYED else ""))
    print("No deletions. Source is read-only.")

def digest(a,b):
    v=[]
    for data in (a,b):
        v.extend((t,k,fp) for t in KEYS for k,(fp,_) in sorted(data[t].items()))
        v.extend((UNKEYED,k,count) for k,count in sorted(data[UNKEYED].items()))
        v.append(("_snapshot_end_",len(v)))
    return hashlib.sha256(json.dumps(v,separators=(",",":")).encode()).hexdigest()

def apply_sql(diff,source,target):
    # Exact target row value is checked before update under an exclusive table
    # lock inside the SAME Neon transaction. An inserted ID is checked absent.
    statements=["BEGIN;","SET LOCAL lock_timeout='5s';",
                "SET LOCAL statement_timeout='120000ms';"]
    for t,ks in KEYS.items():
        changes=diff[t]["new"]+diff[t]["changed"]
        if not changes: continue
        table="migration_source."+ident(t)
        statements.append("LOCK TABLE "+table+" IN SHARE ROW EXCLUSIVE MODE;")
        for key in changes:
            key_values=json.loads(key)
            if len(key_values)!=len(ks): stop("key count changed")
            where=" AND ".join(ident(k)+" IS NOT DISTINCT FROM ("+
               "jsonb_populate_record(NULL::"+table+","+
               literal(json.dumps({k:v},ensure_ascii=False))+"::jsonb))."+ident(k)
               for k,v in zip(ks,key_values))
            if key in target[t]:
                old=json.dumps(target[t][key][1],ensure_ascii=False)
                guard=("EXISTS (SELECT 1 FROM "+table+" WHERE "+where+
                    " AND to_jsonb("+ident(t)+")="+literal(old)+"::jsonb)")
                failure="destination row changed"
            else:
                guard="NOT EXISTS (SELECT 1 FROM "+table+" WHERE "+where+")"
                failure="destination key already exists"
            statements.append("DO $$BEGIN IF NOT ("+guard+
                 ") THEN RAISE EXCEPTION "+literal(failure)+"; END IF; END$$;")
        records=[source[t][k][1] for k in changes]
        cols=set(records[0])
        if any(set(r)!=cols for r in records) or not all(re.fullmatch(r"[a-z][a-z0-9_]*",c) for c in cols):
            stop("unexpected source column layout")
        updates=[c for c in sorted(cols) if c not in ks]
        if not updates: stop("key-only source table")
        assignments=",".join(ident(c)+"=EXCLUDED."+ident(c) for c in updates)
        payload=literal(json.dumps(records,ensure_ascii=False,separators=(",",":")))
        statements.append("INSERT INTO "+table+
           " SELECT (jsonb_populate_record(NULL::"+table+
           ",v.value)).* FROM jsonb_array_elements("+payload+
           "::jsonb) AS v(value) ON CONFLICT ("+
           ",".join(ident(k) for k in ks)+") DO UPDATE SET "+assignments+";")
    statements.append("COMMIT;")
    return "\n".join(statements)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--mode",choices=["preview","apply"],default="preview")
    ap.add_argument("--plan-file")
    ap.add_argument("--confirm")
    args=ap.parse_args()
    src_url,neon_url=connections()
    if args.mode=="apply":
        if args.confirm!="ISOLATED-NEON-ONLY" or not args.plan_file:
            stop("apply requires saved preview and --confirm ISOLATED-NEON-ONLY")
        try: plan=json.loads(Path(args.plan_file).read_text())
        except (OSError,ValueError): stop("preview plan missing")
        if plan.get("scope")!="br-snowy-dream-b1z9gj1l/migration_source":
            stop("incorrect preview scope")
    a=snapshot(src_url,"public")
    b=snapshot(neon_url,"migration_source")
    d=compare(a,b)
    report(d)
    code=digest(a,b)
    if args.mode=="preview":
        if args.plan_file:
            path=Path(args.plan_file)
            if not path.is_absolute() or not str(path).startswith("/tmp/"):
                stop("plan file must be inside /tmp")
            with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),"w") as f:
                json.dump({"scope":"br-snowy-dream-b1z9gj1l/migration_source",
                    "captured_utc":datetime.now(timezone.utc).isoformat(),
                    "checksum":code},f)
            print("Saved private preview plan:",path)
        print("PREVIEW ONLY: no changes applied")
        return
    if code!=plan.get("checksum"):
        stop("source or Neon changed after preview: regenerate and reapprove")
    if d[UNKEYED]["new"] or d[UNKEYED]["only_neon"]:
        stop("unkeyed import_rpl_matches differs: manual resolution required")
    if any(d[t]["only_neon"] for t in KEYS):
        stop("Neon-only rows detected: manual resolution required; no deletions")
    if not any(d[t]["new"] or d[t]["changed"] for t in KEYS):
        print("Already synchronized. No writes performed.")
        return
    # A second source snapshot mitigates concurrent production changes before
    # applying. Writes may still occur after it: verify again immediately.
    if digest(snapshot(src_url,"public"),b)!=code:
        stop("source changed during preparation; regenerate preview")
    run_psql(neon_url,apply_sql(d,a,b),readonly=False)
    print("APPLY transaction committed on isolated Neon. Post-check:")
    final=compare(snapshot(src_url,"public"),snapshot(neon_url,"migration_source"))
    report(final)
    print("Concurrent production changes may require another preview/apply cycle.")

if __name__=="__main__": main()
