import type { Idea } from "@/types";
import { IDEA_CATEGORIES, type IdeaCategory } from "@/constants";
import {
	readSection,
	upsertSection,
	type SectionSpec,
} from "@/utils/markdownSection";

/**
 * Ideas, stored as markdown in the note body rather than as frontmatter.
 *
 * Unlike quotes, ideas have real structure — a category, a done flag, an
 * optional resurface date — and markdown already has idiomatic spellings
 * for all three: a subheading, a task checkbox, and a trailing marker in
 * the style the Tasks plugin established.
 *
 * On disk:
 *
 *     ## Ideas
 *
 *     ### 🎁 Gifts
 *
 *     - [ ] Ricer for mashed potatoes
 *     - [x] Cookbook ⏳ 2026-03
 *
 *     ### 📍 Places
 *
 *     - [ ] Saltie Girl in Back Bay
 *
 * Groups are emitted in the app's fixed category order, which is the same
 * order the contact page renders them in — so the file reads the way the
 * UI looks.
 */

const SPEC: SectionSpec = {
	heading: "## Ideas",
	matches: /^##\s+Ideas\s*$/i,
	// `###` group headings belong to this section, so only `#`/`##` close it.
	closes: /^#{1,2}\s/,
};

/** `- [ ] text` / `- [x] text`, with `*` tolerated as the bullet marker. */
const TASK = /^[-*]\s+\[([ xX])\]\s*(.*)$/;
const GROUP_HEADING = /^###\s+(.*)$/;
/**
 * A trailing resurface marker: `⏳ 2026-03`. Anchored to end-of-line and
 * required to look like a flexible date, so an idea whose text merely
 * mentions the emoji isn't mistaken for one.
 */
const RESURFACE = /\s*⏳\s*(\d{4}(?:-\d{2}(?:-\d{2})?)?)\s*$/;

function categoryFromHeading(heading: string): IdeaCategory | null {
	// The emoji is decoration — match on the label so a hand-typed
	// "### Gifts" works exactly as well as the emoji form.
	const cleaned = heading
		.replace(/[\p{Extended_Pictographic}️]/gu, "")
		.trim()
		.toLowerCase();
	const found = IDEA_CATEGORIES.find(
		(c) => c.label.toLowerCase() === cleaned
	);
	return found ? found.id : null;
}

export function isIdeaLine(line: string): boolean {
	const trimmed = line.trim();
	return TASK.test(trimmed) || GROUP_HEADING.test(trimmed);
}

/** One task bullet → an idea, given the group it appeared under. */
export function parseIdeaLine(
	line: string,
	category: IdeaCategory
): Idea | null {
	const match = TASK.exec(line.trim());
	if (!match) return null;
	const done = match[1].toLowerCase() === "x";
	let text = match[2].trim();
	if (!text) return null;

	let resurface: string | undefined;
	const marker = RESURFACE.exec(text);
	if (marker) {
		resurface = marker[1];
		text = text.slice(0, marker.index).trim();
	}
	if (!text) return null;

	return {
		category,
		text,
		done,
		...(resurface && { resurface }),
	};
}

export function serializeIdeaLine(idea: Idea): string {
	const box = idea.done ? "[x]" : "[ ]";
	const tail = idea.resurface ? ` ⏳ ${idea.resurface}` : "";
	return `- ${box} ${idea.text}${tail}`;
}

export function parseIdeasSection(body: string): Idea[] | null {
	const lines = readSection(body, SPEC);
	if (lines === null) return null;
	const ideas: Idea[] = [];
	// Anything before the first group heading — or under one we don't
	// recognise — lands in "other" rather than being dropped.
	let current: IdeaCategory = "other";
	for (const line of lines) {
		const heading = GROUP_HEADING.exec(line.trim());
		if (heading) {
			current = categoryFromHeading(heading[1]) ?? "other";
			continue;
		}
		const idea = parseIdeaLine(line, current);
		if (idea) ideas.push(idea);
	}
	return ideas;
}

/** Grouped by category in the app's fixed order, matching the UI. */
export function renderIdeaLines(ideas: Idea[]): string[] {
	const out: string[] = [];
	for (const cat of IDEA_CATEGORIES) {
		const group = ideas.filter(
			(i) => normalizeCategory(i.category) === cat.id
		);
		if (group.length === 0) continue;
		if (out.length > 0) out.push("");
		out.push(`### ${cat.emoji} ${cat.label}`, "");
		for (const idea of group) out.push(serializeIdeaLine(idea));
	}
	return out;
}

/** An unknown or missing category reads as "other", the same fallback the
 * contact page applies when rendering. */
function normalizeCategory(category: unknown): IdeaCategory {
	return IDEA_CATEGORIES.some((c) => c.id === category)
		? (category as IdeaCategory)
		: "other";
}

export function upsertIdeasSection(body: string, ideas: Idea[]): string {
	return upsertSection(body, SPEC, renderIdeaLines(ideas), isIdeaLine);
}
