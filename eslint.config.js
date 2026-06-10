import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}", "*.js"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        performance: "readonly",
        localStorage: "readonly",
        FileReader: "readonly",
        IntersectionObserver: "readonly",
        Intl: "readonly",
        URLSearchParams: "readonly",
        URL: "readonly",
        history: "readonly",
      },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unescaped-entities": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      // The codebase intentionally resets fetch/loading state inside effects
      // when their deps change — the standard pre-Suspense data pattern.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["migrate-from-sheets.js"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", fetch: "readonly" },
    },
  },
];
