// Shared ESLint 9 flat config. Service repos import via:
//   import shared from "../../logistics-infrastructure/shared/eslint.config.mjs";
//   export default [...shared];
// In CI, the service repo vendors this file (npm install or git submodule is overkill for v1).

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "coverage/", "*.config.*"],
  },
];
