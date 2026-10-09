"""No-database safety checks for sync-footy-isolated-neon.py."""
import importlib.util
import pathlib
from collections import Counter

path = pathlib.Path(__file__).with_name("sync-footy-isolated-neon.py")
spec = importlib.util.spec_from_file_location("footy_sync", path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

source = {name: {} for name in m.KEYS}
target = {name: {} for name in m.KEYS}
source[m.UNKEYED] = Counter({"unchanged": 2})
target[m.UNKEYED] = Counter({"unchanged": 2})
source["matches"]["[395]"] = ("v2", {"id":395,"home_score":1,"away_score":0,"status":"finished"})
target["matches"]["[395]"] = ("v1", {"id":395,"home_score":None,"away_score":None,"status":"scheduled"})
d = m.compare(source, target)
assert d["matches"]["changed"] == ["[395]"]
assert d["matches"]["new"] == []
assert d[m.UNKEYED]["new"] == []
assert m.digest(source,target) != m.digest(source,source)
sql = m.apply_sql(d,source,target)
assert sql.startswith("BEGIN;") and sql.endswith("COMMIT;")
assert 'LOCK TABLE migration_source."matches"' in sql
assert 'ON CONFLICT ("id") DO UPDATE' in sql
assert "DO $$BEGIN IF NOT" in sql
assert "import_rpl_matches" in m.snapshot.__code__.co_consts or "import_rpl_matches" == m.UNKEYED
assert "SET LOCAL statement_timeout" in sql
print("PASS: delta detection, drift checksum, guarded transaction, unkeyed-table policy")
print("No network connections or database writes were performed.")
