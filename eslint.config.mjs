import obsidianmd from "eslint-plugin-obsidianmd";
import { defineConfig } from "eslint/config";

// Mirrors the Obsidian plugin review bot: obsidianmd/recommended already
// layers typescript-eslint recommendedTypeChecked over **/*.ts.
export default defineConfig([
	// main.js is the esbuild bundle; the .mjs files are Node build scripts
	// that never run inside Obsidian (the review bot doesn't lint them).
	// The vaults contain deployed plugin copies and Obsidian's own config.
	{
		ignores: [
			"main.js",
			"esbuild.config.mjs",
			"version-bump.mjs",
			"vault/",
			"examples/",
		],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
			globals: {
				// Build stamp injected by esbuild's define (globals.d.ts)
				__CALLANDER_BUILD__: "readonly",
			},
		},
	},
]);
