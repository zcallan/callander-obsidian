import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

// The Node side: tests, tools, scripts and the root build scripts. None of
// it ships in the plugin, so the plugin's ruleset (and the review bot's)
// stays in eslint.config.mjs; this is plain `eslint:recommended`, for the
// mistakes a missing lint lets through, like an unused import.
export default defineConfig([
	{ ignores: ["tests/.build/", "node_modules/", "vault/", "examples/", ".preview/"] },
	{
		files: ["*.mjs", "tests/**/*.mjs", "tools/**/*.mjs", "scripts/**/*.mjs"],
		extends: [js.configs.recommended],
		languageOptions: { globals: globals.node },
		// A leading underscore marks a parameter kept to match a signature,
		// as the Obsidian stub does.
		rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
	},
	{
		// Callbacks in these run inside Obsidian's renderer, through
		// cdp.evaluate(), so browser globals are real there too.
		files: ["tests/e2e/**/*.mjs", "tools/screenshots/**/*.mjs", "scripts/**/*.mjs"],
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
	},
	{
		// Tier 1-2 code under test reaches timers through `window`, which
		// the runner aliases to Node's globalThis.
		files: ["tests/vault-refresh.test.mjs"],
		languageOptions: { globals: { window: "writable" } },
	},
]);
