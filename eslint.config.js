const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    // Windows path separators sometimes prevent the ignore glob from matching.
    ignores: [
      "dist/*",
      "supabase/database.types.ts",
      "supabase\\database.types.ts",
      "**/supabase/database.types.ts",
      "**\\supabase\\database.types.ts",
    ],
    rules: {
      "prettier/prettier": [
        "error",
        {
          endOfLine: "auto",
        },
      ],
    },
  },
]);
