// Static code metrics over src/, using the project's own TypeScript install.
// Written for a review of the whole codebase, to re-measure it as the work lands.
//
// Usage (from the repo root):
//   node tools/code-review/metrics.mjs            # summary only
//   node tools/code-review/metrics.mjs out.json   # summary + full detail as JSON
//
// Heuristics, not a linter: "magic numbers" skips 0, 1, -1, 2, 10, 100 and
// SCREAMING_CASE initialisers; "duplicate bodies" compares function bodies after
// stripping comments and whitespace; "dead exports" means never imported
// elsewhere in src/ (tests reach utils through tests/entry.ts export *).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = process.argv[2];
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

const functions = []; // {file,name,line,lines,depth,complexity,params}
const magic = []; // {file,line,value,context}
const counts = {}; // per-file counters
const bodies = new Map(); // normalized body -> [{file,name,line,lines}]
const exportsByFile = new Map(); // file -> [names]
const importsSeen = new Map(); // "file::name" -> count
const relativeImports = [];
const nestedTernaries = [];

const CONTROL = new Set([
	ts.SyntaxKind.IfStatement,
	ts.SyntaxKind.ForStatement,
	ts.SyntaxKind.ForOfStatement,
	ts.SyntaxKind.ForInStatement,
	ts.SyntaxKind.WhileStatement,
	ts.SyntaxKind.DoStatement,
	ts.SyntaxKind.SwitchStatement,
	ts.SyntaxKind.TryStatement,
]);
const BRANCH = new Set([
	ts.SyntaxKind.IfStatement,
	ts.SyntaxKind.ForStatement,
	ts.SyntaxKind.ForOfStatement,
	ts.SyntaxKind.ForInStatement,
	ts.SyntaxKind.WhileStatement,
	ts.SyntaxKind.DoStatement,
	ts.SyntaxKind.CaseClause,
	ts.SyntaxKind.CatchClause,
	ts.SyntaxKind.ConditionalExpression,
]);
const ALLOWED_NUMS = new Set(["0", "1", "-1", "2", "100", "10"]);

function fnName(node, sf) {
	if (node.name && ts.isIdentifier(node.name)) return node.name.text;
	if (node.name) return node.name.getText(sf);
	const p = node.parent;
	if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
	if (p && ts.isPropertyAssignment(p)) return p.name.getText(sf);
	if (p && ts.isPropertyDeclaration(p)) return p.name.getText(sf);
	return "<anon>";
}

function isFn(node) {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isArrowFunction(node) ||
		ts.isFunctionExpression(node) ||
		ts.isConstructorDeclaration(node) ||
		ts.isGetAccessor(node) ||
		ts.isSetAccessor(node)
	);
}

