import { createClient } from "@supabase/supabase-js";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const BUCKET = mustEnv("SUPABASE_STORAGE_BUCKET");
const KEEP_DAYS = Number(process.env.KEEP_DAYS ?? "30");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function dateToStr(d) {
  return d.toISOString().slice(0, 10);
}

const cutoff = new Date();
cutoff.setUTCDate(cutoff.getUTCDate() - KEEP_DAYS);
const cutoffStr = dateToStr(cutoff);

// Листим папку stage/ и удаляем папки (YYYY-MM-DD) которые < cutoff
const { data: folders, error } = await supabase.storage.from(BUCKET).list("stage", {
  limit: 1000,
});
if (error) throw error;

const old = (folders ?? [])
  .filter((x) => x.name && /^\d{4}-\d{2}-\d{2}$/.test(x.name))
  .filter((x) => x.name < cutoffStr)
  .map((x) => x.name);

for (const day of old) {
  // листим содержимое stage/<day> и удаляем файлы
  const prefix = `stage/${day}`;
  const { data: objects, error: e2 } = await supabase.storage.from(BUCKET).list(prefix, {
    limit: 1000,
  });
  if (e2) throw e2;

  const paths = (objects ?? []).map((o) => `${prefix}/${o.name}`);
  if (!paths.length) continue;

  const { error: e3 } = await supabase.storage.from(BUCKET).remove(paths);
  if (e3) throw e3;

  console.log("Removed:", prefix, "count:", paths.length);
}

console.log("Cutoff:", cutoffStr, "kept days:", KEEP_DAYS);