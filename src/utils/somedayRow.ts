import {
	formatSomedayDays,
	formatSomedaySeasonDeadline,
	somedayType,
	type SomedayDay,
} from "@/constants";
import { parseFlexDate, formatFlexDate } from "@/utils/flexdate";
import { splitLeadingEmoji } from "@/utils/emoji";
import {
	dateDeadlineLabel,
	fromDateLabel,
	untilDateLabel,
} from "@/utils/somedaySort";

/**
 * The parts a someday row is built from, shared by the Somedays page and
 * the dashboard's shortlist so the two can't drift apart.
 *
 * Structural rather than typed against SomedayInfo — it needs no TFile,
 * so the unit suite can exercise it against plain objects.
 */
export interface RowableSomeday {
	name: string;
	date: string;
	seasons: string[];
	days: SomedayDay[];
	fromDate: string;
	untilDate: string;
	types: string[];
}

export interface SomedayRowParts {
	/** The name, fronted by the lead type's emoji unless it brings its own. */
	title: string;
	/** Window and deadline phrases that qualify the name, in reading order. */
	deadlines: string[];
	/** The right-hand timing summary; "" when nothing constrains it. */
	when: string;
}

export function somedayRowParts(
	s: RowableSomeday,
	now: Date
): SomedayRowParts {
	const typeInfo = somedayType(s.types[0]);
	const title =
		typeInfo && !splitLeadingEmoji(s.name)
			? `${typeInfo.emoji} ${s.name}`
			: s.name;

	// Deadlines ride with the name rather than the timing summary — they're
	// about this someday's window, not about when it suits. A not-yet-open
	// window leads ("from 12 Sep") since it explains why the row sits low
	// under Recommended; then the firmer until-date. The date and season
	// entries never fire alongside those — the modal keeps every mode
	// mutually exclusive.
	const deadlines = [
		fromDateLabel(s.fromDate, now),
		untilDateLabel(s.untilDate, now),
		dateDeadlineLabel(s.date, now),
		formatSomedaySeasonDeadline(s.seasons),
	].filter(Boolean);

	// Seasons and a month/year-precision date are deliberately absent here —
	// they read as a deadline beside the name instead. An unconstrained
	// someday says nothing rather than "Any time", which every row would
	// otherwise carry.
	const days = formatSomedayDays(s.days);
	const flex = parseFlexDate(s.date);
	const when =
		flex && flex.day !== null
			? [days, formatFlexDate(flex)].filter(Boolean).join(" · ")
			: days;

	return { title, deadlines, when };
}
