// Layer-dependency and import-cycle check over src/ (type-only imports flagged).
// Written for a review of the whole codebase, to re-measure it as the work lands.
//
// Usage (from the repo root): node tools/code-review/layers.mjs
// Intended direction: views -> ui -> modals -> components -> services -> utils -> types -> constants.
// (ui sections open modals, and modals are built from components.)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");

function walk(dir, acc = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, acc);
		else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) acc.push(p);
	}
	return acc;
}
const files = walk(path.join(root, "src"));
const rel = (p) => path.relative(root, p);
const exists = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
function resolve(from, spec) {
	let base;
	if (spec.startsWith("@/")) base = path.join(root, "src", spec.slice(2));
	else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
	else return null;
	for (const c of [base, base + ".ts", base + ".tsx", path.join(base, "index.ts"), path.join(base, "index.tsx")]) if (exists(c)) return c;
	return null;
}
const layerOf = (f) => {
	const r = rel(f);
	if (r === "src/main.ts") return "main";
	if (r === "src/types.ts" || r.startsWith("src/types/")) return "types";
	if (r === "src/constants.ts") return "constants";
	const m = r.match(/^src\/([^/]+)\//);
	return m ? m[1] : "other";
};
// Allowed direction (higher may import lower). Rank: lower number = lower layer.
const rank = { constants: 0, types: 1, utils: 2, services: 3, components: 4, modals: 5, ui: 6, views: 7, main: 8 };

const edges = []; // {from,to,typeOnly}
for (const f of files) {
	const sf = ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
	const visit = (node) => {
		if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
			const to = resolve(f, node.moduleSpecifier.text);
			if (to) {
				let typeOnly = false;
				if (ts.isImportDeclaration(node)) {
					const c = node.importClause;
					typeOnly = !!c && (c.isTypeOnly || (!c.name && c.namedBindings && ts.isNamedImports(c.namedBindings) && c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly)));
				} else typeOnly = node.isTypeOnly;
				edges.push({ from: f, to, typeOnly });
			}
		}
		if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
			const to = resolve(f, node.argument.literal.text);
			if (to) edges.push({ from: f, to, typeOnly: true, inline: true });
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
}

console.log("=== Layer matrix (from → to : count [type-only]) ===");
const matrix = {};
for (const e of edges) {
	const k = `${layerOf(e.from)} → ${layerOf(e.to)}`;
	matrix[k] = matrix[k] || { n: 0, t: 0 };
	matrix[k].n++;
	if (e.typeOnly) matrix[k].t++;
}
for (const [k, v] of Object.entries(matrix).sort()) console.log(`${k.padEnd(26)} ${v.n}${v.t ? ` [${v.t} type-only]` : ""}`);

console.log("\n=== Upward / sideways imports (lower layer importing a higher one) ===");
for (const e of edges) {
	const a = layerOf(e.from), b = layerOf(e.to);
	if (a === b) continue;
	if ((rank[a] ?? 9) < (rank[b] ?? 9)) {
		console.log(`${a} → ${b}${e.typeOnly ? " (type)" : ""}${e.inline ? " (inline import())" : ""}: ${rel(e.from)} → ${rel(e.to)}`);
	}
}

// Cycles (runtime edges only), via Tarjan SCC
const graph = new Map();
for (const f of files) graph.set(f, []);
for (const e of edges) if (!e.typeOnly) graph.get(e.from).push(e.to);
let idx = 0; const stack = []; const on = new Set(); const ix = new Map(); const low = new Map(); const sccs = [];
function strong(v) {
	ix.set(v, idx); low.set(v, idx); idx++; stack.push(v); on.add(v);
	for (const w of graph.get(v) || []) {
		if (!ix.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
		else if (on.has(w)) low.set(v, Math.min(low.get(v), ix.get(w)));
	}
	if (low.get(v) === ix.get(v)) { const c = []; let w; do { w = stack.pop(); on.delete(w); c.push(w); } while (w !== v); if (c.length > 1) sccs.push(c); }
}
for (const f of files) if (!ix.has(f)) strong(f);
console.log("\n=== Runtime import cycles (strongly connected components) ===");
for (const c of sccs) console.log(`- ${c.length} files: ${c.map(rel).join(", ")}`);

// Fan-in: most-imported modules; fan-out: files importing the most
const fanIn = new Map();
for (const e of edges) fanIn.set(e.to, (fanIn.get(e.to) || 0) + 1);
console.log("\n=== Most depended-on modules ===");
for (const [f, n] of [...fanIn].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(String(n).padStart(4), rel(f));
