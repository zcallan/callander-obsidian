/**
 * The bundle's real entry point.
 *
 * It re-exports the Obsidian stub alongside the source under test so both
 * end up as *one* inlined copy. That matters: the services do
 * `file instanceof TFile`, and if a test constructed its vault from a
 * separately-imported copy of the stub, every one of those checks would
 * quietly fail against a structurally identical object.
 *
 * Kept as .mjs so it can re-export stub-only symbols without tsc — which
 * type-checks every .ts file against the real obsidian types — rejecting
 * them.
 */

export * from "./entry.ts";
export {
	FakeApp,
	FakeVault,
	FakeMetadataCache,
	FakeFileManager,
	Notice,
	TFile,
	TFolder,
	normalizePath,
	parseYaml,
	stringifyYaml,
} from "obsidian";
