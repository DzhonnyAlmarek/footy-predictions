import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const BUCKET = mustEnv("SUPABASE_STORAGE_BUCKET");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const dir = "_backups";
if (!fs.existsSync(dir)) throw new Error("Folder _backups not found");

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".json.gz"))
  .map((f) => path.join(dir, f));

if (!files.length) throw new Error("No .json.gz files found in _backups");

const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

for (const file of files) {
  const base = path.basename(file);
  const objectPath = `stage/${day}/${base}`;

  const buf = fs.readFileSync(file);

  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, buf, {
    contentType: "application/gzip",
    upsert: true,
  });

  if (error) throw error;
  console.log("Uploaded:", objectPath);
}