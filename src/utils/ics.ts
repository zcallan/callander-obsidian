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
	const uids = new Set<string>();
	for (const c of people) {
		const parsed = parseFlexDate(c.birthday);
		// A calendar event needs a month and a day
		if (!parsed || parsed.month === null || parsed.day === null) {
			continue;
		}
		let uidBase = c.basename.toLowerCase().replace(/[^a-z0-9]+/g, "-");
		// A name with nothing ASCII in it ("李雷") slugs to "-", and two
		// can slug alike ("Zoë", "Zoé"), after which a calendar keeps only
		// one of them. Those get a tag from the full name on the end;
		// everyone else's UID stays exactly as it was, so re-importing
		// doesn't duplicate them.
		if (/^-*$/.test(uidBase) || uids.has(uidBase)) {
			uidBase = `${uidBase}${nameTag(c.basename)}`;
		}
		uids.add(uidBase);

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

// FNV-1a's 32-bit offset basis and prime.
const FNV_OFFSET_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;

/** A short tag for a name, the same every export, so the same person
 * always gets the same UID. */
function nameTag(name: string): string {
	let h = FNV_OFFSET_32;
	for (let i = 0; i < name.length; i++) {
		h = Math.imul(h ^ name.charCodeAt(i), FNV_PRIME_32) >>> 0;
	}
	return h.toString(36);
}
