/**
 * Renders the plugin's real stylesheet against fixture markup, in a browser,
 * without Obsidian.
 *
 * This exists because checking a visual change otherwise means building into
 * a vault, switching to Obsidian, and navigating to the thing — and because
 * the alternative (eyeballing CSS and hoping) has shipped real bugs: a
 * "Settled" label that lost its colour to a specificity collision, and a
 * textarea overflowing its modal. Both were obvious on sight and invisible
 * in the diff.
 *
 * Fixtures are plain HTML snippets in scripts/preview/fixtures/. Each one
 * gets a heading and renders in both themes. Adding a component to the
 * harness means adding a file — there's no registry to keep in step.
 *
 * Usage:  npm run preview          build and print the path
 *         npm run preview -- open  build and open it
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const fixturesDir = path.join(here, "preview", "fixtures");
const outDir = path.join(root, ".preview");
const outFile = path.join(outDir, "index.html");

const STYLES = path.join(root, "styles.css");
if (!fs.existsSync(STYLES)) {
	console.error(
		"styles.css not found — it's generated. Run `npm run build` first."
	);
	process.exit(1);
}

/**
 * Enough of Obsidian's theme contract for the plugin's own rules to resolve.
 * Only variables the plugin actually references are worth carrying; anything
 * missing shows up as an unstyled element, which is the honest signal that a
 * rule depends on something this harness doesn't model.
 */
const THEMES = {
	dark: {
		"--text-normal": "#dadada",
		"--text-muted": "#999999",
		"--text-faint": "#666666",
		"--text-accent": "#a48cf0",
		"--text-on-accent": "#ffffff",
		"--background-primary": "#202020",
		"--background-primary-alt": "#1a1a1a",
		"--background-secondary": "#161616",
		"--background-modifier-border": "#333333",
		"--background-modifier-hover": "rgba(255, 255, 255, 0.075)",
		"--interactive-accent": "#7f6df2",
		"--interactive-normal": "#2a2a2a",
		"--color-green": "#5cb870",
		"--color-red": "#e5534b",
		"--font-text": "-apple-system, BlinkMacSystemFont, sans-serif",
	},
	light: {
		"--text-normal": "#222222",
		"--text-muted": "#6e6e6e",
		"--text-faint": "#999999",
		"--text-accent": "#705dcf",
		"--text-on-accent": "#ffffff",
		"--background-primary": "#ffffff",
		"--background-primary-alt": "#f5f6f8",
		"--background-secondary": "#f2f3f5",
		"--background-modifier-border": "#dcddde",
		"--background-modifier-hover": "rgba(0, 0, 0, 0.05)",
		"--interactive-accent": "#7f6df2",
		"--interactive-normal": "#f2f3f5",
		"--color-green": "#2b8a3e",
		"--color-red": "#c92a2a",
		"--font-text": "-apple-system, BlinkMacSystemFont, sans-serif",
	},
};

const vars = (theme) =>
	Object.entries(THEMES[theme])
		.map(([k, v]) => `\t\t\t${k}: ${v};`)
		.join("\n");

const fixtures = fs.existsSync(fixturesDir)
	? fs
			.readdirSync(fixturesDir)
			.filter((f) => f.endsWith(".html"))
			.sort()
	: [];

if (fixtures.length === 0) {
	console.error(`No fixtures in ${path.relative(root, fixturesDir)}`);
	process.exit(1);
}

const panel = (theme) =>
	fixtures
		.map((file) => {
			const html = fs.readFileSync(path.join(fixturesDir, file), "utf8");
			const name = file.replace(/\.html$/, "");
			return `\t\t<section class="fx">
			<h2 class="fx-name">${name}</h2>
			<div class="fx-body">${html}</div>
		</section>`;
		})
		.join("\n");

const page = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Callander preview</title>
<link rel="stylesheet" href="styles.css">
<style>
	/* Harness chrome only — deliberately prefixed so it can't be mistaken
	   for plugin styling, and so it never collides with it. */
	.pv-root { --pv-gap: 24px; }
	.theme-dark {
${vars("dark")}
	}
	.theme-light {
${vars("light")}
	}
	body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
	.pv-panes { display: flex; align-items: stretch; min-height: 100vh; }
	.pv-pane { flex: 1; min-width: 0; padding: 20px;
		background: var(--background-primary); color: var(--text-normal); }
	.pv-pane + .pv-pane { border-left: 1px solid #888; }
	.pv-theme { font: 600 11px/1 sans-serif; letter-spacing: .08em;
		text-transform: uppercase; opacity: .5; margin: 0 0 16px; }
	.fx + .fx { margin-top: var(--pv-gap); padding-top: var(--pv-gap);
		border-top: 1px dashed rgba(128,128,128,.4); }
	.fx-name { font: 600 12px/1 ui-monospace, monospace; opacity: .55;
		margin: 0 0 10px; }
	.pv-narrow .fx-body { max-width: 320px; }
	.pv-bar { position: sticky; top: 0; z-index: 10; display: flex; gap: 12px;
		align-items: center; padding: 8px 14px; background: #111; color: #eee;
		font: 12px/1.4 sans-serif; }
	.pv-bar label { display: flex; gap: 5px; align-items: center; cursor: pointer; }
</style>
</head>
<body class="pv-root">
<div class="pv-bar">
	<strong>Callander preview</strong>
	<label><input type="checkbox" id="narrow"> narrow (320px — phone width)</label>
	<span style="opacity:.55">${fixtures.length} fixture${
		fixtures.length === 1 ? "" : "s"
	}</span>
</div>
<div class="pv-panes">
	<div class="pv-pane theme-dark">
		<p class="pv-theme">dark</p>
${panel("dark")}
	</div>
	<div class="pv-pane theme-light">
		<p class="pv-theme">light</p>
${panel("light")}
	</div>
</div>
<script>
	// Phone width is where the layout bugs live — overflowing inputs,
	// unbreakable words shoving content off the row.
	document.getElementById("narrow").addEventListener("change", (e) => {
		document.querySelectorAll(".pv-pane").forEach((p) =>
			p.classList.toggle("pv-narrow", e.target.checked)
		);
	});
</script>
</body>
</html>
`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, page);
// Copied rather than linked: the harness must load the same bytes the plugin
// ships, and a relative link out of .preview/ would be fragile.
fs.copyFileSync(STYLES, path.join(outDir, "styles.css"));

console.log(`preview → ${outFile}`);
console.log(`  ${fixtures.length} fixture(s): ${fixtures.join(", ")}`);

if (process.argv.includes("open")) {
	execFile("open", [outFile], (err) => {
		if (err) console.error("couldn't open automatically:", err.message);
	});
}
