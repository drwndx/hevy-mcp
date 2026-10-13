#!/usr/bin/env node
// Verifies the hash chain of the audit log: node verify-audit.mjs [path]
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const path = process.argv[2] || process.env.HEVY_AUDIT_LOG || join(dirname(fileURLToPath(import.meta.url)), "audit.log");
const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
let prev = null;
let bad = 0;
lines.forEach((line, i) => {
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    console.log(`line ${i + 1}: not valid JSON`);
    bad++;
    return;
  }
  const { hash, ...rest } = rec;
  const expected = createHash("sha256").update(JSON.stringify(rest)).digest("hex");
  if (expected !== hash) {
    console.log(`line ${i + 1}: content does not match its hash (edited)`);
    bad++;
  }
  if (prev !== null && rec.prev !== prev) {
    console.log(`line ${i + 1}: chain broken (entry removed or reordered)`);
    bad++;
  }
  prev = hash;
});
console.log(bad ? `FAILED: ${bad} problem(s) in ${lines.length} entries` : `OK: ${lines.length} entries, chain intact`);
process.exit(bad ? 1 : 0);
