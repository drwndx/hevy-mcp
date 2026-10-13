#!/usr/bin/env node
// Live, READ-ONLY smoke test against the real Hevy API. It spawns its own server with writes forced off,
// regardless of HEVY_ENABLE_WRITES in .env, so it can never modify your account. Usage: npm run smoke
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const server = fileURLToPath(new URL("./index.mjs", import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [server],
  env: { ...process.env, HEVY_ENABLE_WRITES: "", HEVY_ALLOWED_TOOLS: "", HEVY_AUDIT_LOG: "off" },
  stderr: "inherit",
});
const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failed++; };

check(tools.length === 14 && tools.every((t) => t.annotations?.readOnlyHint), `exposes only the 14 read-only tools (got ${tools.length})`);

for (const t of tools.filter((t) => !t.inputSchema.required?.length)) {
  const args = t.inputSchema.properties?.pageSize ? { pageSize: 1 } : {};
  const res = await client.callTool({ name: t.name, arguments: args });
  check(!res.isError, `${t.name}${res.isError ? ": " + res.content[0].text.slice(0, 120) : ""}`);
}

const write = await client.callTool({ name: "hevy_create_routine_folder", arguments: { body: { routine_folder: { title: "x" } } } });
check(write.isError === true, "write tools are refused");

await client.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nSmoke test passed (read-only)");
process.exit(failed ? 1 : 0);
