/**
 * Shared setup for anything that launches Obsidian against a seeded
 * throwaway vault and drives it over CDP — `shoot.mjs` (desktop) and
 * `shoot-mobile.mjs` share this rather than each growing their own copy of
 * "how do I stand up a disposable, isolated Obsidian".
 *
 * Isolation matches the e2e suite's: a fresh --user-data-dir plus a vault
 * under mkdtemp, so the real install's vaults and settings are invisible to
 * it and nothing here can reach a real vault.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, copyFileSync, cpSync, existsSync, utimesSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OWNER, PEOPLE } from "./cast.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(here, "..", "..");
export const OBSIDIAN = "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
const PLUGIN_ID = "callander";

/** Builds a throwaway vault at `vaultDir`, seeded from the example cast. */
export function buildVault(vaultDir, { showGettingStarted = false } = {}) {
	const obsidian = path.join(vaultDir, ".obsidian");
	const pluginDir = path.join(obsidian, "plugins", PLUGIN_ID);
	mkdirSync(pluginDir, { recursive: true });

	for (const file of ["main.js", "manifest.json", "styles.css"]) {
		const src = path.join(repo, file);
		if (!existsSync(src)) throw new Error(`${file} missing — run \`npm run build\` first`);
		copyFileSync(src, path.join(pluginDir, file));
	}

	cpSync(path.join(repo, "examples", "example-vault", "Friends"), path.join(vaultDir, "Friends"), {
		recursive: true,
	});

	// The dashboard orders friend chips by file mtime ("most recently
	// interacted with"), shows ten, and a plain copy stamps every file with
	// the same instant. Stagger them in cast order so a rerun photographs
	// the same chips — and so the people with the richest data lead, rather
	// than whoever happens to sort first alphabetically.
	const people = path.join(vaultDir, "Friends", "People");
	const base = Date.now() / 1000 - 3600;
	PEOPLE.forEach((p, i) => {
		const file = path.join(people, `${p.name}.md`);
		if (existsSync(file)) utimesSync(file, base - i * 600, base - i * 600);
	});

	writeFileSync(
		path.join(pluginDir, "data.json"),
		JSON.stringify(
			{
				yourName: OWNER,
				// Ribbon toggles default off; the screenshots show them on.
				ribbonDashboard: true,
				ribbonDiary: true,
				ribbonAddIdea: true,
				ribbonSomedays: true,
				ribbonEvents: true,
				ribbonReminder: true,
				// A fresh vault always starts this checklist unfinished, and
				// it would dominate every dashboard shot with a section none
				// of them are about. Off by default so no dashboard frame
				// ever shows it.
				showGettingStarted,
			},
			null,
			2
		)
	);

	writeFileSync(path.join(obsidian, "community-plugins.json"), JSON.stringify([PLUGIN_ID]));
	writeFileSync(
		path.join(obsidian, "core-plugins.json"),
		JSON.stringify({
			"file-explorer": true,
			"global-search": true,
			switcher: true,
			graph: true,
			backlink: true,
			canvas: true,
			"outgoing-link": true,
			"tag-pane": true,
			properties: true,
			"page-preview": true,
			"daily-notes": true,
			templates: true,
			"note-composer": true,
			"command-palette": true,
			"editor-status": true,
			bookmarks: true,
			outline: true,
			"word-count": true,
			"file-recovery": true,
			bases: true,
		})
	);
	writeFileSync(path.join(obsidian, "appearance.json"), JSON.stringify({ theme: "obsidian" }));
	writeFileSync(path.join(obsidian, "app.json"), JSON.stringify({}));
	writeFileSync(
		path.join(obsidian, "workspace.json"),
		JSON.stringify({
			main: {
				id: "main-split",
				type: "split",
				direction: "vertical",
				children: [
					{
						id: "main-tabs",
						type: "tabs",
						children: [{ id: "main-leaf", type: "leaf", state: { type: "empty", state: {} } }],
					},
				],
			},
			left: {
				id: "left-split",
				type: "split",
				direction: "horizontal",
				width: 200,
				children: [
					{
						id: "left-tabs",
						type: "tabs",
						children: [
							{
								id: "fe-leaf",
								type: "leaf",
								state: {
									type: "file-explorer",
									state: { sortOrder: "alphabetical", autoReveal: false },
								},
							},
						],
					},
				],
			},
			right: {
				id: "right-split",
				type: "split",
				direction: "horizontal",
				width: 300,
				collapsed: true,
				children: [
					{
						id: "right-tabs",
						type: "tabs",
						children: [{ id: "bl-leaf", type: "leaf", state: { type: "backlink", state: {} } }],
					},
				],
			},
			active: "main-leaf",
			lastOpenFiles: [],
		})
	);
}

