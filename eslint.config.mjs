import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // RepWon product boundaries (docs/BREAKDOWN-AUDIT.md section 3): Breakdown reaches
  // Install's data only through src/shared, and the shared layer imports no product.
  {
    files: ["src/breakdown/**", "src/app/t/*/film/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/domain/*", "@/server/*", "@/teach/*", "@/library/*", "@/ingest/*", "@/db", "@/db/*", "@/media/*", "@/install/*", "@/prospect/*"],
              message: "Breakdown imports from @/shared and @/breakdown only.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/breakdown/*", "@/prospect/*", "@/app/*"], message: "The shared layer imports no product." }] }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
