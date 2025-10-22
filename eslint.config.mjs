import path from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([{
    ignores: [".next/**/*", ".vercel/**/*", "next-env.d.ts"],
}, {
    extends: compat.extends(
        "next/core-web-vitals",
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
    ),

    plugins: {
        "@typescript-eslint": typescriptEslint,
        "@stylistic": stylistic,
    },

    languageOptions: {
        parser: tsParser,
    },

    settings: {
        "import/resolver": {
            node: {
                extensions: [".js", ".jsx", ".ts", ".tsx"],
            },
        },
    },

    rules: {
        "@typescript-eslint/no-unused-vars": ["error", {
            argsIgnorePattern: "^_",
        }],

        "@typescript-eslint/no-explicit-any": "off",
        "react-hooks/exhaustive-deps": "off",

        "no-console": ["warn", {
            allow: ["warn", "error"],
        }],

        "no-duplicate-imports": "error",
        "prefer-const": "error",
        "@stylistic/indent": "off",
        "@stylistic/quotes": ["error", "double", { "avoidEscape": true }],

        "import/order": ["error", {
            groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
            "newlines-between": "always",

            pathGroups: [
                { pattern: "next-intl", group: "external", position: "after" },
                { pattern: "@/**", group: "internal" },
            ],

            pathGroupsExcludedImportTypes: ["builtin"],

            alphabetize: {
                order: "asc",
                caseInsensitive: true,
            },
        }],

        "no-restricted-imports": ["error", {
            patterns: [{
                group: ["../*"],
                message: "Please use absolute imports instead of relative parent imports",
            }, {
                group: ["./*"],
                message: "Please use absolute imports instead of relative sibling imports",
            }],
        }],
    },
}, {
    // Client component files - prevent server-only imports
    files: [
        "components/**/*.{ts,tsx}",
        "app/**/*.tsx",
    ],
    rules: {
        "no-restricted-imports": ["error", {
            patterns: [{
                group: ["../*"],
                message: "Please use absolute imports instead of relative parent imports",
            }, {
                group: ["./*"],
                message: "Please use absolute imports instead of relative sibling imports",
            }, {
                group: [
                    "@/lib/data/catalog",
                    "@/lib/data/entities",
                    "@/lib/data/connector",
                    "@/lib/data/writer",
                    "@/lib/data/job",
                    "@/lib/hosting/*",
                    "@/lib/util/db-util",
                    "@/lib/supabase/server",
                ],
                message: "Cannot import server-only modules in client components. Fetch data from API endpoints or use server-provided properties instead.",
            }],
        }],
    },
}, {
    // API routes and server components - allow all imports
    files: [
        "app/api/**/*.ts",
        "app/**/route.ts",
        "lib/**/*.ts",
        "middleware.ts",
    ],
    rules: {
        "no-restricted-imports": ["error", {
            patterns: [{
                group: ["../*"],
                message: "Please use absolute imports instead of relative parent imports",
            }, {
                group: ["./*"],
                message: "Please use absolute imports instead of relative sibling imports",
            }],
        }],
    },
}, {
    // Test files - allow all imports
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
        "no-restricted-imports": "off",
    },
}]);