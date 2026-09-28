/**
 * Which birthdays the dashboard lists: those coming up, and those missed
 * and not yet wished. A "wished" mark is the date of the occurrence it
 * was for, so ticking this year's birthday leaves next year's open.
 */

import type { ContactWithCountdown } from "@/types";
import { isoDay } from "@/utils/dates";

/** How far ahead Upcoming birthdays looks. */
export const UPCOMING_BIRTHDAY_DAYS = 30;

type BirthdayCountdown = Pick<
	ContactWithCountdown,
	"daysUntilBirthday" | "daysSinceBirthday" | "birthdayWished"
>;

/** The local date `daysSince` days before `today`: that birthday's date. */
export function lastOccurrenceDate(daysSince: number, today: Date): string {
	const d = new Date(today);
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() - daysSince);
	return isoDay(d);
}

/**
 * Birthdays within `horizonDays`, soonest first. A same-day birthday
 * ticked Done drops out for the rest of today, exactly like a missed one.
 */
export function upcomingBirthdays<T extends BirthdayCountdown>(
	contacts: readonly T[],
	horizonDays: number,
	today: Date
): { contact: T; days: number }[] {
	const wishedToday = lastOccurrenceDate(0, today);
	return contacts
		.filter(
			(c): c is T & { daysUntilBirthday: number } =>
				c.daysUntilBirthday !== null &&
				c.daysUntilBirthday <= horizonDays &&
				!(c.daysUntilBirthday === 0 && c.birthdayWished === wishedToday)
		)
		.sort((a, b) => a.daysUntilBirthday - b.daysUntilBirthday)
		.map((contact) => ({ contact, days: contact.daysUntilBirthday }));
}

/**
 * Birthdays passed within `belatedDays` and not yet marked as wished for
 * that occurrence, most recent first.
 */
export function missedBirthdays<T extends BirthdayCountdown>(
	contacts: readonly T[],
	belatedDays: number,
	today: Date
): { contact: T; daysSince: number }[] {
	return contacts
		.filter(
			(c): c is T & { daysSinceBirthday: number } =>
				c.daysSinceBirthday !== null &&
				c.daysSinceBirthday > 0 &&
				c.daysSinceBirthday <= belatedDays &&
				c.birthdayWished !==
					lastOccurrenceDate(c.daysSinceBirthday, today)
		)
		.sort((a, b) => a.daysSinceBirthday - b.daysSinceBirthday)
		.map((contact) => ({ contact, daysSince: contact.daysSinceBirthday }));
}
