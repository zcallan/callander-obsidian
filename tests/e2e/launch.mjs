/**
 * Boots a real Obsidian against a throwaway vault, with this plugin
 * installed, and hands back a CDP session pointed at its renderer.
 *
 * Isolation is the whole point, and it comes from two flags:
 *
 *   --user-data-dir  a fresh Obsidian config, so the real install's vault
 *                    list, settings and plugins are invisible to it
 *   the vault path   a directory created under .tmp/ for this run only
 *
 * Nothing here can reach a real vault: the test instance has never been
 * told one exists.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { startFocusGuard } from "./focusGuard.mjs";
import { waitForTarget, CdpSession } from "./cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

const OBSIDIAN = "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
const PLUGIN_ID = "callander";

/** A port unlikely to collide with anything the user has open. */
function pickPort() {
	return 9500 + Math.floor(Math.random() * 400);
}

function buildTestVault(vaultDir) {
	const pluginDir = path.join(vaultDir, ".obsidian", "plugins", PLUGIN_ID);
	mkdirSync(pluginDir, { recursive: true });

	for (const file of ["main.js", "manifest.json", "styles.css"]) {
		const src = path.join(root, file);
		if (!existsSync(src)) {
			throw new Error(
				`${file} missing — run \`npm run build\` before the e2e suite`
			);
		}
		copyFileSync(src, path.join(pluginDir, file));
	}

	// Listing the plugin here is what makes Obsidian load it — but it will
	// still gate community plugins behind the trust prompt, which
	// acceptTrustPrompt() below clicks through.
	writeFileSync(
		path.join(vaultDir, ".obsidian", "community-plugins.json"),
		JSON.stringify([PLUGIN_ID])
	);
	writeFileSync(
		path.join(vaultDir, ".obsidian", "core-plugins.json"),
		JSON.stringify(["file-explorer", "global-search", "switcher"])
	);
}

function registerVault(userDataDir, vaultDir) {
	mkdirSync(userDataDir, { recursive: true });
	// `open: true` is what makes Obsidian skip the vault picker and load
	// straight into it.
	writeFileSync(
		path.join(userDataDir, "obsidian.json"),
		JSON.stringify({
			vaults: {
				[randomBytes(8).toString("hex")]: {
					path: vaultDir,
					ts: Date.now(),
					open: true,
				},
			},
			updateDisabled: true,
		})
	);
}

/**
 * Click through the Restricted Mode gate, if it's up. Matches on the
 * button's own label rather than a positional selector, so a reordered or
 * restyled dialog fails loudly here instead of silently enabling nothing.
 *
 * This is genuinely automated — measured at ~600ms from click to the
 * prompt tearing down, well inside human reaction time. It is visible on
 * screen for about a second on the way past; that flash is expected and
 * needs no input. Acceptance is stored as
 * `localStorage["enable-plugin-<vaultId>"]`, which dies with the temp
 * user-data-dir, so every run starts from the same untrusted state.
 */
async function acceptTrustPrompt(cdp) {
	// Only resolves on a decisive outcome. An earlier version returned as
	// soon as no modal was on screen, which raced the prompt's own render:
	// it reported "nothing to accept" a beat before the prompt appeared,
	// and the plugin then never loaded.
	return cdp.waitFor(
		() => {
			if (window.app.plugins?.plugins?.callander) return "already-loaded";
			const showingTrust = /trust the author/i.test(
				document.body.textContent ?? ""
			);
			if (!showingTrust) return false;
			const button = [...document.querySelectorAll(".modal button")].find(
				(b) => /trust author/i.test(b.textContent ?? "")
			);
			if (!button) return false;
			button.click();
			return "clicked";
		},
		{ timeoutMs: 30000, label: "the vault trust prompt" }
	);
}

/**
 * @returns {Promise<{cdp: CdpSession, vaultDir: string, close: () => Promise<void>}>}
 */
export async function launchObsidian({ keepOpen = false } = {}) {
	if (!existsSync(OBSIDIAN)) {
		throw new Error(`Obsidian not found at ${OBSIDIAN}`);
	}

	const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "callander-e2e-"));
	const vaultDir = path.join(tmpRoot, "vault");
	const userDataDir = path.join(tmpRoot, "obsidian-config");
	mkdirSync(vaultDir, { recursive: true });

	buildTestVault(vaultDir);
	registerVault(userDataDir, vaultDir);

	const port = pickPort();
	// Started before spawn, not after: Electron's own activation happens on
	// its own schedule (measured ~300–600ms post-launch), so the guard has
	// to already be polling when that happens rather than reacting to it.
	// See focusGuard.mjs for what was tried and ruled out before landing on
	// this — there is no way to suppress the activation outright.
	const stopFocusGuard = startFocusGuard();
	const child = spawn(
		OBSIDIAN,
		[`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`],
		{ stdio: "ignore", detached: false }
	);

	let cdp;
	try {
		const target = await waitForTarget(port);
		cdp = await CdpSession.connect(target.webSocketDebuggerUrl);
		await cdp.send("Runtime.enable");

		await cdp.waitFor(() => typeof window.app !== "undefined", {
			timeoutMs: 30000,
			label: "the Obsidian workspace",
		});

		// A vault Obsidian has never seen opens in Restricted Mode behind
		// "Do you trust the author of this vault?" — community plugins stay
		// off until that's answered. Nothing is stored until it is, so
		// there's no config to pre-seed; the button gets clicked instead.
		// This is our own throwaway vault containing only our own plugin.
		await acceptTrustPrompt(cdp);

		await cdp.waitFor(
			() => !!window.app.plugins?.plugins?.callander,
			{ timeoutMs: 30000, label: "the Callander plugin to load" }
		);

		// Electron's one-time startup activation has happened by now (it's
		// long past the ~300–600ms it was measured to fire at) — nothing
		// left here should be able to steal focus, so stop polling.
		await stopFocusGuard();

		// Enabling community plugins leaves the Settings window open on the
		// Community plugins pane. Any test that opens a modal would then
		// find *that* one first, so clear it before handing the session over.
		//
		// The close attempt lives inside the poll deliberately: the window
		// can still be opening when we first look, and a single fire-and-
		// forget click would then close nothing and leave us waiting.
		await cdp.waitFor(
			() => {
				if (!document.querySelector(".modal-container")) return true;
				window.app.setting?.close?.();
				for (const el of document.querySelectorAll(
					".modal-close-button"
				)) {
					el.click();
				}
				return !document.querySelector(".modal-container");
			},
			{ timeoutMs: 15000, label: "the settings window to close" }
		);
	} catch (err) {
		await stopFocusGuard();
		child.kill("SIGKILL");
		if (!keepOpen) rmSync(tmpRoot, { recursive: true, force: true });
		throw err;
	}

	return {
		cdp,
		vaultDir,
		tmpRoot,
		async close() {
			try {
				cdp.close();
			} catch {
				/* already gone */
			}
			child.kill("SIGKILL");
			// Give the process a moment to release the directory.
			await new Promise((r) => setTimeout(r, 300));
			if (!keepOpen) rmSync(tmpRoot, { recursive: true, force: true });
		},
	};
}
