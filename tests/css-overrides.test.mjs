import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSuite } from "./harness.mjs";

/**
 * No declaration in base.css is overridden by a later block with the same
 * selector list in the same @media/@container context. Such a declaration
 * can never win the cascade (same specificity, earlier), so it's dead
 * weight that reads as if it did something — the file grew 23 of them by
 * appending fixes instead of editing the rule. A property repeated inside
 * one block is left alone: that's a deliberate fallback.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function blocksOf(source) {
	const css = source.replace(/\/\*[\s\S]*?\*\//g, (c) => " ".repeat(c.length));
	const blocks = [];
	const context = [];
	let prelude = 0;
	for (let i = 0; i < css.length; i++) {
		const c = css[i];
		if (c === "{") {
			const head = css.slice(prelude, i).trim().replace(/\s+/g, " ");
			if (head.startsWith("@")) {
				context.push(head);
				prelude = i + 1;
				continue;
			}
			const close = css.indexOf("}", i);
			const body = css.slice(i + 1, close);
			const props = [];
			// Split on semicolons outside parentheses (url(), var(), calc()).
			let depth = 0;
			let start = 0;
			for (let j = 0; j <= body.length; j++) {
				const ch = body[j];
				if (ch === "(") depth++;
				else if (ch === ")") depth--;
				else if ((ch === ";" && depth === 0) || j === body.length) {
					const m = /^\s*([-\w]+)\s*:/.exec(body.slice(start, j));
					if (m) props.push(m[1]);
					start = j + 1;
				}
			}
			blocks.push({
				key: [...context, head.split(",").map((s) => s.trim()).join(",")].join(" | "),
				keyframes: context.some((a) => a.startsWith("@keyframes")),
				props,
				line: source.slice(0, i).split("\n").length,
			});
			i = close;
			prelude = i + 1;
		} else if (c === "}") {
			context.pop();
			prelude = i + 1;
		}
	}
	return blocks;
}

export function run() {
	const { eq, result } = createSuite("stylesheet overrides");
	const blocks = blocksOf(readFileSync(path.join(root, "src/styles/base.css"), "utf8"));
	const later = new Map();
	const overridden = [];
	for (let b = blocks.length - 1; b >= 0; b--) {
		const block = blocks[b];
		if (block.keyframes) continue;
		const seen = later.get(block.key) ?? new Set();
		for (const prop of block.props) {
			const once = block.props.filter((p) => p === prop).length === 1;
			if (once && seen.has(prop)) overridden.push(`${block.line}: ${block.key} { ${prop} }`);
		}
		block.props.forEach((p) => seen.add(p));
		later.set(block.key, seen);
	}
	eq("no declaration overridden by a later block with the same selector", overridden, []);
	return result();
}
