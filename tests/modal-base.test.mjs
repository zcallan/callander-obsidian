import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSuite } from "./harness.mjs";

/**
 * Every modal carries CallanderModal's marker classes, which base.css's
 * modal rules and the iOS keyboard handling key on. A modal that extends
 * Obsidian's Modal directly goes without both, silently: it still opens and
 * looks right on a desktop, and only a phone shows the difference.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sourcesUnder(dir) {
	return readdirSync(dir).flatMap((name) => {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) return sourcesUnder(full);
		return /\.tsx?$/.test(name) ? [full] : [];
	});
}

export function run() {
	const { eq, result } = createSuite("modal base");
	const direct = [];
	const unmarked = [];
	for (const file of sourcesUnder(path.join(root, "src"))) {
		const text = readFileSync(file, "utf8");
		const rel = path.relative(root, file);
		const classes = [
			...text.matchAll(
				/class\s+(\w+)(?:<[^{]*?>)?\s+extends\s+(Modal|SuggestModal|FuzzySuggestModal)\b/g
			),
		];
		for (const m of classes) {
			const [, name, base] = m;
			if (base === "Modal") {
				if (name !== "CallanderModal") direct.push(`${rel}: ${name}`);
				continue;
			}
			// Its own body, up to the next top-level class.
			const rest = text.slice(m.index + m[0].length);
			const next = rest.search(/\n(export )?class /);
			const body = next === -1 ? rest : rest.slice(0, next);
			if (!body.includes("markCallanderSuggester(this)")) {
				unmarked.push(`${rel}: ${name}`);
			}
		}
	}
	eq("no modal extends Obsidian's Modal but CallanderModal", direct, []);
	eq("every suggester is marked with markCallanderSuggester", unmarked, []);
	return result();
}
