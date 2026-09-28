/**
 * Reading a plan note's frontmatter: its ideas, items, lists, members and
 * costs. Pure, I/O-free parsers; PlanOperations keeps static aliases.
 *
 * Parsed items are written back as parsed, so the key order each reader
 * builds is part of the stored format. Keep it when editing these.
 */

import type { PlanIdeaCategory, PlanPriority } from "@/constants";
import type {
	PlanBringItem,
	PlanItem,
	PlanQuickIdea,
	PlanSimpleItem,
} from "@/types";
import { asArray, fieldOf, toText } from "@/utils/fm";
import { generatedField } from "@/utils/generated";

/** The named field when it's a non-empty string, else undefined. */
function strFieldOf(value: unknown, key: string): string | undefined {
	const v = fieldOf(value, key);
	return typeof v === "string" && v ? v : undefined;
}

/**
 * Ideas parked against the plan that nobody has scheduled yet.
 *
 * Stored under `quickIdeas`, deliberately not `ideas` — that key is
 * already read by ContactOperations.ideasOf on every note (merging a
 * legacy `giftIdeas`), and a plan goes through exactly the same code, so
 * reusing it would make these surface as gift ideas.
 */
export function quickIdeasOf(metadata: unknown): PlanQuickIdea[] {
	return asArray(fieldOf(metadata, "quickIdeas"))
		.map((raw): PlanQuickIdea => {
			const rawText = fieldOf(raw, "text");
			const cost = fieldOf(raw, "cost");
			const type = fieldOf(raw, "type");
			return {
				text:
					typeof rawText === "string"
						? rawText
						: rawText == null
						? toText(raw)
						: "",
				...(typeof type === "string" &&
					type && { type: type as PlanIdeaCategory }),
				// Both lists are hand-editable YAML, so a stray scalar or
				// map has to come out as an empty list rather than throw.
				categories: asArray(fieldOf(raw, "categories"))
					.map((c) => toText(c).trim())
					.filter(Boolean),
				dates: asArray(fieldOf(raw, "dates"))
					.map((d) => toText(d).trim())
					.filter(Boolean),
				...(strFieldOf(raw, "time") && {
					time: strFieldOf(raw, "time"),
				}),
				...(strFieldOf(raw, "duration") && {
					duration: strFieldOf(raw, "duration"),
				}),
				...(strFieldOf(raw, "people") && {
					people: strFieldOf(raw, "people"),
				}),
				...(typeof cost === "number" && { cost }),
				...(strFieldOf(raw, "notes") && {
					notes: strFieldOf(raw, "notes"),
				}),
				...(strFieldOf(raw, "created") && {
					created: strFieldOf(raw, "created"),
				}),
				...generatedField(raw),
			};
		})
		.filter((i) => i.text);
}

/**
 * Category names known to this plan — the vocabulary offered when adding
 * another quick idea.
 *
 * Reads the persisted `quickIdeaCategories` list, unioned with whatever
 * `quickIdeas` currently reference. The union is what makes this safe
 * without a migration: a plan that already had categorised ideas before
 * this field existed still offers them immediately, rather than showing
 * an empty list until each idea happens to be re-saved. Once any idea is
 * saved, the caller bakes this same union back into the persisted field
 * (see ContactPageView's rememberQuickIdeaCategories), so the category
 * survives even if every idea that used it is later edited or deleted —
 * that persistence, not the live scan, is the point of the field.
 */
export function quickIdeaCategoriesOf(metadata: unknown): string[] {
	const seen: string[] = [];
	const add = (cat: string) => {
		if (!seen.some((c) => c.toLowerCase() === cat.toLowerCase())) {
			seen.push(cat);
		}
	};
	for (const raw of asArray(fieldOf(metadata, "quickIdeaCategories"))) {
		const cat = toText(raw).trim();
		if (cat) add(cat);
	}
	for (const idea of quickIdeasOf(metadata)) {
		for (const cat of idea.categories ?? []) add(cat);
	}
	return seen;
}

/**
 * The same vocabulary, for a plan's stays.
 *
 * Its own list rather than the ideas': deleting "Boston" because no idea
 * is filed under it any more shouldn't take it off the hotel you booked
 * there. The union with what stays currently reference works the same
 * way, and for the same reason — see quickIdeaCategoriesOf.
 */
export function stayCategoriesOf(metadata: unknown): string[] {
	const seen: string[] = [];
	const add = (cat: string) => {
		if (!seen.some((c) => c.toLowerCase() === cat.toLowerCase())) {
			seen.push(cat);
		}
	};
	for (const raw of asArray(
		fieldOf(metadata, "accommodationCategories")
	)) {
		const cat = toText(raw).trim();
		if (cat) add(cat);
	}
	for (const stay of simpleListOf(
		metadata,
		"accommodation"
	)) {
		for (const cat of stay.categories ?? []) add(cat);
	}
	return seen;
}

