/**
 * The year recap note's text. Counts, not scores: main.ts gathers the
 * contacts and diary dates and writes the note; this only builds it.
 */

import { parseFlexDate } from "@/utils/flexdate";
import { formatCount } from "@/utils/text";

export interface RecapContact {
	/** The note itself: its basename is what the [[…]] link points at. */
	file: { basename: string };
	met: string;
	events: readonly {
		file: { path: string };
		date: string;
		type: string;
		status: string;
	}[];
	ideas: readonly { done: boolean }[];
	openIdeas: number;
}

export interface RecapInput {
	year: number;
	/** The day it was generated, as YYYY-MM-DD. */
	generatedOn: string;
	contacts: readonly RecapContact[];
	/** Every diary entry's date, whatever the year. */
	diaryDates: readonly string[];
}

/** The recap as markdown lines joined with "\n". */
export function buildYearRecap({
	year,
	generatedOn,
	contacts,
	diaryDates,
}: RecapInput): string {
	const lines: string[] = [
		`# Your friendships in ${year}`,
		"",
		`*Generated ${generatedOn}. Counts, not scores — Callander doesn't grade friendships.*`,
		"",
	];

	const newFriends = contacts.filter(
		(c) => parseFlexDate(c.met)?.year === year
	);
	if (newFriends.length > 0) {
		lines.push(`## New this year`);
		newFriends.forEach((c) => lines.push(`- [[${c.file.basename}]]`));
		lines.push("");
	}

	// Cancelled plans didn't happen, so they aren't moments.
	const inYear = (e: RecapContact["events"][number]) =>
		e.status !== "cancelled" && parseFlexDate(e.date)?.year === year;

	lines.push(`## Moments logged`);
	for (const c of contacts) {
		const count = c.events.filter(inYear).length;
		if (count > 0) {
			lines.push(
				`- [[${c.file.basename}]] — ${formatCount(count, "event")}`
			);
		}
	}
	// Each event once: a hangout with three friends is listed under all
	// three of them, but it's one hangout.
	const yearEvents = [
		...new Map(
			contacts.flatMap((c) =>
				c.events.filter(inYear).map((e) => [e.file.path, e] as const)
			)
		).values(),
	];
	const hangouts = yearEvents.filter((e) => e.type === "hangout").length;
	const lifeMoments = yearEvents.filter((e) => e.type === "life").length;
	lines.push(
		"",
		`**${formatCount(
			yearEvents.length,
			"event"
		)} across everyone** — ${formatCount(
			hangouts,
			"hangout"
		)}, ${lifeMoments} of their life moments witnessed.`,
		""
	);

	const ideasDone = contacts.reduce(
		(n, c) => n + c.ideas.filter((i) => i.done).length,
		0
	);
	const ideasOpen = contacts.reduce((n, c) => n + c.openIdeas, 0);
	lines.push(
		`## Ideas`,
		`- ${formatCount(ideasDone, "idea")} checked off all-time`,
		`- ${ideasOpen} still open — fuel for next year`,
		""
	);

	const diaryCount = diaryDates.filter((d) =>
		d.startsWith(String(year))
	).length;
	lines.push(
		`## Diary`,
		`- ${formatCount(diaryCount, "entry", "entries")} about ${year}`,
		""
	);

	return lines.join("\n");
}
