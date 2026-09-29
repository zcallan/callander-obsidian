// Checks that every icon name in src/ renders in the Obsidian installed here.
//
// setIcon() with a name Obsidian doesn't ship renders nothing and says
// nothing (CLAUDE.md "Icons"). Obsidian's own getIconIds() can't settle it from
// the developer console: the `obsidian` module is handed only to plugin code
// (a private require passed into each plugin's wrapper), so neither
// getIconIds nor require("obsidian") exists there. And its answer is the
// wrong shape anyway: it lists Lucide icons as "lucide-<name>", while
// getIcon() also takes bare names, Obsidian's own icons, and a table of
// aliases ("trash" is Lucide's "trash-2", "pencil" is "edit-3").
//
// So this reads the tables getIcon() consults straight out of each installed
// app bundle and applies getIcon()'s lookup order to every name src/ passes
// where an icon goes, found through the type checker: arguments to any
// parameter named like `icon` or typed `IconName` (Obsidian's setIcon,
// addRibbonIcon and setIcon methods, and Callander's own helpers), `icon`
// properties, `getIcon()` returns, `<Icon name>`, and consts named like
// `icon`. A string that isn't kebab-case (an emoji "icon") isn't checked.
//
// Usage (from the repo root):
//   node tools/check-icons.mjs                 # every installed Obsidian
//   node tools/check-icons.mjs --list          # also print each name found
//   node tools/check-icons.mjs --asar <path>   # a specific app bundle
//   node tools/check-icons.mjs receipt wallet  # also try names before using them
//
// Exits 1 if a name doesn't resolve in some bundle, 2 if none can be read.
// Versions older than the ones installed here (back to minAppVersion) aren't
// covered: Obsidian's Lucide grows over time, so a very new icon can still be
// missing on an older install.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");

const args = process.argv.slice(2);
const listAll = args.includes("--list");
const asarArgs = args.flatMap((a, i) => (a === "--asar" && args[i + 1] ? [args[i + 1]] : []));
/** Names given on the command line, to try before using one. */
const tryNames = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--asar");

// ── Obsidian's side ─────────────────────────────────────────────────────

/** Obsidian keeps each downloaded update beside its settings, as obsidian-<version>.asar. */
function installedBundles() {
	const dirs = [
		path.join(os.homedir(), "Library", "Application Support", "obsidian"),
		path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "obsidian"),
		path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "obsidian"),
	];
	const found = [];
	for (const dir of dirs) {
		if (!fs.existsSync(dir)) continue;
		for (const name of fs.readdirSync(dir)) {
			if (/^obsidian-\d+\.\d+\.\d+\.asar$/.test(name)) found.push(path.join(dir, name));
		}
	}
	return found;
}

/** One file out of an asar archive: a pickled JSON header, then the files' bytes. */
function readFromAsar(asarPath, file) {
	const data = fs.readFileSync(asarPath);
	const headerSize = data.readUInt32LE(4);
	const jsonSize = data.readUInt32LE(12);
	const header = JSON.parse(data.subarray(16, 16 + jsonSize).toString("utf8"));
	const entry = header.files?.[file];
	if (!entry || entry.offset === undefined) return null;
	const start = 8 + headerSize + Number(entry.offset);
	return data.subarray(start, start + entry.size).toString("utf8");
}

/** The source text of a string literal starting at `i`, and where it ends. */
function skipString(src, i) {
	const quote = src[i];
	let j = i + 1;
	while (j < src.length && src[j] !== quote) j += src[j] === "\\" ? 2 : 1;
	return j + 1;
}

/**
 * The top-level keys (and, where a value is a plain string, the value) of the
 * object literal assigned to `name`. A scanner rather than eval: this is the
 * app's own minified code, and only the keys are needed.
 */
