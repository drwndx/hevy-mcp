import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/**", "tmp-spec-*/**"] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: globals.node },
    rules: {
      eqeqeq: ["error", "always"],
      // stdout is reserved for MCP JSON-RPC; only stderr logging is allowed.
      "no-console": ["error", { allow: ["error"] }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
  {
    files: ["smoke.mjs", "verify-audit.mjs", "test/**"],
    rules: { "no-console": "off" },
  },
];
