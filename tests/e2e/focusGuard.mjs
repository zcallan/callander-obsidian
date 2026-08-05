/**
 * Keeps the test Obsidian window from stealing keyboard focus while the
 * suite runs — you might be typing in another window when it launches.
 *
 * There is no clean fix for this. Every option that would properly
 * suppress a specific process's initial activation was tried and ruled
 * out empirically, not assumed:
 *
 *   `open -g <bundle>`           doesn't spawn an independent process —
 *                                 it sends an Apple Event to whichever
 *                                 instance is already running (your real
 *                                 vault), so it's disqualified regardless
 *                                 of its focus behaviour.
 *   NSRunningApplication
 *     .activationPolicy = …      read-only once a process is running;
 *                                 the setter doesn't exist (-2700).
 *   CDP Browser.setWindowBounds /
 *     getWindowForTarget         not implemented in this Electron build
 *                                 ("wasn't found", -32601).
 *   Info.plist + LSUIElement
 *     on a copied bundle         copying and patching works, but the
 *                                 edit invalidates the code signature and
 *                                 Apple Silicon's signing enforcement
 *                                 refuses to execute the result (silent
 *                                 exit 0, no output). Going further would
 *                                 mean re-signing Obsidian's official
 *                                 binary, which isn't appropriate
 *                                 regardless of whether it would work.
 *   --start-minimized / --hidden  not recognised by Obsidian; no effect.
 *
 * What's left, and what this does: Electron activates the window once,
 * a few hundred ms after the process starts (measured ~300–600ms after
 * spawn). Polling for a focus change and immediately reactivating
 * whichever app owned focus before spawn catches that one steal and
 * reverts it. Measured window with this running: focus returns within
 * ~300ms of being taken, rather than staying stolen indefinitely.
 *
 * This is a mitigation, not a fix — there is a real, measured gap of a
 * few hundred milliseconds where Obsidian genuinely is the frontmost app,
 * and a keystroke landing in exactly that window still reaches it. If
 * that residual risk matters more than the convenience of an unattended
 * run, don't launch during it — that's a scheduling question this module
 * can't answer for you.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

async function frontmostApp() {
	try {
		const { stdout } = await run("osascript", [
			"-e",
			'tell application "System Events" to get name of first application process whose frontmost is true',
		]);
		return stdout.trim();
	} catch {
		return null;
	}
}

async function activate(appName) {
	try {
		await run("osascript", ["-e", `tell application "${appName}" to activate`]);
	} catch {
		// The previously-frontmost app may have quit since — nothing to do.
	}
}

/**
 * Starts guarding immediately (before the caller awaits anything else) and
 * returns a stop function. Safe to call even where `osascript` is
 * unavailable (non-macOS, or Accessibility access not granted) — it then
 * simply can't read or restore focus, and the window behaves as it does
 * today rather than throwing.
 */
export function startFocusGuard({ durationMs = 4000, intervalMs = 40 } = {}) {
	let stopped = false;
	let owner = null;

	const loop = (async () => {
		owner = await frontmostApp();
		if (!owner) return; // No Accessibility access — nothing we can do.
		const deadline = Date.now() + durationMs;
		while (!stopped && Date.now() < deadline) {
			const current = await frontmostApp();
			if (current && current !== owner) {
				await activate(owner);
			}
			await new Promise((r) => setTimeout(r, intervalMs));
		}
	})();

	return async function stopFocusGuard() {
		stopped = true;
		await loop;
	};
}
