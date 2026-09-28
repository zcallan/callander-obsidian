import { createSuite } from "./harness.mjs";
import { birthdayCalendar } from "./.build/callander.mjs";

/** The birthday export, byte for byte: it's a file people import. */
export function run() {
	const { eq, result } = createSuite("birthday calendar");
	// Midday UTC, so every zone from -11 to +11 is on 5 August.
	const now = new Date(Date.UTC(2026, 7, 5, 12, 0, 0));
	const { ics, count } = birthdayCalendar(
		[
			{ basename: "Ann Lee", displayName: "Ann", birthday: "1990-12-25" },
			{ basename: "Bo", displayName: "Bo, Jr; the 2nd", birthday: "03-01" },
			{ basename: "Cy", displayName: "Cy", birthday: "1990" },
			{ basename: "Dee", displayName: "Dee", birthday: "2000-08-05" },
		],
		now
	);
	eq("one event per person with a month and day", count, 3);
	const event = (uid, start, title) => [
		"BEGIN:VEVENT",
		`UID:${uid}`,
		"DTSTAMP:20260805T120000Z",
		`DTSTART;VALUE=DATE:${start}`,
		`SUMMARY:${title}`,
		"BEGIN:VALARM",
		"ACTION:DISPLAY",
		`DESCRIPTION:${title}`,
		"TRIGGER:PT9H",
		"END:VALARM",
		"END:VEVENT",
	];
	eq(
		"the whole file, CRLF-joined: later this year, next year once passed, today kept",
		ics.split("\r\n"),
		[
			"BEGIN:VCALENDAR",
			"VERSION:2.0",
			"PRODID:-//Callander//Birthday Calendar//EN",
			"CALSCALE:GREGORIAN",
			"X-WR-CALNAME:Callander Birthdays",
			...event("callander-ann-lee-2026@callander", "20261225", "🎂 Ann turns 36"),
			...event("callander-bo-2027@callander", "20270301", "🎂 Bo\\, Jr\\; the 2nd's birthday"),
			...event("callander-dee-2026@callander", "20260805", "🎂 Dee turns 26"),
			"END:VCALENDAR",
		]
	);
	eq("CRLF line endings, none trailing", [ics.includes("\r\n"), ics.endsWith("END:VCALENDAR")], [true, true]);
	return result();
}
