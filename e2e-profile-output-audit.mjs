// Diagnostic: measure output-size composition of the latest analyzed profile —
// specifically how much of the AI output duplicates evidence text between the
// top-level evidence array and the inline skill.evidence arrays.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
const getEnv = (key) => {
  const m = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
};

const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(url, serviceKey);

const { data: rows, error } = await supabase
  .from("resumes")
  .select("id, created_at, candidate_profile")
  .eq("extraction_status", "completed")
  .order("created_at", { ascending: false })
  .limit(6);

if (error || !rows?.length) {
  console.log("ERROR:", error?.message ?? "no profiles");
  process.exit(1);
}

for (const data of rows) {
const p = data.candidate_profile;
const jsonLen = (obj) => JSON.stringify(obj).length;

const total = jsonLen(p);
const topLevelEvidence = p.evidence ?? [];
const inline = [];
for (const arr of [p.skills ?? [], p.softSkills ?? [], p.technologies ?? []]) {
  for (const s of arr) {
    for (const ev of s.evidence ?? []) inline.push(ev.text);
  }
}

const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const topSet = new Set(topLevelEvidence.map((e) => norm(e.text)));
const skillNames = new Set((p.skills ?? []).map((s) => norm(s.name)));
const techDup = (p.technologies ?? []).filter((t) => skillNames.has(norm(t.name)));
const techDupChars = techDup.reduce((a, t) => a + jsonLen(t), 0);

let dupChars = 0;
let uniqueChars = 0;
for (const t of inline) {
  if (topSet.has(norm(t))) dupChars += t.length;
  else uniqueChars += t.length;
}

console.log("── resume", data.id, "created:", data.created_at);
console.log("profile JSON chars total:", total);
console.log("top-level evidence records:", topLevelEvidence.length,
  "chars:", topLevelEvidence.reduce((a, e) => a + (e.text?.length ?? 0), 0));
console.log("inline skill evidence entries:", inline.length,
  "chars:", dupChars + uniqueChars);
console.log("  duplicating top-level text:", dupChars, "chars");
console.log("  unique to skills:", uniqueChars, "chars");
console.log("skills/softSkills/technologies counts:",
  (p.skills ?? []).length, (p.softSkills ?? []).length, (p.technologies ?? []).length);
console.log("technologies duplicating a skills name:", techDup.length,
  "objects ≈", techDupChars, "chars of pure duplication");
console.log("evidenceIds coverage:",
  [...(p.skills ?? []), ...(p.technologies ?? [])]
    .filter((s) => (s.evidenceIds ?? []).length > 0).length,
  "of", (p.skills ?? []).length + (p.technologies ?? []).length);
}
