/**
 * Screenshots every Callander view and modal against a seeded throwaway
 * vault, into examples/screenshots/.
 *
 *   npm run screenshots              # the whole set
 *   npm run screenshots -- plan      # only shots whose name contains "plan"
 *   KEEP_VAULT=1 npm run screenshots # leave the temp vault for inspection
 *
 * Isolation matches the e2e suite's: a fresh --user-data-dir plus a vault
 * under mkdtemp, so the real install's vaults and settings are invisible to
 * it and nothing here can reach a real vault.
 *
 * Capture is screencapture(1) against the spawned window's CGWindowID, which
 * gets the native rounded corners, traffic lights and drop shadow. That
 * needs Screen Recording permission for whatever runs this; without it
 * screencapture fails with "could not create image from display" and the
 * run stops with that message.
 *
 * The window has to be frontmost for each shot, so this takes focus while
 * it runs. Don't start it and then go and type somewhere else.
 */

import { spawn, execFileSync, execFile } from "node:child_process";
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	copyFileSync,
	cpSync,
	rmSync,
	existsSync,
	utimesSync,
	readdirSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForTarget, CdpSession } from "../../tests/e2e/cdp.mjs";
import { startFocusGuard } from "../../tests/e2e/focusGuard.mjs";
import { SHOTS, PATHS } from "./shots.mjs";
// Imported rather than repeated: the split-by-name keys in the seeded
// expenses are written against this, so a mismatch silently drops your own
// line from every split.
import { OWNER, PEOPLE } from "./cast.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const OBSIDIAN = "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
const PLUGIN_ID = "callander";
const OUT_DIR = path.join(repo, "examples", "screenshots");

// Sized so the capture lands at 2154x1816, matching the screenshots this
// replaces. A *key* window draws a bigger shadow than an inactive one —
// 224px of margin per axis at 2x — leaving 1930x1592 of window.
const WIDTH = Number(process.env.SHOT_W ?? 965);
const HEIGHT = Number(process.env.SHOT_H ?? 796);
/** Captures come off a Retina display at 2x; these ship at half that. */
const HALF_WIDTH = 1077;

