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
			// These Node-side files are linted by eslint.node.config.mjs
			// instead (npm run lint runs both).
			// Test scaffolding runs in Node, never inside Obsidian, so the
			// plugin ruleset doesn't apply — a test runner printing results
			// is not "unnecessary logging to console". tests/entry.ts is
			// still type-checked by tsc, which is what matters there.
			"tests/",
			// Same for the screenshot tooling: Node scripts that drive a real
			// Obsidian from the outside, never code that ships in the plugin.
			"tools/",
			// And the preview harness — a Node script that renders the
			// stylesheet in a browser. Same reasoning as tests/ and tools/.
			"scripts/",
			// Generated: src/styles/base.css plus the compiled *.module.css.
			"styles.css",
			".preview/",
		],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts", "**/*.tsx"],
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
		rules: {
			// Severity only, so the inherited options (args: "none",
			// ignoreRestSiblings) still apply. An unused import shipped in
			// 1.7.1 because this was a warning: `eslint .` exits 0 on
			// warnings, so preflight passed and the plugin review scan was
			// the thing that noticed. Dead code is worth a failed gate.
			"@typescript-eslint/no-unused-vars": "error",
			// The review bot's sentence-case rule, told about this plugin's
			// own names and house style so a warning is always worth
			// reading. An override replaces the recommended options
			// wholesale, hence enforceCamelCaseLower restated. Inline
			// disables are banned by the recommended config, so every
			// exemption lives here.
			"obsidianmd/ui/sentence-case": [
				"warn",
				{
					enforceCamelCaseLower: true,
					ignoreRegex: [
						// Example placeholders: house style is a lowercase
						// "e.g.", and the examples are full of proper nouns.
						"^e\\.g\\. ",
						// …and examples quoted mid-sentence, where "e.g." reads
						// to the rule as the end of one.
						"e\\.g\\. '",
						// Headings and buttons that open with an emoji or a
						// symbol, which the rule counts as the first word.
						"^[^A-Za-z0-9\"'“]",
						"^https?://",
						// An abbreviation, not the end of a sentence.
						"^Approx\\. ",
						// Quoting another label, which keeps its own capitals.
						'"[A-Z+][^"]*"',
						// The established label for opening the real editor.
						"^Edit markdown$",
					],
					// Page and product names, which keep their capitals.
					ignoreWords: [
						"Callander",
						"Dashboard",
						"Events",
						"Calendar",
						"People",
						"Groups",
						"Plans",
						"Somedays",
						"Diary",
						"Settings",
						"Community",
						"Markdown",
						// The rule splits on anything but letters and digits:
						// "B'day" is B + day, and "[[Name]]" is Name.
						"B",
						"Name",
					],
				},
			],
		},
	},
	{
		// execCommand is the only way to edit a textarea that joins its
		// native undo stack; see the comment where it's called.
		files: ["src/ui/sections/NotesSection.tsx"],
		rules: { "@typescript-eslint/no-deprecated": "off" },
	},
]);
