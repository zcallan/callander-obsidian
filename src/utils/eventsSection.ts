import { NOTES_HEADING, type SectionSpec } from "@/utils/markdownSection";

/**
 * The person page's generated Events section: a chronological list of
 * wikilinks to the event files that mention this person. Present only
 * while they have events — upsertSection removes an emptied section.
 *
 * Lives here rather than in EventOperations, which writes it, because it
 * isn't only the writer's business: Notes is everything in the body *outside*
 * the generated sections, so it has to know where this one starts and stops,
 * and a utility importing from a service would run the layering backwards.
 */
export const EVENTS_SECTION: SectionSpec = {
	heading: "## Events",
	matches: /^##\s+Events\s*$/i,
	// The section owns no subheadings, so any heading safely closes it.
	closes: /^#{1,6}\s/,
	above: NOTES_HEADING,
};

/** One of the section's own `- [[Event]]` lines. */
export function ownsEventLine(line: string): boolean {
	return /^-\s+\[\[[^\]]+\]\]\s*$/.test(line.trim());
}
