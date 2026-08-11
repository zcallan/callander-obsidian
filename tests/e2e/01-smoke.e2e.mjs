import { createSuite } from "../harness.mjs";

/**
 * The bare minimum a release must clear: the plugin loads into a real
 * Obsidian, registers what it claims to, and doesn't throw on the way up.
 *
 * Tier 1 and 2 can't cover any of this — they never construct a Plugin, so
 * a broken `onload`, a bad manifest or a view registered under the wrong
 * type would sail straight past them.
 */
export async function run({ cdp }) {
	const { eq, ok, result } = createSuite("smoke (real Obsidian)");

	const info = await cdp.evaluate(() => {
		const plugin = window.app.plugins.plugins.callander;
		const manifest = window.app.plugins.manifests.callander;
		return {
			loaded: !!plugin,
			id: manifest?.id,
			version: manifest?.version,
			minAppVersion: manifest?.minAppVersion,
			isDesktopOnly: manifest?.isDesktopOnly,
			// Commands are namespaced by plugin id.
			commands: Object.keys(window.app.commands.commands).filter((c) =>
				c.startsWith("callander:")
			),
			hasSettingsTab: !!plugin?.settings,
			baseFolder: plugin?.settings?.baseFolder,
			services: {
				contact: !!plugin?.contactOperations,
				plan: !!plugin?.planOperations,
				someday: !!plugin?.somedayOperations,
				event: !!plugin?.eventOperations,
				diary: !!plugin?.diaryOperations,
			},
		};
	});

	eq("plugin is loaded", info.loaded, true);
	eq("manifest id", info.id, "callander");
	eq("manifest declares mobile support", info.isDesktopOnly, false);
	ok("manifest has a version", /^\d+\.\d+\.\d+$/.test(info.version ?? ""));
	ok("manifest has a minAppVersion", !!info.minAppVersion);
	eq("settings are loaded", info.hasSettingsTab, true);
	eq("baseFolder default applied", info.baseFolder, "Friends");

	for (const [name, present] of Object.entries(info.services)) {
		eq(`${name}Operations is constructed`, present, true);
	}

	// The commands the plugin advertises must actually be registered — a
	// typo here is invisible until someone opens the command palette.
	for (const id of [
		"callander:open-dashboard",
		"callander:add-friend",
		"callander:add-event",
		"callander:open-somedays",
		"callander:add-someday",
	]) {
		ok(`command registered: ${id}`, info.commands.includes(id));
	}

	// Views must be registered under the exact types the plugin opens. The
	// strings are the literals from src/views/*, not guesses — a mismatch
	// between registration and `setViewState` is invisible until a tab
	// opens blank.
	const views = await cdp.evaluate(() =>
		[
			"callander-dashboard",
			"contact-page-view",
			"callander-view",
			"callander-diary-view",
			"callander-somedays",
		].map((t) => ({
			type: t,
			registered: !!window.app.viewRegistry.viewByType[t],
		}))
	);
	for (const { type, registered } of views) {
		ok(`view type registered: ${type}`, registered);
	}

	return result();
}
