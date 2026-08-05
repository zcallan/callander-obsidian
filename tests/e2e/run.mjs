/**
 * Tier 3: end-to-end against a real Obsidian.
 *
 * One instance is launched for the whole suite — startup is ~10s, so
 * per-file instances would dominate the runtime — and every test gets the
 * same CDP session. Tests must therefore clean up the files they create.
 *
 * Run with `npm run test:e2e`. It needs `npm run build` first, since the
 * plugin installed into the test vault is the built bundle.
 */

import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { launchObsidian } from "./launch.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];

const files = readdirSync(here)
	.filter((f) => f.endsWith(".e2e.mjs"))
	.filter((f) => !only || f.includes(only))
	.sort();

if (files.length === 0) {
	console.error(only ? `No e2e files match "${only}"` : "No e2e files found");
	process.exit(1);
}

console.log("launching Obsidian (this takes ~10s)…");
const session = await launchObsidian();
console.log(`vault: ${session.vaultDir}\n`);

let totalPass = 0;
const allFailures = [];

try {
	for (const file of files) {
		const mod = await import(pathToFileURL(path.join(here, file)).href);
		if (typeof mod.run !== "function") {
			throw new Error(`${file} does not export run()`);
		}
		const { name, pass, failures } = await mod.run(session);
		totalPass += pass;
		const status = failures.length === 0 ? "ok  " : "FAIL";
		console.log(
			`${status} ${name.padEnd(34)} ${String(pass).padStart(4)} passed` +
				(failures.length ? `, ${failures.length} failed` : "")
		);
		for (const f of failures) allFailures.push({ file: name, ...f });
	}
} finally {
	await session.close();
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
