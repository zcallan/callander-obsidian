/**
 * Discovers and runs every `*.test.mjs` in this folder, rebuilding the
 * bundle first so tests always reflect the current source.
 *
 * Exits non-zero on any failure, so `npm test` is usable as a release gate.
 * A file that throws, or never finishes, is reported as a failure of its
 * own and the files after it still run.
 */

import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { buildTestBundle } from "./build.mjs";
import { late } from "./harness.mjs";

// The zone the suite has always run in, unless one is given (CI pins the
// same one), so a run anywhere agrees about which day it is.
process.env.TZ ??= "America/New_York";

// The code under test schedules through window timers, as Obsidian code
// does; Node has the same functions on globalThis.
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;

/** Far beyond the slowest file (about a second), so only a hang reaches it. */
const FILE_TIMEOUT_MS = 30_000;

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

const indent = (text) => text.replace(/^/gm, "  ");

/**
 * One file's results. A throw, or a run() that never settles, becomes a
 * failure named after the file: a promise nothing resolves would otherwise
 * end Node mid-run with no output at all, not even the summary.
 */
async function runFile(file) {
	let timer;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`didn't finish within ${FILE_TIMEOUT_MS / 1000}s`)),
			FILE_TIMEOUT_MS
		);
	});
	try {
		const mod = await import(pathToFileURL(path.join(here, file)).href);
		if (typeof mod.run !== "function") {
			throw new Error(`${file} does not export run()`);
		}
		return await Promise.race([mod.run(), timeout]);
	} catch (error) {
		return {
			name: file,
			pass: 0,
			failures: [
				{
					label: "the file itself failed",
					detail: indent(error?.stack ?? String(error)),
				},
			],
		};
	} finally {
		clearTimeout(timer);
	}
}

let totalPass = 0;
const allFailures = [];

for (const file of files) {
	const { name, pass, failures } = await runFile(file);
	totalPass += pass;
	const status = failures.length === 0 ? "ok  " : "FAIL";
	console.log(
		`${status} ${name.padEnd(34)} ${String(pass).padStart(4)} passed` +
			(failures.length ? `, ${failures.length} failed` : "")
	);
	for (const f of failures) allFailures.push({ file: name, ...f });
}

for (const { file, label } of late) {
	allFailures.push({
		file,
		label,
		detail: "  asserted after result() was taken: a missing await?",
	});
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
