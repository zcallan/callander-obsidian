/**
 * The "times are shown in a pinned zone" notice, on the dashboard, Events
 * and Calendar pages.
 *
 * Pinning a display zone is a deliberate, unusual choice (see the setting's
 * own description), and it's easy to forget you've made it — a converted
 * time looks exactly like a normal one unless you're comparing it against
 * something. The banner exists to be the thing you notice instead.
 */

export const SNOOZE_OPTIONS = [
	{ id: "1", label: "1 day" },
	{ id: "7", label: "7 days" },
	{ id: "30", label: "30 days" },
	{ id: "forever", label: "Forever" },
] as const;

export type SnoozeOptionId = (typeof SNOOZE_OPTIONS)[number]["id"];

/** "forever", or an ISO instant the snooze runs until, from picking an option now. */
export function snoozeUntil(option: SnoozeOptionId, now: Date = new Date()): string {
	if (option === "forever") return "forever";
	const days = Number(option);
	const until = new Date(now);
	until.setDate(until.getDate() + days);
	return until.toISOString();
}

/** Whether a stored snooze value is still in effect. Empty means never
 * snoozed; an unparsable value is treated the same way, so a corrupted
 * setting fails open (the banner shows) rather than silently forever. */
export function isSnoozed(stored: string, now: Date = new Date()): boolean {
	if (!stored) return false;
	if (stored === "forever") return true;
	const until = new Date(stored);
	return !Number.isNaN(until.getTime()) && now.getTime() < until.getTime();
}

/**
 * Whether the pinned-zone notice belongs on screen right now.
 *
 * `pinned` is `settings.displayTimezone` and `device` is this machine's own
 * zone — passed in, not read here, so this stays a pure function of its
 * arguments and is testable without pretending to be in another timezone.
 */
export function shouldShowTimezoneBanner(
	pinned: string,
	device: string,
	snoozedUntil: string,
	now: Date = new Date()
): boolean {
	if (!pinned || pinned === device) return false;
	return !isSnoozed(snoozedUntil, now);
}
