/**
 * What the birthday reminders say: the day's notice, the upcoming digest,
 * met anniversaries and the status-bar label. main.ts decides when to
 * show them; these decide what they read.
 */

import { parseFlexDate } from "@/utils/flexdate";
import { formatCount } from "@/utils/text";

export interface ReminderContact {
	displayName: string;
	/** Days to the next birthday, 0 on the day; null when unknown. */
	daysUntilBirthday: number | null;
	/** The age they turn on the day; null when the year is unknown. */
	age: number | null;
	met: string;
}

/** "Ann", "Ann and Bo", "Ann, Bo and Cy". */
export function joinWithAnd(names: readonly string[]): string {
	const rest = [...names];
	const last = rest.pop();
	return rest.length > 0 ? rest.join(", ") + " and " + last : last ?? "";
}

/** Everyone whose birthday is today. */
export function birthdaysToday<T extends ReminderContact>(
	contacts: readonly T[]
): T[] {
	return contacts.filter((c) => c.daysUntilBirthday === 0);
}

/** The notice for today's birthdays, or null when there are none. */
export function todayBirthdayNotice(
	contacts: readonly ReminderContact[]
): string | null {
	const today = birthdaysToday(contacts);
	if (today.length === 0) return null;
	return `🎂 It's ${joinWithAnd(today.map((c) => c.displayName))}'s birthday today!`;
}

/** The system notification for one person's birthday today. */
export function birthdayNotificationBody(c: ReminderContact): string {
	// On the day itself, age is the age they turn
	const turning = c.age !== null ? ` — turning ${c.age}` : "";
	return `🎂 It's ${c.displayName}'s birthday today${turning}!`;
}

/** One digest for everything from tomorrow to `windowDays` out, soonest first. */
export function upcomingBirthdayDigest(
	contacts: readonly ReminderContact[],
	windowDays: number
): string | null {
	const upcoming = contacts
		.filter(
			(c): c is ReminderContact & { daysUntilBirthday: number } =>
				c.daysUntilBirthday !== null &&
				c.daysUntilBirthday >= 1 &&
				c.daysUntilBirthday <= windowDays
		)
		.sort((a, b) => a.daysUntilBirthday - b.daysUntilBirthday);
	if (upcoming.length === 0) return null;
	const parts = upcoming.map((c) =>
		c.daysUntilBirthday === 1
			? `${c.displayName} tomorrow`
			: `${c.displayName} in ${c.daysUntilBirthday} days`
	);
	return `🎈 Upcoming birthdays: ${parts.join(" · ")}`;
}

/** Met anniversaries falling today, at recorded precision (exact-day mets). */
export function metAnniversaryNotices(
	contacts: readonly ReminderContact[],
	now: Date
): string[] {
	const notices: string[] = [];
	for (const c of contacts) {
		const met = parseFlexDate(c.met);
		if (
			met?.year != null &&
			met.month === now.getMonth() + 1 &&
			met.day === now.getDate()
		) {
			const years = now.getFullYear() - met.year;
			if (years > 0) {
				notices.push(
					`🤝 ${formatCount(years, "year")} since you met ${c.displayName} today!`
				);
			}
		}
	}
	return notices;
}

/** The status bar's text: the next birthday inside the window, or "". */
export function birthdayStatusLabel(
	contacts: readonly ReminderContact[],
	windowDays: number
): string {
	const next = contacts
		.filter(
			(c): c is ReminderContact & { daysUntilBirthday: number } =>
				c.daysUntilBirthday !== null &&
				c.daysUntilBirthday <= windowDays
		)
		.sort((a, b) => a.daysUntilBirthday - b.daysUntilBirthday)[0];
	if (!next) return "";
	return next.daysUntilBirthday === 0
		? `🎂 ${next.displayName} today!`
		: `🎂 ${next.displayName} ${next.daysUntilBirthday}d`;
}