const filter = process.argv[2];
const shots = filter ? SHOTS.filter((s) => s.name.includes(filter)) : SHOTS;
if (shots.length === 0) {
	console.error(`no shots match "${filter}"`);
	process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildVault(vaultDir) {
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

function registerVault(userDataDir, vaultDir) {
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

async function acceptTrustPrompt(cdp) {
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

let cachedWindowId = null;
function windowIdFor(pid) {
	if (cachedWindowId) return cachedWindowId;
	cachedWindowId = execFileSync("swift", [path.join(here, "windowid.swift"), String(pid)], {
		encoding: "utf8",
	}).trim();
	return cachedWindowId;
}

/**
 * Bring the window forward and make it *key*. Two things depend on this:
 * screencapture reads the window off the screen, and `steal: true` is what
 * gets the traffic lights drawn in colour rather than greyed out.
 */
async function raise(cdp) {
	await cdp.evaluate(() => {
		const { remote } = window.require("electron");
		remote.app.focus({ steal: true });
		const win = remote.getCurrentWindow();
		win.moveTop();
		win.focus();
	});
	await sleep(500);
}

function captureWindow(pid, outPath) {
	// No -o: the drop shadow is part of the look.
	execFileSync("screencapture", ["-x", `-l${windowIdFor(pid)}`, "-t", "png", outPath]);
	// The window is captured at 2x on a Retina display. Halving it keeps the
	// screenshots legible at the size they're actually viewed while cutting
	// the files to roughly a quarter — the full set was 20MB before.
	execFileSync("sips", ["--resampleWidth", String(HALF_WIDTH), outPath], { stdio: "ignore" });
}

const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "callander-shots-"));
const vaultDir = path.join(tmpRoot, "vault");
const userDataDir = path.join(tmpRoot, "obsidian-config");
mkdirSync(vaultDir, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

buildVault(vaultDir);
registerVault(userDataDir, vaultDir);

// The event note's filename carries its date, which moves with every reseed.
const eventsDir = path.join(vaultDir, "Friends", "Events");
const dinner = readdirSync(eventsDir).find((f) => f.includes("Dinner at Ferngully"));
const paths = { ...PATHS, event: dinner ? `Friends/Events/${dinner}` : "" };

const port = 9500 + Math.floor(Math.random() * 400);
const stopFocusGuard = startFocusGuard();
const child = spawn(OBSIDIAN, [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`], {
	stdio: "ignore",
	detached: false,
});
console.log(`obsidian pid=${child.pid}  vault=${vaultDir}`);
console.log(`shooting ${shots.length} shot${shots.length === 1 ? "" : "s"} → ${OUT_DIR}\n`);

let cdp;
const results = [];
const dumps = [];
try {
	const target = await waitForTarget(port);
	cdp = await CdpSession.connect(target.webSocketDebuggerUrl);
	await cdp.send("Runtime.enable");

	await cdp.waitFor(() => typeof window.app !== "undefined", {
		timeoutMs: 30000,
		label: "the Obsidian workspace",
	});
	await acceptTrustPrompt(cdp);
	await cdp.waitFor(() => !!window.app.plugins?.plugins?.callander, {
		timeoutMs: 30000,
		label: "the Callander plugin to load",
	});
	await stopFocusGuard();

	await cdp.waitFor(
		() => {
			if (!document.querySelector(".modal-container")) return true;
			window.app.setting?.close?.();
			for (const el of document.querySelectorAll(".modal-close-button")) el.click();
			return !document.querySelector(".modal-container");
		},
		{ timeoutMs: 15000, label: "the settings window to close" }
	);

	await cdp.evaluate(
		(w, h) => {
			const win = window.require("electron").remote.getCurrentWindow();
			win.setSize(w, h);
			win.center();
		},
		WIDTH,
		HEIGHT
	);
	await sleep(500);

	// Expand the tree the originals show expanded.
	await cdp.evaluate(async () => {
		const view = window.app.workspace.getLeavesOfType("file-explorer")[0]?.view;
		for (const p of ["Friends", "Friends/People"]) {
			await view?.fileItems?.[p]?.setCollapsed?.(false);
		}
	});

	for (const shot of shots) {
		// Every shot starts from the same place. Suggesters have no close
		// button and only dismiss on Escape, so clicking close buttons alone
		// left one open — and it then appeared in every later capture.
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
		await sleep(400);

		// Focus *before* setup, not just before the shutter. Chromium throttles
		// requestAnimationFrame in an unfocused window, and Obsidian defers
		// modal rendering to a frame — so a modal opened while the window was
		// in the background did not exist in the DOM until it came forward,
		// which made every modal shot look like it had failed.
		await raise(cdp);

		const problem = await cdp.evaluate(
			async (src, ctx) => {
				try {
					return await eval(`(${src})`)(ctx);
				} catch (err) {
					return `setup threw: ${err?.message ?? String(err)}`;
				}
			},
			shot.setup,
			{ paths }
		);
		if (typeof problem === "string") {
			results.push({ name: shot.name, status: "skipped", detail: problem });
			console.log(`skip ${shot.name.padEnd(20)} ${problem}`);
			continue;
		}

		await sleep(shot.settle ?? 1600);

		// `noScrollReset` is for shots whose setup positions the view itself
		// (scrollIntoView on an element it just expanded) — resetting would
		// undo it.
		if (!shot.noScrollReset) {
			// Always set it otherwise, even to 0: a leaf reused from the
			// previous shot keeps its scroll position, which silently
			// produced three identical plan shots.
			const amount = shot.scroll ?? 0;
			// Applied twice: several views finish rendering asynchronously and
			// move the scroller out from under the first attempt.
			const applyScroll = (amount) => cdp.evaluate((amount, heading) => {
				// The tallest scrollable element inside the active leaf. Views
				// differ in where the scroller sits — some put it on
				// .view-content, others on a child — so find it rather than
				// assume, or the shot silently comes out unscrolled.
				const leaf =
					document.querySelector(".workspace-leaf.mod-active") ??
					document.querySelector(".workspace-leaf");
				if (!leaf) return;
				const scrollers = [...leaf.querySelectorAll("*")].filter(
					(el) => el.scrollHeight > el.clientHeight + 20
				);
				const scroller = scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
				if (!scroller) return;
				if (heading) {
					// Put the named section's heading at the top of the frame.
					// Anchoring to content rather than a pixel offset means the
					// shot survives the seed data changing height.
					const el = [...scroller.querySelectorAll("h1, h2, h3, h4")].find((h) =>
						(h.textContent ?? "").includes(heading)
					);
					if (!el) return;
					const delta =
						el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
					scroller.scrollTop += delta - 16;
					return;
				}
				scroller.scrollTop = amount === "end" ? scroller.scrollHeight : amount;
			}, amount, shot.scrollTo ?? "");

			await applyScroll(amount);
			await sleep(500);
			await applyScroll(amount);
			await sleep(400);
		}

		// What actually ended up on screen — so a modal that never opened, or
		// a scroll that didn't move, is reported rather than quietly shot.
		const state = await cdp.evaluate(() => {
			const leaf = document.querySelector(".workspace-leaf.mod-active");
			const scrollers = [...(leaf?.querySelectorAll("*") ?? [])].filter(
				(el) => el.scrollHeight > el.clientHeight + 20
			);
			const s = scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
			// Suggesters (FuzzySuggestModal and friends) render as .prompt
			// rather than .modal — they're still a modal as far as a shot is
			// concerned, and they're what the friend-picker commands open.
			// The last one in the DOM is the topmost — the one actually on
			// screen if anything did survive the reset.
			const all = document.querySelectorAll(".modal-container .modal, .modal, .prompt");
			const modal = all[all.length - 1];
			// Obsidian always creates a .modal-title, and these modals leave it
			// empty and build their own heading — so take the first candidate
			// that actually has text rather than the first that exists.
			const title = [...(modal?.querySelectorAll(".modal-title, h1, h2, h3, .prompt-input") ?? [])]
				.map((el) => (el.placeholder || el.textContent || "").trim())
				.find((t) => t.length > 0);
			return {
				view: leaf?.querySelector(".workspace-leaf-content")?.getAttribute("data-type") ?? "",
				modal: modal ? (title || "(untitled)") : "",
				scrollTop: s ? Math.round(s.scrollTop) : null,
				scrollMax: s ? Math.round(s.scrollHeight - s.clientHeight) : null,
			};
		});

		await raise(cdp);
		await cdp.evaluate(() => {
			for (const el of document.querySelectorAll(".notice, .notice-container > *")) el.remove();
		});

		const out = path.join(OUT_DIR, `${shot.name}.png`);
		captureWindow(child.pid, out);

		// DUMP_TEXT=path writes what each shot actually has on screen, as
		// text. Useful when writing docs about the screenshots — it beats
		// squinting at 30 PNGs, and it can't drift from what was captured.
		if (process.env.DUMP_TEXT) {
			const text = await cdp.evaluate(() => {
				const all = document.querySelectorAll(".modal-container .modal, .modal, .prompt");
				const target =
					all[all.length - 1] ??
					document.querySelector(".workspace-leaf.mod-active .view-content");
				return (target?.innerText ?? "").slice(0, 4000);
			});
			dumps.push(`\n\n===== ${shot.name} =====\n${text}`);
		}

		const notes = [];
		if (shot.scroll !== undefined && state.scrollTop === 0 && state.scrollMax > 0) {
			notes.push("scroll had no effect");
		}
		if (shot.scroll !== undefined && state.scrollMax === 0) notes.push("nothing to scroll");
		if (shot.name.startsWith("add-") && !state.modal) notes.push("no modal opened");
		results.push({ name: shot.name, status: "ok", state, notes });
		const detail = state.modal
			? `modal "${state.modal}"`
			: `${state.view || "?"} @ ${state.scrollTop}/${state.scrollMax}`;
		console.log(
			`ok   ${shot.name.padEnd(20)} ${detail}${notes.length ? `  ⚠ ${notes.join(", ")}` : ""}`
		);
	}
} catch (err) {
	await stopFocusGuard();
	console.error(`\nFAILED: ${err.message}`);
	process.exitCode = 1;
} finally {
	try {
		cdp?.close();
	} catch {
		/* already gone */
	}
	child.kill("SIGKILL");
	await sleep(400);
	if (process.env.KEEP_VAULT) console.log(`\nkept vault at ${tmpRoot}`);
	else rmSync(tmpRoot, { recursive: true, force: true });
}

const ok = results.filter((r) => r.status === "ok").length;
const skipped = results.filter((r) => r.status === "skipped");
console.log(`\n${ok} captured, ${skipped.length} skipped`);
for (const s of skipped) console.log(`  ${s.name}: ${s.detail}`);

if (process.env.DUMP_TEXT) {
	writeFileSync(process.env.DUMP_TEXT, dumps.join(""));
	console.log(`text dump: ${process.env.DUMP_TEXT}`);
}
