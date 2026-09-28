import { Notice } from "obsidian";

/** What a failed save says. The form stays open, so nothing typed is lost. */
export const SAVE_FAILED = "Couldn't save — what you entered is still here";

interface GuardOptions {
	/**
	 * Disabled while the action runs, then put back as they were. Usually
	 * its button; any control with a `disabled` will do. Read when the
	 * action is called, so a list can be filled in after the guard is made.
	 */
	buttons?: readonly { disabled: boolean }[];
	/** The Notice's lead-in when the action throws. */
	failure?: string;
}

/**
 * A save or delete that can only be running once at a time.
 *
 * Each modal here writes to the vault from a button, or from Enter, and
 * nothing stopped a second press while the first was still writing: Enter
 * twice made two notes, and a double-clicked Delete that removes by position
 * removed the next entry too. A call made while one is in flight is turned
 * away, and the given buttons are disabled until it settles.
 *
 * A failure is logged and shown as a Notice rather than left as an unhandled
 * rejection. The action closes its own modal after its write, so a write
 * that fails leaves the modal open with the input still in it.
 *
 * The returned function resolves true when the action ran to the end, and
 * false when it threw or was turned away.
 */
export function guardedAction<Args extends unknown[]>(
	action: (...args: Args) => void | Promise<void>,
	{ buttons = [], failure = SAVE_FAILED }: GuardOptions = {}
): (...args: Args) => Promise<boolean> {
	let running = false;
	return async (...args) => {
		if (running) return false;
		running = true;
		const wasDisabled = buttons.map((button) => button.disabled);
		for (const button of buttons) button.disabled = true;
		try {
			await action(...args);
			return true;
		} catch (error) {
			reportFailure(failure, error);
			return false;
		} finally {
			running = false;
			buttons.forEach((button, i) => {
				button.disabled = wasDisabled[i];
			});
		}
	};
}

/**
 * Say that a write failed, and log it. For a write with nothing to catch it
 * otherwise, such as an autosave that runs as its modal closes.
 */
export function reportFailure(lead: string, error: unknown): void {
	console.error("Callander:", error);
	new Notice(`${lead}: ${errorText(error)}`);
}

/** An error as a line a person can read. */
export function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
