/**
 * What a plan made from a someday starts with — the someday-side twin of
 * eventPlanSeed. main.ts does the writes; this decides their content.
 */

import {
	formatSomedayDays,
	formatSomedaySeasons,
	formatSomedayTimes,
	somedayType,
} from "@/constants";
import type { PlanItem, SomedayInfo } from "@/types";
import { joinNotes } from "@/utils/notesMarkdown";
import { planPrefillDate } from "@/utils/eventToPlan";

/** The parts of a someday a plan is seeded from. */
export type PlannableSomeday = Pick<
	SomedayInfo,
	| "name"
	| "date"
	| "types"
	| "seasons"
	| "days"
	| "times"
	| "fromDate"
	| "untilDate"
	| "cost"
	| "notes"
	| "subIdeas"
	| "people"
>;

export interface SomedayPlanSeed {
	prefill: { name: string; date: string };
	/** Sub-ideas, as the plan's idea menu. */
	items: PlanItem[];
	/** Suggested people, already wikilinks; absent when there are none. */
	members?: string[];
	/** The plan's starting notes; "" when there's nothing to say. */
	brief: string;
}

export function somedayPlanSeed(someday: PlannableSomeday): SomedayPlanSeed {
	const items = someday.subIdeas.map(
		(sub): PlanItem => ({
			text: sub.text,
			category: "activity",
			priority: "maybe",
		})
	);
	// Fuzzy fields (type, timeframe, days, budget, notes) don't fit a
	// plan's concrete model — seed them into the plan's notes as a
	// starting brief rather than lose them outright. Suggested people
	// aren't fuzzy, though — they're already wikilinks, the exact shape
	// a plan's own members list uses, so they become real members
	// instead of just a mention in the notes.
	//
	// The facts are a bullet list now that notes render as markdown: as
	// bare lines they'd run together into one paragraph for anyone with
	// strict line breaks on. The someday's own notes stay prose, below.
	const seed: string[] = [];
	const typeLabels = someday.types
		.map((t) => somedayType(t)?.label)
		.filter((l): l is NonNullable<typeof l> => !!l);
	if (typeLabels.length > 0) {
		seed.push(`Type: ${typeLabels.join(", ")}`);
	}
	const seasonLabel = formatSomedaySeasons(someday.seasons);
	if (seasonLabel) seed.push(`Season: ${seasonLabel}`);
	const daysLabel = formatSomedayDays(someday.days);
	if (daysLabel) seed.push(`Good days: ${daysLabel}`);
	const timesLabel = formatSomedayTimes(someday.times);
	if (timesLabel) seed.push(`Good time: ${timesLabel}`);
	if (someday.fromDate) seed.push(`Earliest date: ${someday.fromDate}`);
	if (someday.untilDate) {
		seed.push(`Must happen by: ${someday.untilDate}`);
	}
	if (someday.cost !== null) seed.push(`Rough budget: ~$${someday.cost}`);
	const brief = joinNotes(
		seed.map((line) => `- ${line}`).join("\n"),
		someday.notes
	);
	return {
		prefill: { name: someday.name, date: planPrefillDate(someday.date) },
		items,
		...(someday.people.length > 0 && { members: someday.people }),
		brief,
	};
}
