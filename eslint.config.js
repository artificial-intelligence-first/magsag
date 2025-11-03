import tseslint from "typescript-eslint";
import eslintPluginVitest from "eslint-plugin-vitest";

export default tseslint.config(
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    files: ["**/*.ts"],
    ignores: ["dist", "coverage"],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      vitest: eslintPluginVitest
    },
    rules: {
      "vitest/max-nested-describe": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          ignoreIIFE: true,
          ignoreVoid: true
        }
      ]
    }
  }
);
