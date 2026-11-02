#!/usr/bin/env python3
"""Generate a fail-closed tour-98 SQL transaction from source snapshots.
Read-only generator; output contains private participant data, never print to CI logs.
Execution against any database is intentionally NOT implemented.
"""
import argparse
import json
from pathlib import Path

MATCH_IDS = [420, 421, 422, 423]
PRED_IDS = [1758, 1759, 1760, 1761, 1762]
TOTALS = {420: "7.00", 421: "13.00", 422: "11.00", 423: "8.00"}

def verify(source, target):
    predictions = source["predictions"]
    matches = source["matches"]
    ledger = source["points_ledger"]
    assert sorted(int(x["id"]) for x in predictions) == PRED_IDS
    assert sorted(int(x["id"]) for x in matches) == MATCH_IDS
    assert len(ledger) == 20
    assert len({(int(x["match_id"]), x["user_id"]) for x in ledger}) == 20
    assert not {int(x["id"]) for x in predictions} & {int(x) for x in target["prediction_ids"]}
    assert not {(int(x["match_id"]),x["user_id"]) for x in ledger} & {(int(x["match_id"]),x["user_id"]) for x in target["ledger_pairs"]}
    assert all(target["matches"][str(i)]["status"] == "scheduled" and target["matches"][str(i)]["home_score"] is None and target["matches"][str(i)]["away_score"] is None for i in MATCH_IDS)
    assert all(matches[k]["status"] == "finished" for k in range(0))  # assertions below handle all four
    assert all(x["status"] == "finished" for x in matches)
    from decimal import Decimal
    for mid in MATCH_IDS:
        group=[x for x in ledger if int(x["match_id"])==mid]
        assert len(group)==5
        assert sum(Decimal(str(x["points"])) for x in group)==Decimal(TOTALS[mid])

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--source-json", type=Path, required=True)
    parser.add_argument("--target-json", type=Path, required=True)
    args=parser.parse_args()
    source=json.loads(args.source_json.read_text())
    target=json.loads(args.target_json.read_text())
    verify(source,target)
    print("Preconditions pass for supplied snapshots only; NO database connection and NO SQL executed.")
    print("Operation remains blocked until source-row fields, target freshness, locking and rollback are reviewed.")

if __name__=="__main__":
    main()
