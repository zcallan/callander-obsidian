/**
 * Discovers and runs every `*.test.mjs` in this folder, rebuilding the
 * bundle first so tests always reflect the current source.
 *
 * Exits non-zero on any failure, so `npm test` is usable as a release gate.
 */

import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { buildTestBundle } from "./build.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const only = process.argv[2];

await buildTestBundle();

const files = readdirSync(here)
	.filter((f) => f.endsWith(".test.mjs"))
	.filter((f) => !only || f.includes(only))
	.sort();

if (files.length === 0) {
	console.error(only ? `No test files match "${only}"` : "No test files found");
	process.exit(1);
}

let totalPass = 0;
const allFailures = [];

for (const file of files) {
	const mod = await import(pathToFileURL(path.join(here, file)).href);
	if (typeof mod.run !== "function") {
		console.error(`${file} does not export run()`);
		process.exit(1);
	}
	const { name, pass, failures } = await mod.run();
	totalPass += pass;
	const status = failures.length === 0 ? "ok  " : "FAIL";
	console.log(
		`${status} ${name.padEnd(34)} ${String(pass).padStart(4)} passed` +
			(failures.length ? `, ${failures.length} failed` : "")
	);
	for (const f of failures) allFailures.push({ file: name, ...f });
}

if (allFailures.length > 0) {
	console.log("");
	for (const { file, label, detail } of allFailures) {
		console.log(`FAIL ${file} › ${label}`);
		if (detail) console.log(detail);
	}
}

console.log(
	`\n${totalPass} passed, ${allFailures.length} failed ` +
		`across ${files.length} file${files.length === 1 ? "" : "s"}`
);
process.exit(allFailures.length > 0 ? 1 : 0);