export function registerVault(userDataDir, vaultDir) {
	mkdirSync(userDataDir, { recursive: true });
	writeFileSync(
		path.join(userDataDir, "obsidian.json"),
		JSON.stringify({
			vaults: {
				[randomBytes(8).toString("hex")]: { path: vaultDir, ts: Date.now(), open: true },
			},
			updateDisabled: true,
		})
	);
}

export async function acceptTrustPrompt(cdp) {
	return cdp.waitFor(
		() => {
			if (window.app.plugins?.plugins?.callander) return "already-loaded";
			if (!/trust the author/i.test(document.body.textContent ?? "")) return false;
			const button = [...document.querySelectorAll(".modal button")].find((b) =>
				/trust author/i.test(b.textContent ?? "")
			);
			if (!button) return false;
			button.click();
			return "clicked";
		},
		{ timeoutMs: 30000, label: "the vault trust prompt" }
	);
}

/** PID → window ID. Per PID: one cached value answered for every later
 * PID too, so a second Obsidian was photographed through the first's. */
const windowIds = new Map();
/** Resolves a PID to the CGWindowID `screencapture -l` wants. */
export function windowIdFor(pid) {
	let id = windowIds.get(pid);
	if (!id) {
		id = execFileSync("swift", [path.join(here, "windowid.swift"), String(pid)], {
			encoding: "utf8",
		}).trim();
		windowIds.set(pid, id);
	}
	return id;
}

/**
 * Bring the window forward and make it *key*. Two things depend on this:
 * screencapture reads the window off the screen, and `steal: true` is what
 * gets the traffic lights drawn in colour rather than greyed out.
 */
export async function raise(cdp) {
	await cdp.evaluate(() => {
		const { remote } = window.require("electron");
		remote.app.focus({ steal: true });
		const win = remote.getCurrentWindow();
		win.moveTop();
		win.focus();
	});
	await new Promise((r) => setTimeout(r, 500));
}

/** Every shot starts from the same place: no modals, no stray tabs. */
export async function resetScreen(cdp) {
	await cdp.evaluate(() => {
		window.app.setting?.close?.();
		for (const el of document.querySelectorAll(".modal-close-button")) el.click();
		for (let i = 0; i < 3; i++) {
			document.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Escape",
					code: "Escape",
					keyCode: 27,
					which: 27,
					bubbles: true,
				})
			);
		}
		// Anything that ignored both still gets taken off the screen.
		for (const el of document.querySelectorAll(".modal-container, .suggestion-container")) {
			el.remove();
		}
		document.body.removeClass?.("modal-open");
		for (const el of document.querySelectorAll(".notice, .notice-container > *")) el.remove();

		// Several commands open their view in a *new* tab, so without this
		// the tab bar grows by one every shot and no capture matches the
		// single-tab look. Detaching them all leaves one empty tab behind.
		const leaves = [];
		window.app.workspace.iterateRootLeaves((l) => leaves.push(l));
		for (const leaf of leaves) leaf.detach();
	});
	await new Promise((r) => setTimeout(r, 400));
}