/** Plan ideas — category + priority. Legacy bucket shapes are mapped. */
export function itemsOf(metadata: unknown): PlanItem[] {
	return asArray(fieldOf(metadata, "items"))
		.map((i): PlanItem => {
			const legacyBucket = fieldOf(i, "bucket");
			// "food" split into restaurant + cooking; old items → restaurant
			const rawCat = fieldOf(i, "category");
			const category =
				rawCat === "food"
					? "restaurant"
					: typeof rawCat === "string" && rawCat
					? (rawCat as PlanIdeaCategory)
					: "activity";
			const rawPriority = fieldOf(i, "priority");
			const priority =
				typeof rawPriority === "string" && rawPriority
					? (rawPriority as PlanPriority)
					: legacyBucket === "must"
					? "must"
					: "maybe";
			const rawText = fieldOf(i, "text");
			const cost = fieldOf(i, "cost");
			return {
				text:
					typeof rawText === "string"
						? rawText
						: rawText == null
						? String(i)
						: "",
				category,
				priority,
				...(strFieldOf(i, "date") && { date: strFieldOf(i, "date") }),
				...(strFieldOf(i, "time") && { time: strFieldOf(i, "time") }),
				...(strFieldOf(i, "duration") && {
					duration: strFieldOf(i, "duration"),
				}),
				...(strFieldOf(i, "people") && {
					people: strFieldOf(i, "people"),
				}),
				...(strFieldOf(i, "location") && {
					location: strFieldOf(i, "location"),
				}),
				...(typeof cost === "number" && { cost }),
				...(strFieldOf(i, "notes") && {
					notes: strFieldOf(i, "notes"),
				}),
			};
		})
		.filter((i) => i.text.length > 0);
}

/** Flat list readers (travel, accommodation) */
export function simpleListOf(metadata: unknown, key: string): PlanSimpleItem[] {
	return asArray(fieldOf(metadata, key))
		.map((i): PlanSimpleItem => {
			if (typeof i === "string") return { text: i };
			// Legacy free-text `day` is dropped; an ISO one is kept as date.
			const day = strFieldOf(i, "day");
			const date =
				strFieldOf(i, "date") ??
				(day && /^\d{4}-\d{2}-\d{2}$/.test(day)
					? day
					: undefined);
			const type = strFieldOf(i, "type");
			const rawText = fieldOf(i, "text");
			const cost = fieldOf(i, "cost");
			const rawStay = strFieldOf(i, "stay");
			// "Mate's" folded into Home. Mapped on read rather than by
			// rewriting every plan file, the same way a legacy "food"
			// category becomes "restaurant" in itemsOf above — the stored
			// value converts itself the next time the item is saved.
			const stay = rawStay === "friends" ? "home" : rawStay;
			const booked = strFieldOf(i, "booked");
			const nights = fieldOf(i, "nights");
			return {
				text: typeof rawText === "string" ? rawText : "",
				...(type && { type: type as PlanSimpleItem["type"] }),
				...(stay && { stay: stay as PlanSimpleItem["stay"] }),
				...(date && { date }),
				...(strFieldOf(i, "time") && { time: strFieldOf(i, "time") }),
				...(strFieldOf(i, "people") && {
					people: strFieldOf(i, "people"),
				}),
				...(strFieldOf(i, "duration") && {
					duration: strFieldOf(i, "duration"),
				}),
				...(typeof nights === "number" &&
					nights > 0 && { nights }),
				...(strFieldOf(i, "checkIn") && {
					checkIn: strFieldOf(i, "checkIn"),
				}),
				...(strFieldOf(i, "checkOut") && {
					checkOut: strFieldOf(i, "checkOut"),
				}),
				...(strFieldOf(i, "address") && {
					address: strFieldOf(i, "address"),
				}),
				...(asArray(fieldOf(i, "categories")).length > 0 && {
					categories: asArray(fieldOf(i, "categories"))
						.map((c) => toText(c).trim())
						.filter(Boolean),
				}),
				...(booked && {
					booked: booked as PlanSimpleItem["booked"],
				}),
				...(strFieldOf(i, "notes") && {
					notes: strFieldOf(i, "notes"),
				}),
				...(typeof cost === "number" && { cost }),
			};
		})
		.filter((i) => i.text.length > 0);
}

export function membersOf(metadata: unknown): string[] {
	return asArray(fieldOf(metadata, "members")).map(String);
}

/** Bring items are a checklist; legacy plain strings read as unchecked */
export function bringOf(metadata: unknown): PlanBringItem[] {
	return asArray(fieldOf(metadata, "bring"))
		.map((b) => {
			if (typeof b === "string") return { text: b, done: false };
			const text = fieldOf(b, "text");
			return {
				text: typeof text === "string" ? text : "",
				done: !!fieldOf(b, "done"),
			};
		})
		.filter((b) => b.text.length > 0);
}

/** Sum of per-item costs across ideas, travel and accommodation */
export function estimate(metadata: unknown): number {
	const items = itemsOf(metadata);
	const travel = simpleListOf(metadata, "travel");
	const stay = simpleListOf(metadata, "accommodation");
	return [...items, ...travel, ...stay].reduce(
		(sum, i) => sum + (i.cost ?? 0),
		0
	);
}
