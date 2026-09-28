/**
 * The year recap note's text. Counts, not scores: main.ts gathers the
 * contacts and diary dates and writes the note; this only builds it.
 */

import { parseFlexDate } from "@/utils/flexdate";
import { formatCount } from "@/utils/text";

export interface RecapContact {
	/** What goes inside the [[…]] link: the note's name. */
	name: string;
	met: string;
	events: readonly { date: string; type: string }[];
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
		newFriends.forEach((c) => lines.push(`- [[${c.name}]]`));
		lines.push("");
	}

	lines.push(`## Moments logged`);
	let totalEvents = 0;
	for (const c of contacts) {
		const count = c.events.filter(
			(e) => parseFlexDate(e.date)?.year === year
		).length;
		totalEvents += count;
		if (count > 0) {
			lines.push(`- [[${c.name}]] — ${formatCount(count, "event")}`);
		}
	}
	const yearEvents = contacts.flatMap((c) =>
		c.events.filter((e) => parseFlexDate(e.date)?.year === year)
	);
	const hangouts = yearEvents.filter((e) => e.type === "hangout").length;
	const lifeMoments = yearEvents.filter((e) => e.type === "life").length;
	lines.push(
		"",
		`**${totalEvents} events across everyone** — ${formatCount(
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
	lines.push(`## Diary`, `- ${diaryCount} entries about ${year}`, "");

	return lines.join("\n");
}
