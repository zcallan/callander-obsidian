import type { TFile } from "obsidian";
import type { Idea, InsideJoke, LifeGoal, Quote } from "@/types";
import { ContactOperations } from "@/services/ContactOperations";
import { PlanOperations } from "@/services/PlanOperations";
import { asArray, fieldOf, isRecord, toText } from "@/utils/fm";
import { parseLifeGoals } from "@/utils/lifeGoals";
import { parseFunFacts } from "@/utils/contactPage";
import type { LedgerDraft } from "@/utils/draftsMarkdown";

/** Scalar frontmatter keys the page binds directly into string inputs. */
const SCALAR_FIELDS = [
	"name",
	"displayName",
	"shortName",
	"legalName",
	"birthday",
	"relationship",
	"met",
	"notes",
	"date",
	"endDate",
	"location",
	"status",
] as const;

/**
 * The parsed YAML of a contact/plan/group page. Scalars the page binds as
 * strings are typed (coerced once in toContactFrontmatter); collections stay
 * `unknown` and flow through the service readers (ideasOf, eventsOf,
 * itemsOf, ...) that validate their shapes. The index signature carries
 * user-defined custom fields.
 */
export interface ContactFrontmatter {
	name?: string;
	displayName?: string;
	shortName?: string;
	legalName?: string;
	birthday?: string;
	relationship?: string;
	met?: string;
	notes?: string;
	date?: string;
	endDate?: string;
	location?: string;
	status?: string;
	ideas?: unknown;
	events?: unknown;
	drafts?: unknown;
	items?: unknown;
	travel?: unknown;
	accommodation?: unknown;
	bring?: unknown;
	costs?: unknown;
	credits?: unknown;
	costsPaid?: unknown;
	members?: unknown;
	unconfirmedMembers?: unknown;
	interests?: unknown;
	quotes?: unknown;
	insideJokes?: unknown;
	funFacts?: unknown;
	groups?: unknown;
	/** Legacy keys, folded into ideas/events by the in-memory migrations */
	giftIdeas?: unknown;
	interactions?: unknown;
	[key: string]: unknown;
}

/** YAML-shaped unknown → ContactFrontmatter, coercing bound scalars once. */
export function toContactFrontmatter(parsed: unknown): ContactFrontmatter {
	if (!isRecord(parsed)) return {};
	const data = parsed as ContactFrontmatter;
	for (const key of SCALAR_FIELDS) {
		const value = parsed[key];
		if (value != null && typeof value !== "string") {
			data[key] = toText(value);
		}
	}
	return data;
}

/**
 * Which layout a note gets. "other" is a note outside the People, Groups
 * and Plans folders opened here anyway: it gets a person's layout, without
 * the parts that only make sense for someone in People/ (Delete, the
 * last-updated stamp).
 */
export type PageKind = "person" | "group" | "plan" | "other";

/** A draft about this person, and its place in the dashboard's checklist. */
export interface AboutDraft {
	draft: LedgerDraft;
	/** Its index in the dashboard's whole list, which changing it is
	 * addressed by; the position in `aboutDrafts` is only the row it's
	 * drawn in. */
	index: number;
}

/**
 * One note as the page read it: its frontmatter, the sections kept in its
 * body, and what the page has changed since.
 *
 * A model per note shown, bound to the file it was read from. Every write
 * goes through one (persistence.ts) and lands in *that* file, so a write
 * still in flight when the page moves to another note finishes in the note
 * it was made for. When one object held whatever the page was showing,
 * such a write could put one person's data into another's note (CP-B4);
 * now it can't be expressed. Reading the same note again (a sync, an edit
 * elsewhere) refreshes its model in place (reloadModel), so a form left
 * open over the page keeps working on the note as it is now.
 *
 * Handlers take the model they were started on and use it throughout,
 * including after awaits. Code that runs at render time, and the island
 * props that outlive a render, read the page's current one instead.
 */
export class ContactPageModel {
	/**
	 * The frontmatter as last read or written: what a save diffs against
	 * (frontmatterPatch). Null when nothing could be read, so nothing can
	 * be saved over the note.
	 */
	saved: Record<string, unknown> | null;
	/** Saves run one at a time, so each diffs against the one before. */
	saveQueue: Promise<void> = Promise.resolve();
	/**
	 * Quotes as read from the note body. Null means this note has no
	 * `## Quotes` section yet, so its frontmatter is still the source of
	 * truth and a migration is due.
	 */
	bodyQuotes: Quote[] | null = null;
	/** Ideas as read from the note body; null until this note is migrated. */
	bodyIdeas: Idea[] | null = null;
	/** Notes as read from the body's `## Notes` section; null until this
	 * note has one. See notesMarkdown. */
	bodyNotes: string | null = null;
	/**
	 * A plan's own undated drafts, from its `## Drafts` section. Null means
	 * this plan hasn't been migrated yet, so its frontmatter `drafts` list
	 * (filtered to the undated ones) is still the source of truth. Not
	 * meaningful outside a plan file.
	 */
	bodyDrafts: LedgerDraft[] | null = null;
	/** The open drafts about this person, from the dashboard note's
	 * checklist. */
	aboutDrafts: AboutDraft[] = [];
	/** Legacy `giftIdeas` on a note whose ideas already moved to the body —
	 * appended there by migrateIdeasToBody rather than lost. */
	pendingLegacyIdeas: Idea[] = [];

