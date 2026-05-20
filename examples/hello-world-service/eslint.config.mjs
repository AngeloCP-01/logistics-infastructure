// Vendored from logistics-infrastructure/shared/eslint.config.mjs.
// Node ESM resolution walks up from the importing file, so a re-export from
// the shared path can't find @eslint/js when this service has its own
// node_modules. Vendoring is the documented pattern (see shared/eslint.config.mjs).
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
