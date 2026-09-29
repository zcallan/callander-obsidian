/**
 * The birthday calendar export: one VEVENT per person with a known month
 * and day, for their next birthday only. Pure, so the file main.ts writes
 * can be checked byte for byte.
 */

import { parseFlexDate } from "@/utils/flexdate";
import { nextBirthdayOccurrence } from "@/utils/friendTimeline";

/** Where the export lands, at the vault root. Documented in docs/DATA.md. */
export const BIRTHDAY_ICS_PATH = "Callander Birthdays.ics";

export interface CalendarPerson {
	/** The note's basename, which the UID is built from. */
	basename: string;
	displayName: string;
	/** The stored FlexDate. */
	birthday: string;
}

/** DTSTAMP's UTC form: 20260805T120000Z. */
function icsStamp(now: Date): string {
	return now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** Escapes backslash, comma and semicolon for an ICS TEXT value. */
function escapeIcsText(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m);
}

/** The calendar file's text, and how many birthdays it holds. */
export function birthdayCalendar(
	people: readonly CalendarPerson[],
	now: Date
): { ics: string; count: number } {
	const stamp = icsStamp(now);
	const lines: string[] = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Callander//Birthday Calendar//EN",
		"CALSCALE:GREGORIAN",
		"X-WR-CALNAME:Callander Birthdays",
	];

	let count = 0;
	for (const c of people) {
		const parsed = parseFlexDate(c.birthday);
		// A calendar event needs a month and a day
		if (!parsed || parsed.month === null || parsed.day === null) {
			continue;
		}
		const uidBase = c.basename.toLowerCase().replace(/[^a-z0-9]+/g, "-");

		// The next occurrence only — one year of coverage. Through the rule
		// the dashboard counts down by, so 29 February is 1 March in a
		// common year here too, not an invalid 20270229.
		const next = nextBirthdayOccurrence(c.birthday, now);
		if (!next) continue;
		const year = Number(next.date.slice(0, 4));

		const title =
			parsed.year !== null
				? `🎂 ${c.displayName} turns ${year - parsed.year}`
				: `🎂 ${c.displayName}'s birthday`;

		lines.push(
			"BEGIN:VEVENT",
			`UID:callander-${uidBase}-${year}@callander`,
			`DTSTAMP:${stamp}`,
			`DTSTART;VALUE=DATE:${next.date.replace(/-/g, "")}`,
			`SUMMARY:${escapeIcsText(title)}`,
			"BEGIN:VALARM",
			"ACTION:DISPLAY",
			`DESCRIPTION:${escapeIcsText(title)}`,
			"TRIGGER:PT9H",
			"END:VALARM",
			"END:VEVENT"
		);
		count++;
	}
	lines.push("END:VCALENDAR");
	return { ics: lines.join("\r\n"), count };
}