function objectEntries(src, name) {
	const m = new RegExp(`(?:\\b(?:const|var|let) |,)${name}=\\{`).exec(src);
	if (!m) return null;
	const entries = new Map();
	let i = m.index + m[0].length;
	while (i < src.length && src[i] !== "}") {
		let key;
		if (src[i] === '"' || src[i] === "'") {
			const end = skipString(src, i);
			key = src.slice(i + 1, end - 1);
			i = end;
		} else {
			const id = /^[\w$]+/.exec(src.slice(i, i + 200));
			if (!id) return null;
			key = id[0];
			i += key.length;
		}
		if (src[i] !== ":") return null;
		i++;
		// Skip the value, noting it if it's a lone string.
		const valueStart = i;
		let depth = 0;
		while (i < src.length) {
			const c = src[i];
			if (c === '"' || c === "'" || c === "`") i = skipString(src, i);
			else if (c === "{" || c === "[" || c === "(") (depth++, i++);
			else if (c === "}" || c === "]" || c === ")") {
				if (depth === 0) break;
				depth--;
				i++;
			} else if (c === "," && depth === 0) break;
			else i++;
		}
		const raw = src.slice(valueStart, i);
		entries.set(key, /^"[^"\\]*"$/.test(raw) ? raw.slice(1, -1) : null);
		if (src[i] === ",") i++;
	}
	return entries;
}

/**
 * getIcon()'s lookup, as the bundle defines it: a "lucide-" prefix goes
 * straight to Lucide; otherwise icons added with addIcon(), then Obsidian's
 * own, then the alias table, then Lucide by bare name. Returns null when the
 * bundle's code has changed shape, so the check fails loudly rather than
 * passing on an empty table.
 */
function iconResolver(appJs) {
	const ids = /function [\w$]+\(\)\{return\[\]\.concat\(Object\.keys\(([\w$]+)\)\.map\(\(function\(([\w$]+)\)\{return"lucide-"\+\2\}\)\)\)\.concat\(Object\.keys\(([\w$]+)\)\)\.concat\(Object\.keys\(([\w$]+)\)\)\}/.exec(appJs);
	if (!ids) return null;
	const [, lucideName, , , builtinName] = ids;
	const alias = new RegExp(`\\(([\\w$]+)\\.hasOwnProperty\\(([\\w$]+)\\)&&\\(\\2=\\1\\[\\2\\]\\),${lucideName.replace(/\$/g, "\\$")}\\.hasOwnProperty\\(\\2\\)`).exec(appJs);
	if (!alias) return null;
	const lucide = objectEntries(appJs, lucideName);
	const builtin = objectEntries(appJs, builtinName);
	const aliases = objectEntries(appJs, alias[1]);
	if (!lucide?.size || !builtin?.size || !aliases?.size) return null;
	return {
		sizes: `${lucide.size} Lucide, ${builtin.size} Obsidian, ${aliases.size} aliases`,
		resolves(name) {
			if (name.startsWith("lucide-")) return lucide.has(name.slice("lucide-".length));
			if (builtin.has(name)) return true;
			return lucide.has(aliases.get(name) ?? name);
		},
	};
}

// ── Callander's side ────────────────────────────────────────────────────

