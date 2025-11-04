import tseslint from "typescript-eslint";
import eslintPluginVitest from "eslint-plugin-vitest";

export default [
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    files: ["**/*.ts"],
    ignores: ["dist", "coverage"],
    plugins: {
      vitest: eslintPluginVitest
    },
    rules: {
      "vitest/max-nested-describe": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/consistent-type-definitions": "off"
    }
  }
];
