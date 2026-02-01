import js from "@eslint/js";

// ВАЖНО: для Next 15 в flat config используем явный .js путь
import nextCoreWebVitals from "eslint-config-next/core-web-vitals.js";

export default [
  js.configs.recommended,
  nextCoreWebVitals,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
    ],
  },
];