for (const file of files) {
	const text = fs.readFileSync(file, "utf8");
	const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
	const c = (counts[rel(file)] = {
		lines: text.split("\n").length,
		any: 0,
		asUnknownAs: 0,
		nonNull: 0,
		tsIgnore: (text.match(/@ts-(ignore|expect-error|nocheck)/g) || []).length,
		eslintDisable: (text.match(/eslint-disable/g) || []).length,
		consoleCalls: 0,
		setTimeoutCalls: 0,
		innerHTML: (text.match(/\.innerHTML\s*=/g) || []).length,
		classes: 0,
		functions: 0,
		todo: (text.match(/\b(TODO|FIXME|HACK|XXX)\b/g) || []).length,
	});
	const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

	// imports
	for (const st of sf.statements) {
		if (ts.isImportDeclaration(st)) {
			const spec = st.moduleSpecifier.text;
			if (spec.startsWith(".")) relativeImports.push(`${rel(file)}:${lineOf(st)} ${spec}`);
			const clause = st.importClause;
			let target = null;
			if (spec.startsWith("@/")) target = "src/" + spec.slice(2);
			else if (spec.startsWith(".")) target = path.relative(root, path.resolve(path.dirname(file), spec));
			if (target && clause) {
				const names = [];
				if (clause.name) names.push("default");
				if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
					for (const el of clause.namedBindings.elements) names.push((el.propertyName || el.name).text);
				}
				if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) names.push("*");
				for (const n of names) {
					for (const cand of [target, target + ".ts", target + ".tsx", target + "/index.ts", target + "/index.tsx"]) {
						const k = `${cand}::${n}`;
						importsSeen.set(k, (importsSeen.get(k) || 0) + 1);
					}
				}
			}
		}
		if (ts.isExportDeclaration(st) && st.moduleSpecifier) {
			// re-export: count as usage
			const spec = st.moduleSpecifier.text;
			let target = spec.startsWith("@/") ? "src/" + spec.slice(2) : path.relative(root, path.resolve(path.dirname(file), spec));
			if (st.exportClause && ts.isNamedExports(st.exportClause)) {
				for (const el of st.exportClause.elements) {
					for (const cand of [target, target + ".ts", target + ".tsx", target + "/index.ts", target + "/index.tsx"]) {
						const k = `${cand}::${(el.propertyName || el.name).text}`;
						importsSeen.set(k, (importsSeen.get(k) || 0) + 1);
					}
				}
			}
		}
		// exports
		const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) : undefined;
		const exported = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
		if (exported) {
			const isDefault = mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
			const list = exportsByFile.get(rel(file)) || [];
			if (isDefault) list.push("default");
			else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) list.push(d.name.getText(sf));
			else if (st.name) list.push(st.name.text);
			exportsByFile.set(rel(file), list);
		}
	}

	function visit(node, depth, currentFn) {
		if (node.kind === ts.SyntaxKind.AnyKeyword) c.any++;
		if (ts.isAsExpression(node) && ts.isAsExpression(node.expression) && node.expression.type.kind === ts.SyntaxKind.UnknownKeyword) c.asUnknownAs++;
		if (ts.isNonNullExpression(node)) c.nonNull++;
		if (ts.isClassDeclaration(node)) c.classes++;
		if (ts.isCallExpression(node)) {
			const t = node.expression.getText(sf);
			if (/^console\./.test(t)) c.consoleCalls++;
			if (/(^|\.)setTimeout$/.test(t)) c.setTimeoutCalls++;
		}
		if (ts.isConditionalExpression(node) && (ts.isConditionalExpression(node.whenTrue) || ts.isConditionalExpression(node.whenFalse))) {
			nestedTernaries.push(`${rel(file)}:${lineOf(node)}`);
		}
		if (ts.isNumericLiteral(node)) {
			let v = node.text;
			if (node.parent && ts.isPrefixUnaryExpression(node.parent) && node.parent.operator === ts.SyntaxKind.MinusToken) v = "-" + v;
			if (!ALLOWED_NUMS.has(v)) {
				// Skip values that ARE the initializer of a named top-level-ish const (they're already named)
				let p = node.parent;
				while (p && (ts.isPrefixUnaryExpression(p) || ts.isBinaryExpression(p) || ts.isParenthesizedExpression(p))) p = p.parent;
				const namedConst = p && ts.isVariableDeclaration(p) && /^[A-Z0-9_]+$/.test(p.name.getText(sf));
				const inEnumOrType = p && (ts.isEnumMember(p) || ts.isLiteralTypeNode(p));
				if (!namedConst && !inEnumOrType) {
					const lineText = text.split("\n")[lineOf(node) - 1].trim();
					magic.push({ file: rel(file), line: lineOf(node), value: v, context: lineText.slice(0, 140) });
				}
			}
		}
		let d = depth;
		if (CONTROL.has(node.kind)) {
			// else-if chains don't add depth
			const isElseIf = ts.isIfStatement(node) && node.parent && ts.isIfStatement(node.parent) && node.parent.elseStatement === node;
			if (!isElseIf) d = depth + 1;
			if (currentFn) currentFn.depth = Math.max(currentFn.depth, d);
		}
		if (currentFn && BRANCH.has(node.kind)) currentFn.complexity++;
		if (currentFn && ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) currentFn.complexity++;

		if (isFn(node)) {
			c.functions++;
			const start = lineOf(node);
			const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
			const rec = { file: rel(file), name: fnName(node, sf), line: start, lines: end - start + 1, depth: 0, complexity: 1, params: node.parameters.length };
			functions.push(rec);
			if (node.body && rec.lines >= 4) {
				const norm = node.body.getText(sf).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
				const key = norm;
				const arr = bodies.get(key) || [];
				arr.push({ file: rel(file), name: rec.name, line: start, lines: rec.lines });
				bodies.set(key, arr);
			}
			ts.forEachChild(node, (ch) => visit(ch, 0, rec));
			return;
		}
		ts.forEachChild(node, (ch) => visit(ch, d, currentFn));
	}
	visit(sf, 0, null);
}

// dead exports: exported name never imported anywhere in src/ (tests/entry.ts counted separately)
const entryTs = fs.existsSync(path.join(root, "tests/entry.ts")) ? fs.readFileSync(path.join(root, "tests/entry.ts"), "utf8") : "";
const deadExports = [];
for (const [file, names] of exportsByFile) {
	if (file === "src/main.ts") continue;
	const noExt = file.replace(/\.(tsx?)$/, "");
	for (const n of names) {
		const used = [file, noExt, noExt.replace(/\/index$/, "")].some((f) => importsSeen.get(`${f}::${n}`) || importsSeen.get(`${f}::*`));
		if (!used) deadExports.push({ file, name: n, inTestsEntry: new RegExp(`\\b${n}\\b`).test(entryTs) });
	}
}

const dupBodies = [...bodies.values()].filter((a) => a.length > 1 && new Set(a.map((x) => x.file + x.line)).size > 1);

const result = {
	totals: {
		files: files.length,
		functions: functions.length,
		over50Lines: functions.filter((f) => f.lines > 50).length,
		over100Lines: functions.filter((f) => f.lines > 100).length,
		depth4plus: functions.filter((f) => f.depth >= 4).length,
		complexity15plus: functions.filter((f) => f.complexity >= 15).length,
		magicNumbers: magic.length,
		nestedTernaries: nestedTernaries.length,
		relativeImports: relativeImports.length,
		deadExports: deadExports.length,
		dupBodies: dupBodies.length,
	},
	longest: [...functions].sort((a, b) => b.lines - a.lines).slice(0, 60),
	deepest: [...functions].filter((f) => f.depth >= 4).sort((a, b) => b.depth - a.depth || b.lines - a.lines).slice(0, 80),
	mostComplex: [...functions].sort((a, b) => b.complexity - a.complexity).slice(0, 60),
	manyParams: functions.filter((f) => f.params >= 5).sort((a, b) => b.params - a.params),
	magicByValue: Object.entries(magic.reduce((m, x) => ((m[x.value] = (m[x.value] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 60),
	magic,
	nestedTernaries,
	relativeImports,
	deadExports,
	dupBodies,
	counts,
};
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result.totals, null, 1));
