import type { PlanQuickIdea } from "@/types";
import { PlanOperations } from "@/services/PlanOperations";
import { stripEmoji } from "@/utils/emoji";
import {
	formatItemCost,
	formatItemTime,
	formatQuickIdeaDates,
} from "@/utils/planFormat";

/**
 * A plan's ideas as plain text — the shortlist you'd paste into a chat to
 * ask "which of these?".
 *
 * Grouped through PlanOperations.groupQuickIdeas, the same call the section
 * renders from, so the message can't disagree with the screen about which
 * heading something sits under. An idea in two categories appears under
 * both here as well: that's what the field is for.
 *
 * Emoji come out entirely — the type icon the row draws was never in here,
 * but people type them into an idea's own text, and a shortlist pasted into
 * a chat reads better as plain words.
 *
 * Kept pure and out of the section so it can be exercised directly.
 */

export interface IdeaShareDetail {
	/** Candidate days — "Sat 22 Aug - Sun 23 Aug". */
	dates: boolean;
	/** "Late night", "Daytime", "7:30pm". */
	time: boolean;
	cost: boolean;
	people: boolean;
	notes: boolean;
}

export const IDEA_SHARE_FIELDS: {
	id: keyof IdeaShareDetail;
	label: string;
}[] = [
	{ id: "dates", label: "Dates" },
	{ id: "time", label: "Time" },
	{ id: "cost", label: "Cost" },
	{ id: "people", label: "People" },
	{ id: "notes", label: "Notes" },
];

/**
 * When and roughly when — the two things that decide whether an idea is
 * possible, and so the two worth sending. Cost, people and notes are
 * yours to know and go on deliberately.
 */
export const IDEA_SHARE_DEFAULTS: IdeaShareDetail = {
	dates: true,
	time: true,
	cost: false,
	people: false,
	notes: false,
};

export function buildIdeaShareText(
	ideas: PlanQuickIdea[],
	detail: IdeaShareDetail,
	/** Resolves an idea's people the way the section does. */
	shortenPeople: (people: string) => string = (people) => people
): string {
	const blocks: string[] = [];
	for (const group of PlanOperations.groupQuickIdeas(ideas)) {
		const lines: string[] = [];
		// Empty when nothing is categorised — a list where everything sits
		// in one bucket needs no heading naming it.
		if (group.label) lines.push(stripEmoji(group.label));

		for (const { idea } of group.entries) {
			// Dates first, then the rough time: the same order the row on
			// screen puts them in, since they answer "when" together.
			const bits: string[] = [];
			if (detail.dates && idea.dates && idea.dates.length > 0) {
				bits.push(formatQuickIdeaDates(idea.dates));
			}
			if (detail.time && idea.time) bits.push(formatItemTime(idea.time));
			if (detail.cost && idea.cost !== undefined) {
				bits.push(formatItemCost(idea.cost));
			}
			if (detail.people && idea.people) {
				bits.push(stripEmoji(shortenPeople(idea.people)));
			}
			const meta = bits.filter(Boolean).join(" • ");
			lines.push(`- ${stripEmoji(idea.text)}${meta ? ` • ${meta}` : ""}`);

			// Its own line, indented under the item: a note is a sentence
			// where the rest of the row is labels, and inline it would push
			// the next idea off the end of the line.
			if (detail.notes && idea.notes) lines.push(`  ${stripEmoji(idea.notes)}`);
		}
		if (lines.length > 0) blocks.push(lines.join("\n"));
	}
	// A blank line between groups, so the headings have something to head.
	return blocks.join("\n\n");
}