const ICON_NAME = /icon/i;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function iconNamesInSource() {
	const config = ts.getParsedCommandLineOfConfigFile(path.join(root, "tsconfig.json"), {}, {
		...ts.sys,
		onUnRecoverableConfigFileDiagnostic: (d) => {
			throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
		},
	});
	const program = ts.createProgram({ rootNames: config.fileNames, options: { ...config.options, noEmit: true } });
	const checker = program.getTypeChecker();
	// The compiler reports paths with forward slashes on every platform.
	const srcPrefix = path.join(root, "src").split(path.sep).join("/") + "/";
	/** name → the set of places it's written */
	const found = new Map();

	function record(name, node) {
		if (!KEBAB.test(name)) return;
		const sf = node.getSourceFile();
		const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
		const where = `${path.relative(root, sf.fileName)}:${line + 1}`;
		if (!found.has(name)) found.set(name, new Set());
		found.get(name).add(where);
	}

	/** Every string an icon-position expression can evaluate to. */
	function collect(expr, seen = new Set()) {
		if (!expr || seen.has(expr)) return;
		seen.add(expr);
		if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return record(expr.text, expr);
		if (ts.isConditionalExpression(expr)) return (collect(expr.whenTrue, seen), collect(expr.whenFalse, seen));
		if (ts.isBinaryExpression(expr)) {
			const op = expr.operatorToken.kind;
			if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
				collect(expr.left, seen);
				collect(expr.right, seen);
			} else if (op === ts.SyntaxKind.AmpersandAmpersandToken) collect(expr.right, seen);
			return;
		}
		if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isSatisfiesExpression?.(expr) || ts.isNonNullExpression(expr)) {
			return collect(expr.expression, seen);
		}
		if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return collectReturns(expr.body, seen);
		if (ts.isIdentifier(expr)) {
			// A const holding the name, wherever it's declared (through an
			// import, too).
			let symbol = checker.getSymbolAtLocation(expr);
			if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
			const decl = symbol?.valueDeclaration;
			if (decl && ts.isVariableDeclaration(decl) && decl.initializer && ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const) {
				collect(decl.initializer, seen);
			}
		}
	}

	/** What a function body (or an arrow's expression body) returns. */
	function collectReturns(body, seen = new Set()) {
		if (!body) return;
		if (!ts.isBlock(body)) return collect(body, seen);
		const walk = (n) => {
			if (ts.isReturnStatement(n)) collect(n.expression, seen);
			else if (!ts.isFunctionLike(n)) ts.forEachChild(n, walk);
		};
		ts.forEachChild(body, walk);
	}

	function paramIsIcon(param) {
		if (!param) return false;
		const name = ts.isIdentifier(param.name) ? param.name.text : "";
		return ICON_NAME.test(name) || (param.type !== undefined && /\bIconName\b/.test(param.type.getText()));
	}

	function visit(node) {
		if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
			const decl = checker.getResolvedSignature(node)?.getDeclaration();
			const params = decl?.parameters ?? [];
			(node.arguments ?? []).forEach((arg, i) => {
				const param = params[Math.min(i, params.length - 1)];
				if (param && (i < params.length || param.dotDotDotToken) && paramIsIcon(param)) collect(arg);
			});
		} else if (ts.isPropertyAssignment(node) && ICON_NAME.test(node.name.getText())) {
			collect(node.initializer);
		} else if ((ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) && ts.isIdentifier(node.name) && ICON_NAME.test(node.name.text) && node.initializer) {
			collect(node.initializer);
		} else if (ts.isParameter(node) && node.initializer && paramIsIcon(node)) {
			collect(node.initializer);
		} else if (ts.isJsxAttribute(node)) {
			const attr = node.name.getText();
			const tag = node.parent.parent.tagName?.getText();
			const init = node.initializer;
			const value = init && ts.isJsxExpression(init) ? init.expression : init;
			if (ICON_NAME.test(attr) || (tag === "Icon" && attr === "name")) collect(value);
		} else if ((ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isGetAccessorDeclaration(node)) && node.name && ICON_NAME.test(node.name.getText())) {
			collectReturns(node.body);
		}
		ts.forEachChild(node, visit);
	}

	for (const sf of program.getSourceFiles()) {
		if (sf.fileName.startsWith(srcPrefix)) visit(sf);
	}
	return found;
}

// ── Report ──────────────────────────────────────────────────────────────

const bundles = asarArgs.length ? asarArgs : installedBundles();
const resolvers = [];
for (const asar of bundles) {
	const appJs = fs.existsSync(asar) ? readFromAsar(asar, "app.js") : null;
	const resolver = appJs && iconResolver(appJs);
	if (resolver) resolvers.push({ asar, ...resolver });
	else console.error(`Couldn't read the icon tables in ${asar}. Obsidian's bundle may have changed shape; check this script's patterns.`);
}
if (!resolvers.length) {
	console.error("No Obsidian app bundle to check against. Pass one with --asar <path to obsidian-<version>.asar>.");
	process.exit(2);
}

const names = iconNamesInSource();
for (const n of tryNames) {
	if (!names.has(n)) names.set(n, new Set());
	names.get(n).add("(named on the command line)");
}
let failed = false;
for (const { asar, sizes, resolves } of resolvers) {
	const missing = [...names.keys()].filter((n) => !resolves(n)).sort();
	console.log(`${path.basename(asar)} (${sizes}): ${missing.length ? `${missing.length} of ${names.size} names don't render` : `all ${names.size} names render`}`);
	for (const n of missing) console.log(`  ✗ ${n}  ${[...names.get(n)].join(", ")}`);
	if (missing.length) failed = true;
}
if (listAll) {
	for (const n of [...names.keys()].sort()) console.log(`${n}  ${[...names.get(n)].join(", ")}`);
}
process.exit(failed ? 1 : 0);
