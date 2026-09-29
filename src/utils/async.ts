import { Notice } from "obsidian";

/**
 * Fire and forget, but not silently: a failure is logged under `label`,
 * and shown as `notice` when there's one — for work the person asked for.
 * Background work passes no notice and only logs.
 */
export function runLogged(
	label: string,
	task: () => Promise<unknown>,
	notice?: string
): void {
	void task().catch((error: unknown) => {
		console.error(`Callander: ${label} failed`, error);
		if (notice) new Notice(notice);
	});
}
