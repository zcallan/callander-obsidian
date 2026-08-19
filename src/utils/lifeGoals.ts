import { asArray, fieldOf, toText } from "@/utils/fm";
import type { LifeGoal } from "@/types";

/**
 * Reading and grouping a person's life goals.
 *
 * Kept out of the view for the usual reason: the ordering rule is the part
 * worth pinning down, and it's the part a view makes untestable.
 */

/**
 * Frontmatter → goals, tolerant of what a vault might hold.
 *
 * A bare string is a goal with no notes — the shape someone hand-writing
 * YAML will reach for first, and the same courtesy insideJokesOf extends.
 * Anything with no text is dropped rather than rendered as a blank row.
 */
export function parseLifeGoals(value: unknown): LifeGoal[] {
	return asArray(value)
		.map((g): LifeGoal => {
			if (typeof g === "string") return { text: g.trim() };
			const notes = toText(fieldOf(g, "notes")).trim();
			const completed = toText(fieldOf(g, "completed")).trim();
			// `done` is the flag that matters; a completion date without it
			// still counts, since the date only ever gets written alongside.
			const done = fieldOf(g, "done") === true || !!completed;
			return {
				text: toText(fieldOf(g, "text")).trim(),
				...(notes && { notes }),
				...(done && { done: true }),
				...(completed && { completed }),
			};
		})
		.filter((g) => g.text.length > 0);
}

/**
 * Goals split for display: still-open first, then completed.
 *
 * Each keeps its index into the stored list, so a row in either group edits
 * the one real entry rather than a copy. Order within a group is the stored
 * order — these aren't ranked, and resorting them under someone would lose
 * the only ordering they chose.
 */
export function groupLifeGoals(goals: LifeGoal[]): {
	open: { goal: LifeGoal; index: number }[];
	completed: { goal: LifeGoal; index: number }[];
} {
	const open: { goal: LifeGoal; index: number }[] = [];
	const completed: { goal: LifeGoal; index: number }[] = [];
	goals.forEach((goal, index) => {
		(goal.done ? completed : open).push({ goal, index });
	});
	return { open, completed };
}
