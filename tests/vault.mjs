/**
 * Builds a throwaway in-memory vault wired to the real ContactOperations,
 * so service-layer tests exercise the actual persistence paths — the same
 * `processFrontMatter` / `vault.process` calls the plugin makes in
 * production, against data that only ever lives in this process.
 */

// Both the stub and the code under test come from the same bundle, so
// `instanceof TFile` holds across the boundary. Importing the stub
// directly here would create a second copy and silently break it.
import {
	FakeApp,
	stringifyYaml,
	normalizePath,
	ContactOperations,
	EventOperations,
	EventMigration,
} from "./.build/callander.mjs";

// EventOperations waits on the metadata cache via window timers; Node has
// the same timer functions on globalThis, so alias it once for the bundle.
if (typeof globalThis.window === "undefined") {
	globalThis.window = globalThis;
}

const DEFAULT_SETTINGS = {
	baseFolder: "Friends",
	diaryFolder: "Diary",
	dashboardFileName: "Dashboard",
	yourName: "Callan",
	belatedBirthdayDays: 14,
	birthdayReminderDays: 7,
	receiptTaxPercent: 6.25,
	receiptTipPercent: 20,
	relationshipTypes: ["friend", "family"],
};

/** A stand-in for the plugin object the services reach through. */
class FakePlugin {
	constructor(app, settings) {
		this.app = app;
		this.settings = { ...DEFAULT_SETTINGS, ...settings };
		this.saved = 0;
	}
	async saveSettings() {
		this.saved++;
	}
}

export async function createTestVault(settings = {}) {
	const app = new FakeApp();
	const plugin = new FakePlugin(app, settings);
	const contacts = new ContactOperations(plugin);
	const events = new EventOperations(plugin);
	const migration = new EventMigration(plugin);
	// The services reach each other through the plugin, same as production.
	plugin.contactOperations = contacts;
	plugin.eventOperations = events;
	plugin.refreshDashboards = () => {};

	const base = normalizePath(plugin.settings.baseFolder);
	await app.vault.createFolder(base);
	await app.vault.createFolder(`${base}/People`);
	await app.vault.createFolder(`${base}/Plans`);

	return {
		app,
		plugin,
		contacts,
		events,
		migration,
		vault: app.vault,

		/** Write a person note from plain frontmatter data. */
		async addPerson(name, frontmatter = {}, body = "") {
			const yaml = stringifyYaml({ name, ...frontmatter });
			return app.vault.create(
				`${base}/People/${name}.md`,
				`---\n${yaml.replace(/\n$/, "")}\n---\n${body}`
			);
		},

		/** Raw note contents, for byte-level assertions. */
		read(file) {
			return app.vault.contents.get(file.path);
		},

		/** Frontmatter as currently parsed from disk. */
		frontmatterOf(file) {
			return app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		},

		/** Body after the frontmatter block. */
		bodyOf(file) {
			const content = app.vault.contents.get(file.path) ?? "";
			if (!content.startsWith("---\n")) return content;
			const end = content.indexOf("\n---", 3);
			if (end === -1) return content;
			const after = content.indexOf("\n", end + 1);
			return after === -1 ? "" : content.slice(after + 1);
		},
	};
}