	constructor(
		/** The note this was read from, and every write through it lands in. */
		readonly file: TFile | null,
		readonly kind: PageKind,
		public data: ContactFrontmatter,
		saved: Record<string, unknown> | null
	) {
		this.saved = saved;
	}

	/** Nothing read yet, or the read failed: shows the empty state, and a
	 * save through it writes nothing. */
	static unread(file: TFile | null = null, kind: PageKind = "other") {
		return new ContactPageModel(file, kind, {}, null);
	}

	/** Nothing could be read after all: back to the empty state, where a
	 * save writes nothing. */
	forget() {
		this.data = {};
		this.saved = null;
		this.bodyQuotes = null;
		this.bodyIdeas = null;
		this.bodyNotes = null;
		this.bodyDrafts = null;
		this.aboutDrafts = [];
		this.pendingLegacyIdeas = [];
	}

	/** What the page calls this person or plan in its forms. */
	name(): string {
		return this.data.displayName || this.data.name || "";
	}

	/**
	 * The friend's ideas. The body wins once the note has an `## Ideas`
	 * section; until then the frontmatter list still stands in.
	 *
	 * Unlike the old frontmatter list this is a copy, not a live reference
	 * — callers mutate it and hand it back to writeIdeas rather than
	 * editing in place and saving.
	 */
	ideas(): Idea[] {
		return this.bodyIdeas ?? (asArray(this.data.ideas) as Idea[]);
	}

	/** Quotes still in frontmatter — the pre-migration source. Legacy plain
	 * strings read as `{ text }`. */
	frontmatterQuotes(): Quote[] {
		return asArray(this.data.quotes)
			.map((q): Quote => {
				if (typeof q === "string") return { text: q };
				const context = fieldOf(q, "context");
				return {
					text: toText(fieldOf(q, "text")),
					...(context ? { context: toText(context) } : {}),
				};
			})
			.filter((q) => q.text.length > 0);
	}

	/** The body wins once the note has a Quotes section; until then the
	 * frontmatter list still stands in. */
	quotes(): Quote[] {
		return this.bodyQuotes ?? this.frontmatterQuotes();
	}

	/** Normalized inside-joke list (legacy plain strings read as { text }). */
	insideJokes(): InsideJoke[] {
		return asArray(this.data.insideJokes)
			.map((j): InsideJoke => {
				if (typeof j === "string") return { text: j };
				const context = fieldOf(j, "context");
				return {
					text: toText(fieldOf(j, "text")),
					...(context ? { context: toText(context) } : {}),
				};
			})
			.filter((j) => j.text.length > 0);
	}

	/** Fun facts as a list (a legacy multi-line string splits into items). */
	funFacts(): string[] {
		return parseFunFacts(this.data.funFacts);
	}

	/** The person's life goals, still-open first and completed below. */
	lifeGoals(): LifeGoal[] {
		return parseLifeGoals(this.data.lifeGoals);
	}

	/**
	 * The plan's own undated thoughts, waiting to be sorted — a draft with
	 * a day sits on the Timeline instead (see PlanOperations.timelineOf),
	 * so this is specifically the ones that don't have one yet.
	 *
	 * Body-backed once migrated (`bodyDrafts`); the frontmatter list still
	 * stands in until then — that's what makes the migration lazy.
	 */
	planDrafts(): LedgerDraft[] {
		if (this.bodyDrafts !== null) return this.bodyDrafts;
		// Pre-migration, every frontmatter draft is still open — nothing in
		// the old shape could mark one done.
		return ContactOperations.draftsOf(this.data)
			.filter((d) => !d.date)
			.map((d) => ({ ...d, done: false }));
	}

	/** Category names known to this plan, offered when adding another idea. */
	quickIdeaCategories(): string[] {
		return PlanOperations.quickIdeaCategoriesOf(this.data);
	}

	/** Append to a frontmatter list, creating it when absent. */
	push(key: string, value: unknown) {
		const list = asArray(this.data[key]);
		list.push(value);
		this.data[key] = list;
	}

	/** Splice one entry out of a frontmatter list; empty lists drop the key. */
	removeAt(key: string, index: number) {
		const list = asArray(this.data[key]);
		list.splice(index, 1);
		if (list.length === 0) delete this.data[key];
		else this.data[key] = list;
	}

	/**
	 * Remove one of the plan's frontmatter drafts, addressed by its place in
	 * draftsOf's list — the list every draft index here is counted in.
	 * draftsOf leaves out drafts with no text, so splicing the raw list at
	 * the same index could remove a different draft; this writes back the
	 * list the index came from, as editing one (writeDraft) does.
	 */
	removeDraft(index: number) {
		const list = ContactOperations.draftsOf(this.data);
		list.splice(index, 1);
		if (list.length > 0) this.data.drafts = list;
		else delete this.data.drafts;
	}
}
