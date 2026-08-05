/**
 * Bundles the TypeScript under test into one ESM file Node can import,
 * with `obsidian` aliased to the in-memory stub.
 *
 * Everything the tests touch is re-exported from a single entry, so a test
 * file has exactly one import path to remember and there's no per-module
 * bundling to keep in sync.
 */

import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

export const BUNDLE = path.join(here, ".build", "callander.mjs");

export async function buildTestBundle() {
	await esbuild.build({
		entryPoints: [path.join(here, "entry.mjs")],
		bundle: true,
		format: "esm",
		platform: "node",
		target: "node18",
		outfile: BUNDLE,
		absWorkingDir: root,
		alias: {
			"@": path.join(root, "src"),
			obsidian: path.join(here, "stubs", "obsidian.mjs"),
		},
		// `yaml` is a real dependency of the stub — leave it to Node rather
		// than inlining a copy into the bundle.
		external: ["yaml"],
		logLevel: "warning",
	});
	return BUNDLE;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	await buildTestBundle();
	console.log(`built ${path.relative(root, BUNDLE)}`);
}
