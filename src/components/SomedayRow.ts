import type { SomedayRowParts } from "@/utils/somedayRow";

/**
 * Fills a someday row: the name (plus any deadline that qualifies it) on
 * the left, the timing summary pushed to the right.
 *
 * Shared by the Somedays page and the dashboard's shortlist. Both get the
 * same elements and class names; only the surrounding rule decides how
 * big it all sits, so the two lists can't drift into different shapes.
 */
export function buildSomedayRow(row: HTMLElement, parts: SomedayRowParts) {
	const main = row.createDiv({ cls: "someday-row-main" });
	main.createSpan({ cls: "someday-title", text: parts.title });
	if (parts.deadlines.length > 0) {
		main.createSpan({
			cls: "someday-row-final",
			text: ` • ${parts.deadlines.join(" • ")}`,
		});
	}
	if (parts.when) {
		row.createDiv({ cls: "someday-row-when", text: parts.when });
	}
}
