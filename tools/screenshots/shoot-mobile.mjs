/**
 * Screenshots five Callander pages in Obsidian's mobile emulation mode, at
 * a phone's 9:16, into examples/screenshots/mobile/.
 *
 *   npm run screenshots:mobile
 *
 * Shares its throwaway-vault setup with `shoot.mjs` (see `harness.mjs`),
 * but captures over CDP's own `Page.captureScreenshot` rather than the
 * native `screencapture(1)` — a phone screenshot has no traffic lights or
 * drop shadow to preserve, and CDP hands back exactly the page's own
 * pixels at whatever size the window is set to.
 *
 * `app.emulateMobile(true)` is Obsidian's own dev-facing toggle (also
 * reachable by hand as `app.emulateMobile(true)` in the console) — it
 * reloads the window with `.is-mobile` applied, the same class real device
 * builds set. What it does *not* do reliably under Electron's own
 * `BrowserWindow.setSize`: Obsidian picks tablet vs. phone (`.is-tablet`
 * vs. `.is-phone`) from a `matchMedia` listener set up once at that reload,
 * and a resize driven by `setSize` doesn't reliably fire the change event
 * that listener depends on — so the window ends up sized like a phone but
 * still classed like a tablet. `forcePhoneClass` below corrects the class
 * to match the media query's own (correct) verdict at that size, which is
 * the only thing narrow-width CSS here keys off.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { waitForTarget, CdpSession } from "../../tests/e2e/cdp.mjs";
import { startFocusGuard } from "../../tests/e2e/focusGuard.mjs";
import { SHOTS, PATHS } from "./shots.mjs";
import { repo, OBSIDIAN, buildVault, registerVault, acceptTrustPrompt, raise } from "./harness.mjs";

const OUT_DIR = path.join(repo, "examples", "screenshots", "mobile");

// A real device's point size (iPhone 6/7/8 Plus), landing exactly on 9:16.
const WIDTH = Number(process.env.SHOT_W ?? 414);
const HEIGHT = Number(process.env.SHOT_H ?? 736);

// The five pages asked for, reusing shoot.mjs's own shot list (and so its
// setup) rather than keeping a second, driftable copy of how to reach each
// one. Renamed on the way out — "-1" only distinguishes desktop shots of
// the same page from each other.
const WANTED = {
	"dashboard-1": "dashboard",
	"events-1": "events",
	"calendar-1": "calendar",
	"plan-1": "plan",
	"person-1": "friend",
};
const shots = SHOTS.filter((s) => WANTED[s.name]);
if (shots.length !== Object.keys(WANTED).length) {
	const missing = Object.keys(WANTED).filter((n) => !shots.some((s) => s.name === n));
	console.error(`shots.mjs is missing: ${missing.join(", ")}`);
	process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "callander-shots-mobile-"));
const vaultDir = path.join(tmpRoot, "vault");
const userDataDir = path.join(tmpRoot, "obsidian-config");
mkdirSync(vaultDir, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

buildVault(vaultDir);
registerVault(userDataDir, vaultDir);

const port = 9900 + Math.floor(Math.random() * 400);
const stopFocusGuard = startFocusGuard();
const child = spawn(OBSIDIAN, [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`], {
	stdio: "ignore",
	detached: false,
});
console.log(`obsidian pid=${child.pid}  vault=${vaultDir}`);
console.log(`shooting ${shots.length} mobile shot${shots.length === 1 ? "" : "s"} → ${OUT_DIR}\n`);

let cdp;
const results = [];
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

	// Reloads the window with .is-mobile applied — everything after this
	// re-waits for the workspace exactly as the initial launch did.
	await cdp.evaluate(() => window.app.emulateMobile(true));
	await cdp.waitFor(() => typeof window.app !== "undefined" && document.body.hasClass("is-mobile"), {
		timeoutMs: 30000,
		label: "the mobile reload",
	});
	await cdp.waitFor(() => !!window.app.plugins?.plugins?.callander, {
		timeoutMs: 30000,
		label: "the Callander plugin to reload",
	});

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

	// See the file header: corrects .is-tablet/.is-phone to match what the
	// window's own actual size means, which Obsidian's resize listener
	// doesn't reliably do under a programmatic Electron resize.
	await cdp.evaluate(() => {
		const phone = !window.matchMedia("(min-width: 600px) and (min-height: 600px)").matches;
		document.body.toggleClass("is-phone", phone);
		document.body.toggleClass("is-tablet", !phone);
	});

	for (const shot of shots) {
		await cdp.evaluate(() => {
			window.app.setting?.close?.();
			for (const el of document.querySelectorAll(".modal-close-button")) el.click();
			for (const el of document.querySelectorAll(".modal-container, .suggestion-container")) {
				el.remove();
			}
			document.body.removeClass?.("modal-open");
			for (const el of document.querySelectorAll(".notice, .notice-container > *")) el.remove();
			const leaves = [];
			window.app.workspace.iterateRootLeaves((l) => leaves.push(l));
			for (const leaf of leaves) leaf.detach();
		});
		await sleep(400);

		// Focus before setup, not just before the shutter — see shoot.mjs's
		// own note on requestAnimationFrame throttling in an unfocused window.
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
			{ paths: PATHS }
		);
		if (typeof problem === "string") {
			results.push({ name: shot.name, status: "skipped", detail: problem });
			console.log(`skip ${shot.name.padEnd(20)} ${problem}`);
			continue;
		}

		await sleep(1600);

		const state = await cdp.evaluate(() => ({
			view: document
				.querySelector(".workspace-leaf.mod-active .workspace-leaf-content")
				?.getAttribute("data-type"),
		}));

		await raise(cdp);
		await cdp.evaluate(() => {
			for (const el of document.querySelectorAll(".notice, .notice-container > *")) el.remove();
		});
		await sleep(200);

		const outName = WANTED[shot.name];
		const outPath = path.join(OUT_DIR, `${outName}.png`);
		const capture = await cdp.send("Page.captureScreenshot", { format: "png" });
		writeFileSync(outPath, Buffer.from(capture.data, "base64"));

		results.push({ name: shot.name, status: "ok", state });
		console.log(`ok   ${outName.padEnd(12)} ${state.view || "?"}`);
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
	else rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

const skipped = results.filter((r) => r.status === "skipped");
console.log(
	`\n${results.length - skipped.length} captured, ${skipped.length} skipped${
		process.env.KEEP_VAULT ? `\nvault kept at ${vaultDir}` : ""
	}`
);
