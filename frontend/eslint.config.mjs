import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      // Tipagem
      "@typescript-eslint/no-explicit-any": "warn",

      // Qualidade de vida (não bloquear build)
      "prefer-const": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],

      // (opcional) se ainda existir algum <img> perdido
      // "@next/next/no-img-element": "warn",
    },
  },
];

export default eslintConfig;
