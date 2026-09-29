import {
	ItemView,
	WorkspaceLeaf,
	Notice,
	TFile,
	setIcon,
	parseYaml,
	MarkdownRenderer,
	Component,
	type ViewStateResult,
} from "obsidian";
import { createRoot } from "react-dom/client";
// preact/compat/client exports createRoot but not a name for what it
// returns, so the root type is derived from the function itself.
type Root = ReturnType<typeof createRoot>;
import type { ReactNode } from "react";
import { PluginProvider } from "@/ui/PluginContext";
import { AccommodationSection } from "@/ui/sections/AccommodationSection";
import { BringSection } from "@/ui/sections/BringSection";
import { PlanDraftsSection } from "@/ui/sections/PlanDraftsSection";
import { QuickIdeasSection } from "@/ui/sections/QuickIdeasSection";
import { PlanTimelineSection } from "@/ui/sections/PlanTimelineSection";
import { PlanExpensesSection } from "@/ui/sections/PlanExpensesSection";
import { FunFactsSection } from "@/ui/sections/FunFactsSection";
import { LifeGoalsSection } from "@/ui/sections/LifeGoalsSection";
import { QuoteListSection } from "@/ui/sections/QuoteListSection";
import { InterestsSection } from "@/ui/sections/InterestsSection";
import { IdeasSection } from "@/ui/sections/IdeasSection";
import { PersonDraftsSection } from "@/ui/sections/PersonDraftsSection";
import { NotesSection } from "@/ui/sections/NotesSection";
import {
	NativeNotesSection,
	NotesChooser,
} from "@/ui/sections/NativeNotesSection";
import { mountEmbeddedEditor } from "@/components/embeddedMarkdownEditor";
import { GroupMembersSection } from "@/ui/sections/GroupMembersSection";
import { DeleteSection } from "@/ui/sections/DeleteSection";
import {
	DiaryMentionsSection,
	type DiaryMention,
} from "@/ui/sections/DiaryMentionsSection";
import {
	PlanMembersSection,
	type PlanMemberChip,
} from "@/ui/sections/PlanMembersSection";
import { ViewStore } from "@/ui/viewStore";
import type FriendTracker from "@/main";
import { applyPageWidth, observePageRoom } from "@/components/pageWidth";
import { EventTimeline } from "@/components/EventTimeline";
import type {
	ContactWithCountdown,
	EventInfo,
	FriendEvent,
	Idea,
	InsideJoke,
	Interest,
	LifeGoal,
	PlanBringItem,
	Quote,
	Draft,
	Expense,
	Credit,
	PlanItem,
	PlanQuickIdea,
	PlanSimpleItem,
	PlanTimelineEntry,
} from "@/types";
import { AddFieldModal } from "@/modals/AddFieldModal";
import { NoteSuggest } from "@/components/NoteSuggest";
import { LifeGoalModal } from "@/modals/LifeGoalModal";
import { LifeGoalViewModal } from "@/modals/LifeGoalViewModal";
import { parseLifeGoals } from "@/utils/lifeGoals";
import { fieldHelp, fieldLabel, type FieldHelp } from "@/utils/fieldLabel";
import {
	formatLinkField,
	linkLabel,
	linkTarget,
	parseLinkField,
} from "@/utils/linkField";
import { createBirthdayPrecisionInput } from "@/components/BirthdayInput";
import { createFlexDateInput } from "@/components/FlexDateInput";
import { EventModal } from "@/modals/EventModal";
import { ResurfaceModal } from "@/modals/ResurfaceModal";
import { CONFIRM_PREVIEW_CHARS, ConfirmModal } from "@/modals/ConfirmModal";
import { PlanShareModal } from "@/modals/PlanShareModal";
import { PlanQuickIdeaModal } from "@/modals/PlanQuickIdeaModal";
import { PlanQuickIdeaViewModal } from "@/modals/PlanQuickIdeaViewModal";
import { ContactSuggestModal, QuickIdeaModal } from "@/modals/QuickIdeaModal";
import {
	FriendTrackerView,
	VIEW_TYPE_FRIEND_TRACKER,
} from "@/views/FriendTrackerView";
import {
	STANDARD_FIELDS,
	SYSTEM_FIELDS,
	LINKABLE_FIELDS,
	IDEA_CATEGORIES,
	IdeaCategory,
	INTEREST_CATEGORIES,
	InterestCategory,
	EventType,
	TRAVEL_TYPES,
} from "@/constants";
import { PlanOperations } from "@/services/PlanOperations";
import { PlanDetailsModal } from "@/modals/PlanDetailsModal";
import { AddPlanMemberModal } from "@/modals/AddPlanMemberModal";
import { PlanItemModal } from "@/modals/PlanItemModal";
import { PlanSimpleItemModal } from "@/modals/PlanSimpleItemModal";
import { PlanTimelineViewModal } from "@/modals/PlanTimelineViewModal";
import {
	buildPlanShareText,
	formatPlanDateRange,
	type PlanShareDetail,
} from "@/utils/planShare";
import {
	formatTimelineDay,
} from "@/utils/planFormat";
import { shortenPeopleList } from "@/utils/nameFormat";
import { formatDate } from "@/utils/dateFormat";
import { ContactOperations } from "@/services/ContactOperations";
import { PlanDraftViewModal } from "@/modals/PlanDraftViewModal";
import { resolvePeopleInfo, type PersonInfo } from "@/utils/people";
import {
	IDEA_SHARE_DEFAULTS,
	IDEA_SHARE_FIELDS,
	buildIdeaShareText,
} from "@/utils/ideaShare";
import {
	STAY_SHARE_DEFAULTS,
	STAY_SHARE_FIELDS,
	buildStayShareText,
} from "@/utils/stayShare";
import {
	buildExpenseShareText,
	shareDefaultsFor,
	shareFieldsFor,
	type ExpenseShareScope,
} from "@/utils/expenseShare";
import {
	breakdownFor,
	creditsOf,
	expensesOf,
	setPaidOn,
	settleAllFor,
} from "@/utils/expenseMath";
import { ScheduleFieldOptions } from "@/modals/scheduleFields";
import { InterestModal } from "@/modals/InterestModal";
import { ExpenseModal } from "@/modals/ExpenseModal";
import { ExpenseViewModal } from "@/modals/ExpenseViewModal";
import { ExpenseBreakdownModal } from "@/modals/ExpenseBreakdownModal";
import { ShareTextModal } from "@/modals/ShareTextModal";
import { CreditModal } from "@/modals/CreditModal";
import { NoteInputModal } from "@/modals/NoteInputModal";
import { FunFactsModal } from "@/modals/FunFactsModal";
import { QuoteModal } from "@/modals/QuoteModal";
import { InsideJokeModal } from "@/modals/InsideJokeModal";
import {
	formatFlexDate,
	formatTimeSince,
	isExactFlexDate,
	monthName,
	parseFlexDate,
	todayISO,
} from "@/utils/flexdate";
import { asArray, fieldOf, isRecord, toText } from "@/utils/fm";
import {
	applyFrontmatterPatch,
	frontmatterPatch,
	isEmptyPatch,
	snapshotFrontmatter,
} from "@/utils/frontmatterPatch";
import {
	joinFrontmatter,
	parseQuotesSection,
	splitFrontmatter,
} from "@/utils/quotesMarkdown";
import { parseIdeasSection } from "@/utils/ideasMarkdown";
import {
	PAGE_DRAFTS_SECTION,
	findDraft,
	parseDraftsSection,
	type LedgerDraft,
} from "@/utils/draftsMarkdown";
import {
	adoptNotes,
	normalizeNotes,
	parseNotesSection,
	rescueDraftsFromNotes,
} from "@/utils/notesMarkdown";
import {
	isoDateOf,
	isoDay,
	MAX_DAY_WALK,
	wholeDaysBetween,
} from "@/utils/dates";
import { formatCount, truncate } from "@/utils/text";
import {
	birthFlower,
	birthstone,
	chineseZodiac,
	zodiacSign,
} from "@/utils/birthTrivia";

export const VIEW_TYPE_CONTACT_PAGE = "contact-page-view";

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
 * strings are typed (coerced once in normalizeFrontmatter); collections stay
 * `unknown` and flow through the service readers (ideasOf, eventsOf,
 * itemsOf, ...) that validate their shapes. The index signature carries
 * user-defined custom fields.
 */
interface ContactFrontmatter {
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
function toContactFrontmatter(parsed: unknown): ContactFrontmatter {
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

/** How long the page ignores modify events after its own write, so it
 * doesn't reload on top of itself. The frontmatter save waits longer:
 * processFrontMatter's write lands later than a plain one. */
const OWN_WRITE_GRACE_MS = 1000;
const FRONTMATTER_WRITE_GRACE_MS = 1500;

/** The notes box saves this long after the last keystroke. */
const NOTES_AUTOSAVE_MS = 800;

/** A notice with a button in it stays up long enough to reach the button. */
const ACTION_NOTICE_MS = 8000;

export class ContactPageView extends ItemView {
	private _file: TFile | null = null;
	private contactData: ContactFrontmatter = {};
	/**
	 * The note `contactData` was read from. `_file` moves to the next note
	 * as soon as navigation starts, before that note has been read — a save
	 * in between would otherwise write one note's data into the other.
	 */
	private dataFile: TFile | null = null;
	/** The frontmatter as this page last read or wrote it — what a save
	 * diffs against (see saveContactData). */
	private savedFrontmatter: Record<string, unknown> = {};
	/** Saves run one at a time, so each diffs against the one before. */
	private saveQueue: Promise<void> = Promise.resolve();
	/** Widened for this view only, until it closes. */
	private pageWide = false;
	private eventTimeline: EventTimeline;
	public plugin: FriendTracker;
	private lastIdeaCategory: IdeaCategory = "gift";
	private lastInterestCategory: InterestCategory = "hobbies";
	// The raw-markdown accordion, collapsed by default
	private expandedMarkdownSection = false;
	/** Guards against reacting to our own writes */
	private writingUntil = 0;
	/**
	 * React islands for the plan sections that have been ported, keyed by
	 * slot. Created once and kept for the life of the view — `render()`
	 * detaches these hosts and puts them back rather than remaking them, so
	 * React keeps rendering into the same node and its subscriptions never
	 * lapse. See DashboardView, which does the same. Torn down in onClose.
	 */
	private islands = new Map<string, { host: HTMLElement; root: Root }>();
	/**
	 * Bumped whenever `contactData` has been reloaded or written, so the
	 * islands re-read it at exactly the moments the imperative sections
	 * around them are redrawn. See ViewStore for why this rather than
	 * useVaultVersion.
	 */
	private store = new ViewStore();
	/**
	 * Quotes as read from the note body. Null means this note has no
	 * `## Quotes` section yet, so its frontmatter is still the source of
	 * truth and a migration is due.
	 */
	private bodyQuotes: Quote[] | null = null;
	/** Ideas as read from the note body; null until this note is migrated. */
	private bodyIdeas: Idea[] | null = null;
	/**
	 * The open drafts about this person, from the checklist in the dashboard
	 * note. `index` is each one's place in that whole list, which is what
	 * changing it is addressed by — the position in this array is only the
	 * row it's drawn in.
	 */
	private aboutDrafts: Array<{ draft: LedgerDraft; index: number }> = [];
	/**
	 * A plan's own undated drafts, from its `## Drafts` section. Null means
	 * this plan hasn't been migrated yet, so its frontmatter `drafts` list
	 * (filtered to the undated ones) is still the source of truth. Not
	 * meaningful outside a plan file.
	 */
	private bodyDrafts: LedgerDraft[] | null = null;
	/** Notes as read from the body's `## Notes` section; null until this
	 * note has one. See notesMarkdown. */
	private bodyNotes: string | null = null;
	/**
	 * Notes typed in the native editor and not yet written. It writes as you
	 * go rather than on leaving, so the edit waits here for a pause in the
	 * typing. It remembers its file: the page can move on to another note
	 * before the timer fires, and the text belongs to the one it was typed in.
	 */
	private notesDraft: { file: TFile; text: string; timer: number } | null =
		null;
	/** Legacy `giftIdeas` on a note whose ideas already moved to the body —
	 * appended there by migrateIdeasToBody rather than lost. */
	private pendingLegacyIdeas: Idea[] = [];

	/** This page's events, derived from the Events/ files that link here. */
	private eventsList(): EventInfo[] {
		return this._file
			? this.plugin.eventOperations.eventsFor(this._file)
			: [];
	}

	/**
	 * The friend's ideas. The body wins once the note has an `## Ideas`
	 * section; until then the frontmatter list still stands in.
	 *
	 * Unlike the old frontmatter list this is a copy, not a live reference
	 * — callers mutate it and hand it back to writeIdeasToBody rather than
	 * editing in place and saving.
	 */
	private ideasList(): Idea[] {
		return this.bodyIdeas ?? (asArray(this.contactData.ideas) as Idea[]);
	}

	/** Rewrite just the Ideas section, leaving the rest of the note —
	 * frontmatter included — exactly as it was. */
	private async writeIdeasToBody(ideas: Idea[]): Promise<void> {
		const file = this._file;
		if (!file) return;
		this.writingUntil = Date.now() + OWN_WRITE_GRACE_MS;
		await this.plugin.contactOperations.writeIdeas(file, ideas);
		// Only if the page is still on that note — see writeNotesToBody.
		if (this._file === file) this.bodyIdeas = ideas;
	}

	/** Rewrite just the notes, leaving the generated sections — and the
	 * frontmatter — exactly as they were. */
	private async writeNotesToBody(
		notes: string,
		file: TFile | null = this._file
	): Promise<void> {
		if (!file) return;
		this.writingUntil = Date.now() + OWN_WRITE_GRACE_MS;
		await this.plugin.contactOperations.writeNotes(file, notes);
		// Only if the page is still showing that note. Notes save on blur,
		// and following a link out of the page blurs them — so the view can
		// be on the next note by the time this write lands, and adopting
		// these notes there would show one person's notes on another.
		if (this._file === file) this.bodyNotes = normalizeNotes(notes);
	}

	/**
	 * Give the note its `## Notes` section: the frontmatter `notes` value it
	 * used to keep, and any prose already written in the body, gathered
	 * under the heading at the end (adoptNotes). Body first, key cleared only
	 * on success — the same order the ideas move uses — and adoptNotes spots
	 * a value already carried over, so a crash between the two writes can't
	 * duplicate it on the next load.
	 *
	 * The frontmatter value leads, which is where it sat on screen: the
	 * Notes box came before the markdown.
	 *
	 * `body` is what setFile read; it only decides whether there's anything
	 * to do. The write itself works from the file as it is by then, since
	 * the ideas and quotes moves may have just rewritten it.
	 */
	private async migrateNotesToBody(body: string): Promise<void> {
		const file = this._file;
		if (!file) return;
		const older =
			this.contactData.notes === undefined
				? ""
				: toText(this.contactData.notes);
		if (adoptNotes(body, older) !== body) {
			this.writingUntil = Date.now() + OWN_WRITE_GRACE_MS;
			let notes: string | null = null;
			await this.app.vault.process(file, (content) => {
				const split = splitFrontmatter(content);
				const next = adoptNotes(split.body, older);
				notes = parseNotesSection(next);
				return joinFrontmatter(split.frontmatter, next);
			});
			if (this._file !== file) return;
			this.bodyNotes = notes;
		}
		if (this.contactData.notes === undefined) return;
		delete this.contactData.notes;
		await this.saveContactData(false);
	}

	/**
	 * Move this note's ideas out of frontmatter and into the body, once.
	 * Body first, frontmatter keys cleared only on success — so a failure
	 * in between leaves the data in both places, the body wins next read,
	 * and the stale keys are cleared then.
	 */
	private async migrateIdeasToBody(): Promise<void> {
		if (!this._file) return;
		const hasStaleKeys =
			this.contactData.ideas !== undefined ||
			this.contactData.giftIdeas !== undefined;

		if (this.bodyIdeas !== null) {
			// Already migrated. A legacy `giftIdeas` key found now has
			// never been folded in, so it's appended; a stale `ideas` key
			// is just a crash between the two writes below, and the body
			// already holds those — dropping it can't lose anything.
			if (this.pendingLegacyIdeas.length > 0) {
				await this.writeIdeasToBody([
					...this.bodyIdeas,
					...this.pendingLegacyIdeas,
				]);
				this.pendingLegacyIdeas = [];
			}
			if (hasStaleKeys) {
				delete this.contactData.ideas;
				delete this.contactData.giftIdeas;
				await this.saveContactData(false);
			}
			return;
		}

		const ideas = asArray(this.contactData.ideas) as Idea[];
		if (ideas.length === 0) return;
		await this.writeIdeasToBody(ideas);
		delete this.contactData.ideas;
		delete this.contactData.giftIdeas;
		await this.saveContactData(false);
	}

	/**
	 * Read the drafts about this person from the dashboard note. Plans keep
	 * theirs in their own frontmatter — those carry a day, and feed the
	 * plan's timeline — so this is for everyone else.
	 */
	private async loadAboutDrafts(): Promise<void> {
		const file = this._file;
		if (!file || this.isPlanFile()) {
			this.aboutDrafts = [];
			return;
		}
		const ops = this.plugin.contactOperations;
		const drafts = await ops.readDrafts();
		if (this._file !== file) return;
		this.aboutDrafts = drafts
			.map((draft, index) => ({ draft, index }))
			.filter(
				({ draft }) =>
					!draft.done && ops.draftAbout(draft)?.path === file.path
			);
	}

	/** Reload the drafts and redraw — after any change to the checklist. */
	private async refreshAboutDrafts(): Promise<void> {
		await this.loadAboutDrafts();
		this.render();
	}

	/** Append to a frontmatter list, creating it when absent. */
	private pushToList(key: string, value: unknown) {
		const list = asArray(this.contactData[key]);
		list.push(value);
		this.contactData[key] = list;
	}

	/** Splice one entry out of a frontmatter list; empty lists drop the key. */
	private removeFromList(key: string, index: number) {
		const list = asArray(this.contactData[key]);
		list.splice(index, 1);
		if (list.length === 0) delete this.contactData[key];
		else this.contactData[key] = list;
	}

	/**
	 * Remove one of the plan's frontmatter drafts, addressed by its place in
	 * draftsOf's list — the list every draft index here is counted in.
	 * draftsOf leaves out drafts with no text, so splicing the raw list at
	 * the same index could remove a different draft; this writes back the
	 * list the index came from, as editing one (writeDraft) does.
	 */
	private removeDraft(index: number) {
		const list = ContactOperations.draftsOf(this.contactData);
		list.splice(index, 1);
		if (list.length > 0) this.contactData.drafts = list;
		else delete this.contactData.drafts;
	}

	constructor(leaf: WorkspaceLeaf, plugin: FriendTracker) {
		super(leaf);
		this.plugin = plugin;
		this.eventTimeline = new EventTimeline(this);
		// Participate in tab history so back/forward arrows work
		this.navigation = true;
	}

	async onOpen() {
		// Once for the life of the view, not per render — it only has to
		// know whether there's room beside the column.
		this.register(observePageRoom(this));
		// The islands read settings live, but only redraw on a store bump —
		// so the Notes editor setting takes effect without a reopen.
		this.registerEvent(
			this.plugin.events.on("settings-changed", () => this.store.bump())
		);
		// Reload when this record changes on disk (e.g. an iCloud sync from
		// another device), so an edit here can never overwrite fresher data
		// with a stale in-memory copy.
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (
					this._file &&
					file.path === this._file.path &&
					Date.now() > this.writingUntil &&
					!this.isEditingInView()
				) {
					void this.setFile(this._file);
				}
			})
		);

		// The timeline derives from Events/ files — re-render when any of
		// them change, so an edit made elsewhere (dashboard, another pane)
		// shows up here without a reopen.
		const eventsTouched = (path: string) =>
			this.plugin.eventOperations.isEventFile(path);
		const rerenderOnEvent = (path: string, oldPath?: string) => {
			if (!this._file) return;
			if (!eventsTouched(path) && !(oldPath && eventsTouched(oldPath))) {
				return;
			}
			if (this.isEditingInView()) return;
			this.render();
		};
		this.registerEvent(
			this.app.vault.on("modify", (f) => rerenderOnEvent(f.path))
		);
		this.registerEvent(
			this.app.vault.on("create", (f) => rerenderOnEvent(f.path))
		);
		this.registerEvent(
			this.app.vault.on("delete", (f) => rerenderOnEvent(f.path))
		);
		this.registerEvent(
			this.app.vault.on("rename", (f, old) =>
				rerenderOnEvent(f.path, old)
			)
		);
		// The events are read out of the metadata cache, which reindexes
		// *after* the vault event — so without this a write lands on screen
		// as the pre-write value. See registerVaultRefresh.
		this.registerEvent(
			this.app.metadataCache.on("changed", (f) => rerenderOnEvent(f.path))
		);

		// This person's drafts are lines in the dashboard note, not in their
		// own file — so a change there (an edit in the note itself, a sync,
		// Claude adding one) has to reach this page by its own route. Only
		// redrawn when what this page shows actually changed, since the
		// dashboard note is written for plenty of unrelated reasons.
		const refreshDrafts = (path: string) => {
			if (
				!this._file ||
				this.isPlanFile() ||
				path !== this.plugin.contactOperations.getDashboardFilePath() ||
				this.isEditingInView()
			) {
				return;
			}
			const before = JSON.stringify(this.aboutDrafts);
			void this.loadAboutDrafts().then(() => {
				if (JSON.stringify(this.aboutDrafts) !== before) this.render();
			});
		};
		this.registerEvent(
			this.app.vault.on("modify", (f) => refreshDrafts(f.path))
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (f) => refreshDrafts(f.path))
		);
	}

	/** True if an input/textarea inside this view has focus (mid-edit) */
	private isEditingInView(): boolean {
		const active = document.activeElement as HTMLElement | null;
		return (
			!!active &&
			this.containerEl.contains(active) &&
			(["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) ||
				// The native Notes editor, typing mid-sentence.
				active.isContentEditable)
		);
	}

	getViewType(): string {
		return VIEW_TYPE_CONTACT_PAGE;
	}

	getDisplayText(): string {
		return this._file?.basename || "Contact";
	}

	get file() {
		return this._file;
	}

	async setState(state: unknown, result: ViewStateResult) {
		const filePath = fieldOf(state, "filePath");
		const file =
			typeof filePath === "string"
				? this.app.vault.getFileByPath(filePath)
				: null;
		const fileChanged = !!file && file.path !== this._file?.path;
		if (file) {
			await this.setFile(file);
		}
		// Friend → friend navigation keeps the same view type, and Obsidian
		// only records tab history for same-type navigation when the view
		// reports that its state changed (as FileView does for files).
		if (fileChanged && result) {
			result.history = true;
			// `layout` isn't in the typed API, but same-type navigation only
			// lands in tab history when it's set — keep the write.
			(result as ViewStateResult & { layout?: boolean }).layout = true;
		}
		await super.setState(state, result);
	}

	getState() {
		return {
			type: VIEW_TYPE_CONTACT_PAGE,
			filePath: this._file?.path,
		};
	}

	async setFile(file: TFile) {
		// Before the page moves on, so a held edit is written — and stamped
		// — against the note it was typed in.
		await this.flushNotesDraft();
		this._file = file;
		const currentFilePath = file.path;
		try {
			const content = await this.app.vault.cachedRead(file);
			// Only update if this._file is still the same file
			if (this._file?.path !== currentFilePath) return;
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			const parsed: unknown = yamlMatch ? parseYaml(yamlMatch[1]) : {};
			this.contactData = toContactFrontmatter(parsed);
			// Before the in-memory migrations below, so what they change
			// counts as a change and reaches disk with the next save.
			this.dataFile = file;
			this.savedFrontmatter = snapshotFrontmatter(this.contactData);
			// Quotes live in the body; the same read serves both, so this
			// costs no extra I/O.
			let body = splitFrontmatter(content).body;
			if (this.isPlanFile() && rescueDraftsFromNotes(body) !== body) {
				body = await this.rescuePlanDrafts(file);
				if (this._file?.path !== currentFilePath) return;
			}
			this.bodyQuotes = parseQuotesSection(body);
			this.bodyIdeas = parseIdeasSection(body);
			this.bodyNotes = parseNotesSection(body);
			this.bodyDrafts = this.isPlanFile()
				? parseDraftsSection(body, PAGE_DRAFTS_SECTION)
				: null;
			this.migrateLegacyGiftIdeas();
			this.migratePlanStructure();
			// Each step works on this page's current note and data, so the
			// chain stops as soon as the page has moved on to another note —
			// the next step would otherwise carry this note's ideas, quotes or
			// drafts into that one.
			const stillHere = () => this._file === file;
			await this.migrateQuotesToBody();
			if (!stillHere()) return;
			await this.migrateIdeasToBody();
			if (!stillHere()) return;
			await this.migrateNotesToBody(body);
			if (!stillHere()) return;
			if (this.isPlanFile()) {
				await this.migratePlanDraftsToBody();
			} else if (this.contactData.drafts !== undefined) {
				// A note that synced in still holding drafts in frontmatter
				// is carried to the dashboard's checklist before it's read
				// from there.
				await this.plugin.contactOperations.migrateDraftsToDashboard();
			}
			if (!stillHere()) return;
			await this.loadAboutDrafts();
		} catch (error) {
			console.error(`Error reading contact file ${file.path}:`, error);
			this.contactData = {};
			// Nothing was read, so nothing can be saved over the note.
			this.dataFile = null;
			this.savedFrontmatter = {};
			this.bodyQuotes = null;
			this.bodyIdeas = null;
			this.bodyNotes = null;
			this.bodyDrafts = null;
			this.aboutDrafts = [];
		}
		// Only render if still the same file
		if (this._file?.path === currentFilePath) {
			this.render();
		}
	}

	/**
	 * The host node for a ported section, ready to be placed in the layout.
	 *
	 * Rendered once on creation and never again from here — React owns its
	 * own updates from that point, driven by the store bump. Re-rendering on
	 * every page render would tie React's update timing back to the
	 * imperative path this is meant to escape.
	 */
	private island(key: string, node: ReactNode): HTMLElement {
		const existing = this.islands.get(key);
		if (existing) return existing.host;

		const host = createDiv({ cls: "callander-react-root" });
		const root = createRoot(host);
		root.render(
			<PluginProvider plugin={this.plugin}>{node}</PluginProvider>
		);
		this.islands.set(key, { host, root });
		return host;
	}

	private unmountIslands() {
		const roots = [...this.islands.values()];
		this.islands.clear();
		// Unmounting synchronously inside a React render pass is an error,
		// and onClose can be reached from one — defer so teardown always
		// lands between renders.
		window.setTimeout(() => roots.forEach(({ root }) => root.unmount()), 0);
	}

	async onClose() {
		// Its dismiss handlers live on the document, so they would
		// outlive this view if the popover were simply left open.
		this.closeFieldHelp();
		await this.flushNotesDraft();
		this.unmountIslands();
	}

	render() {
		this.renderBody();
		// Wrapped after the fact rather than at each of renderBody's exits.
		// Re-parenting moves the island hosts with everything else; a React
		// root stays attached to its own element, so moving that element
		// doesn't disturb it.
		applyPageWidth(
			this.contentEl,
			this.plugin,
			this.pageWide,
			() => {
				this.pageWide = true;
				this.render();
			}
		);
	}

	private renderBody() {
		const container = this.contentEl;
		// Anchored into DOM this is about to discard, and its dismiss
		// handlers are on the document — closing first keeps them from
		// pointing at a detached node.
		this.closeFieldHelp();
		container.empty();
		// The imperative DOM above is gone; tell the islands to re-read the
		// data they're about to be re-attached with.
		this.store.bump();

		if (!this.contactData || !this.contactData.name) {
			container.createDiv({
				text: "No contact data available",
				cls: "contact-empty-state",
			});
			return;
		}

		// Header with name
		const header = container.createDiv({
			cls: "contact-page-header",
		});
		const nameContainer = header.createDiv({
			cls: "contact-name-container",
		});
		this.renderNameSection(nameContainer);

		// Plans: date/location (+ "Edit details") under "Last updated"; actions
		// top-right (Quick note · Mark as done), stacked below on mobile.
		if (this.isPlanFile()) {
			header.addClass("plan-page-header");
			this.renderPlanMetaLines(nameContainer);

			const actions = header.createDiv({
				cls: "contact-header-actions plan-page-actions",
			});
			const noteButton = actions.createEl("button", {
				cls: "callander-button contact-header-action",
				attr: { "aria-label": "Quick note" },
			});
			setIcon(noteButton, "pencil-line");
			noteButton.createSpan({ text: "Quick note" });
			noteButton.addEventListener("click", () => this.openQuickNote());

			this.createPlanDoneButton(actions);
		}

		// Quick actions, top-right (friends only)
		if (!this.isGroupFile() && !this.isPlanFile()) {
			const actions = header.createDiv({
				cls: "contact-header-actions",
			});
			const action = (
				icon: string,
				label: string,
				onClick: () => void | Promise<void>
			) => {
				const btn = actions.createEl("button", {
					cls: "callander-button contact-header-action",
				});
				setIcon(btn, icon);
				btn.createSpan({ text: label });
				btn.addEventListener("click", () => void onClick());
			};
			action("lightbulb", "Add idea", () => this.openAddIdeaModal());
			action("milestone", "Add event", () => this.openAddEventModal());
			action("pencil-line", "Quick note", () => this.openQuickNote());
		}

		// Plans are their own page shape: members, buckets, notes
		if (this.isPlanFile()) {
			container.appendChild(
				this.island(
					"plan-drafts",
					<PlanDraftsSection
						store={this.store}
						drafts={() => this.planDrafts().map((d) => d.text)}
						isGenerated={(i) => this.draftIsGenerated(i)}
						onMakeIdea={(index, text) =>
							this.promotePlanDraft(index, text)
						}
						onMakeEvent={(text) => this.promotePlanDraftToEvent(text)}
						onEdit={(index, text) => this.editPlanDraft(index, text)}
						onDone={(index, text) =>
							void this.completePlanDraft(index, text)
						}
					/>
				)
			);

			const planContent = container.createDiv({
				cls: "contact-content contact-content-stacked",
			});
			/**
			 * One section of the stacked plan page.
			 *
			 * Pass `collapseId` and it folds, remembering its state across
			 * plans and restarts — the view is rebuilt from scratch on every
			 * vault event, so anything held in memory would spring back open.
			 *
			 * Returns whatever the caller should append content to: the
			 * section itself when it's fixed, the foldable body when it
			 * isn't. Both sit inside `.contact-stack-section`, so a caller
			 * reaching back up for the header can `closest()` either way.
			 */
			const planSection = (
				icon: string,
				label: string,
				collapseId?: string,
				/** How many items are inside — shown while it's folded, so
				 * a closed section says what's in it without being opened.
				 * Zero is worth saying too: "nothing here yet" is the
				 * answer you opened the section to find. */
				count?: number
			) => {
				const wrap = planContent.createDiv({
					cls: "contact-stack-section",
				});
				const header = wrap.createDiv({
					cls: "contact-stack-header",
				});
				setIcon(
					header.createSpan({ cls: "contact-stack-header-icon" }),
					icon
				);
				header.createSpan({ text: label });
				if (!collapseId) return wrap;

				if (count !== undefined) {
					// The dashboard's own badge, so a count reads the same
					// wherever it appears. CSS drops it once the section is
					// open — see .plan-accordion.is-open .plan-accordion-count.
					header.createSpan({
						cls: "dashboard-count-badge plan-accordion-count",
						text: String(count),
					});
				}

				wrap.addClass("plan-accordion");
				header.addClass("plan-accordion-header");
				// Last in the header, and `margin-left: auto` carries it to
				// the far edge — anything a caller adds afterwards is
				// inserted ahead of it rather than beyond it.
				setIcon(
					header.createSpan({ cls: "plan-accordion-chevron" }),
					"chevron-down"
				);
				const body = wrap.createDiv({ cls: "plan-accordion-body" });

				const collapsed = () =>
					this.collapsedPlanSections().includes(collapseId);
				const apply = () => wrap.toggleClass("is-open", !collapsed());
				apply();
				header.addEventListener("click", (event) => {
					// Headers can carry controls of their own — the
					// timeline's "Copy as text" — and folding the section
					// out from under a click meant for one of those is not
					// what anybody pressed.
					const target = event.target as HTMLElement | null;
					if (target?.closest("button")) return;
					const current = this.collapsedPlanSections();
					this.plugin.settings.planSectionsCollapsed = collapsed()
						? current.filter((id) => id !== collapseId)
						: [...current, collapseId];
					apply();
					void this.plugin.saveSettings();
				});
				return body;
			};

			planSection("users", `Who's in (${this.planMemberCount()})`).appendChild(
				this.island(
					"plan-members",
					<PlanMembersSection
						store={this.store}
						yourName={() => this.plugin.settings.yourName}
						members={() => this.planMemberChips("members")}
						unconfirmed={() =>
							this.planMemberChips("unconfirmedMembers")
						}
						onOpen={(path) =>
							void this.app.workspace.openLinkText(path, "", false)
						}
						onRemove={(index) =>
							void this.removePlanEntry("members", index)
						}
						onConfirm={(index) => void this.confirmPlanMember(index)}
						onRemoveUnconfirmed={(index) =>
							void this.removePlanEntry("unconfirmedMembers", index)
						}
						onAdd={() => void this.openAddPlanMember()}
					/>
				)
			);
			planSection(
				"lightbulb",
				"Ideas",
				"ideas",
				PlanOperations.quickIdeasOf(this.contactData).length
			).appendChild(
				this.island(
					"quick-ideas",
					<QuickIdeasSection
						store={this.store}
						ideas={() =>
							PlanOperations.quickIdeasOf(this.contactData)
						}
						shortenPeople={(people) => this.shortenPlanPeople(people)}
						onOpen={(index) => this.openQuickIdeaView(index)}
						onAdd={() => this.openQuickIdeaModal(null, null)}
						onCopy={() => this.openIdeaShare()}
					/>
				)
			);
			const timelineWrap = planSection(
				"calendar-clock",
				"Timeline",
				"timeline",
				PlanOperations.timelineOf(this.contactData).length
			);
			timelineWrap.appendChild(
				this.island(
					"plan-timeline",
					<PlanTimelineSection
						store={this.store}
						entries={() =>
							PlanOperations.timelineOf(this.contactData)
						}
						undated={() =>
							PlanOperations.undatedIdeaEntries(this.contactData)
						}
						rangeDays={() => this.planRangeDays()}
						shortenPeople={(people) => this.shortenPlanPeople(people)}
						onOpen={(entry) => this.openTimelineEntry(entry)}
						onEdit={(entry) => this.editTimelineEntry(entry)}
						onDelete={(entry) =>
							this.confirmDeleteTimelineEntry(entry)
						}
						onAddItem={(day) =>
							this.openPlanIdeaModal(null, null, day)
						}
						onAddTravel={(day) =>
							this.openPlanTravelModal(null, null, day)
						}
						onCopy={() => this.openPlanShare()}
					/>
				)
			);
			// Ported to React — the host is created once and re-attached on
			// every render, so the section keeps its own subscription.
			planSection(
				"bed",
				"Accommodation",
				"accommodation",
				PlanOperations.simpleListOf(this.contactData, "accommodation")
					.length
			).appendChild(
				this.island(
					"accommodation",
					<AccommodationSection
						store={this.store}
						items={() =>
							PlanOperations.simpleListOf(
								this.contactData,
								"accommodation"
							)
						}
						onOpen={(index, item) =>
							this.openPlanAccommodationModal(index, item)
						}
						onCopy={() => this.openStayShare()}
					/>
				)
			);
			planSection(
				"backpack",
				"What to bring",
				"bring",
				PlanOperations.bringOf(this.contactData).length
			).appendChild(
				this.island(
					"bring",
					<BringSection
						store={this.store}
						items={() => PlanOperations.bringOf(this.contactData)}
						onToggle={(index, done) =>
							void this.updateBringItem(index, done)
						}
						onRemove={(index) => void this.removeBringItem(index)}
						onAdd={(text) => void this.addBringItem(text)}
					/>
				)
			);
			planSection(
				"dollar-sign",
				"Cost breakdown",
				"costs",
				// Both halves of what the section lists.
				expensesOf(this.contactData).length +
					creditsOf(this.contactData).length
			).appendChild(
				this.island(
					"plan-expenses",
					<PlanExpensesSection
						store={this.store}
						costs={() => expensesOf(this.contactData)}
						credits={() => creditsOf(this.contactData)}
						participants={() => this.planParticipants()}
						yourName={() => this.plugin.settings.yourName}
						// Read, never written any more: settling moved into
						// the ledger, where it changes the figure rather than
						// only striking it through. Existing vaults still
						// carry the flag, and dropping it would un-settle
						// whoever was ticked off under the old scheme.
						paid={() =>
							Array.isArray(this.contactData.costsPaid)
								? this.contactData.costsPaid.map((v) => toText(v))
								: []
						}
						onOpenCost={(index, cost) => this.openCostView(index, cost)}
						onOpenCredit={(index, credit) =>
							this.openCreditModal(index, credit)
						}
						onBreakdown={(person) => this.openBreakdown(person)}
						onAddExpense={() => this.openAddExpense()}
						onAddCredit={() => this.openCreditModal(null, null)}
						onCopy={() => this.openCostShare({ kind: "all" })}
					/>
				)
			);
			// A plan's body holds nothing generated, so its Notes *are* its
			// markdown — the "Links & details" render that used to follow
			// would show the same text a second time. Its "Edit markdown"
			// lives on in Notes.
			planSection("pencil", "Notes").appendChild(this.notesIsland());
			return;
		}

		// Friends get the attribute fields; groups get a members list instead
		if (this.isGroupFile()) {
			const membersSection = container.createDiv({
				cls: "contact-info-section",
			});
			membersSection.appendChild(
				this.island(
					"group-members",
					<GroupMembersSection
						groupName={() =>
							this._file?.basename.toLowerCase() ?? ""
						}
						onOpen={(path) =>
							void this.app.workspace.openLinkText(path, "", false)
						}
						onRemove={(contact) =>
							void this.removeGroupMember(contact)
						}
						onAdd={(candidates) => this.openAddGroupMember(candidates)}
					/>
				)
			);
		} else {
			// "General" — a collapsed accordion of the attribute fields
			const infoWrap = container.createDiv({
				cls: "contact-stack-section plan-accordion contact-general-accordion",
			});
			const infoHeader = infoWrap.createDiv({
				cls: "contact-stack-header plan-accordion-header",
			});
			setIcon(
				infoHeader.createSpan({ cls: "contact-stack-header-icon" }),
				"user"
			);
			infoHeader.createSpan({
				cls: "plan-accordion-label",
				text: "About",
			});
			setIcon(
				infoHeader.createSpan({ cls: "plan-accordion-chevron" }),
				"chevron-down"
			);
			const infoBody = infoWrap.createDiv({
				cls: "plan-accordion-body",
			});
			const infoSection = infoBody.createDiv({
				cls: "contact-info-section",
			});
			this.renderInfoSection(infoSection);
			// Persisted rather than per-view: this page is rebuilt from
			// scratch on every open and on every vault event, so in-memory
			// state would spring back closed the moment anything changed.
			// Same treatment as the dashboard's draftsCollapsed.
			infoWrap.toggleClass("is-open", this.plugin.settings.aboutExpanded);
			infoHeader.addEventListener("click", () => {
				const open = !this.plugin.settings.aboutExpanded;
				this.plugin.settings.aboutExpanded = open;
				infoWrap.toggleClass("is-open", open);
				void this.plugin.saveSettings();
			});
		}

		// Drafts awaiting triage sit above everything — they're unfinished
		container.appendChild(
			this.island(
				"person-drafts",
				<PersonDraftsSection
					store={this.store}
					drafts={() => this.aboutDrafts.map((a) => a.draft.text)}
					isGenerated={(i) => !!this.aboutDrafts[i]?.draft.generated}
					onMakeIdea={(index, text) =>
						this.promoteDraftToIdea(index, text)
					}
					onEdit={(index, text) => this.editDraft(index, text)}
					onDone={(index) => void this.completeAboutDraft(index)}
				/>
			)
		);

		// Stacked sections: Ideas first, then Timeline, then Notes, then
		// the raw-markdown extras. (Tabs may return one day — each section
		// is still its own render method, so flipping back is trivial.)
		const contentContainer = container.createDiv({
			cls: "contact-content contact-content-stacked",
		});

		const section = (icon: string, label: string) => {
			const wrap = contentContainer.createDiv({
				cls: "contact-stack-section",
			});
			const header = wrap.createDiv({
				cls: "contact-stack-header",
			});
			setIcon(
				header.createSpan({ cls: "contact-stack-header-icon" }),
				icon
			);
			header.createSpan({ text: label });
			return wrap;
		};

		/**
		 * Same header, but its content collapses. Returns the body to fill
		 * and the wrap, so a caller can put controls *outside* the collapsed
		 * area — the Markdown section keeps its Edit button reachable while
		 * the content itself is hidden.
		 */
		const collapsibleSection = (
			icon: string,
			label: string,
			open: boolean,
			onToggle: (next: boolean) => void
		) => {
			const wrap = contentContainer.createDiv({
				cls: "contact-stack-section plan-accordion",
			});
			const header = wrap.createDiv({
				cls: "contact-stack-header plan-accordion-header",
			});
			setIcon(
				header.createSpan({ cls: "contact-stack-header-icon" }),
				icon
			);
			header.createSpan({ cls: "plan-accordion-label", text: label });
			setIcon(
				header.createSpan({ cls: "plan-accordion-chevron" }),
				"chevron-down"
			);
			const body = wrap.createDiv({ cls: "plan-accordion-body" });
			wrap.toggleClass("is-open", open);
			header.addEventListener("click", () => {
				open = !open;
				wrap.toggleClass("is-open", open);
				onToggle(open);
			});
			return { wrap, body };
		};

		section("lightbulb", "Ideas").appendChild(
			this.island(
				"ideas",
				<IdeasSection
					store={this.store}
					ideas={() => this.ideasList()}
					categoryOf={(idea) => this.normalizeCategory(idea)}
					onToggleDone={(index, done) =>
						void this.toggleIdeaDone(index, done)
					}
					onEdit={(index) =>
						this.openEditIdeaModal(index, this.ideasList()[index])
					}
					onResurface={(index) => this.openResurfaceModal(index)}
					onDelete={(index) => void this.deleteIdea(index)}
					onAdd={() => this.openAddIdeaModal()}
				/>
			)
		);
		this.renderEventsSection(section("milestone", "Timeline"));
		// Interests + fun facts + jokes + quotes are about the friend —
		// friends only
		if (!this.isGroupFile()) {
			section("heart", "Interests").appendChild(
				this.island(
					"interests",
					<InterestsSection
						store={this.store}
						interests={() =>
							asArray(this.contactData.interests) as Interest[]
						}
						categoryOf={(interest) =>
							this.normalizeInterestCategory(interest)
						}
						onEdit={(index) => this.openEditInterestModal(index)}
						onMakeIdea={(index) => this.makeIdeaFromInterest(index)}
						onAdd={() => this.openAddInterestModal()}
					/>
				)
			);
			// Directly under Interests: both answer "what are they into",
			// one in the present tense and one in the future.
			section("milestone", "Life goals").appendChild(
				this.island(
					"life-goals",
					<LifeGoalsSection
						store={this.store}
						goals={() => this.lifeGoalsOf()}
						onOpen={(index) => this.openLifeGoalView(index)}
						onAdd={() => this.openLifeGoalModal(null, null)}
					/>
				)
			);
			section("sparkles", "Fun facts").appendChild(
				this.island(
					"fun-facts",
					<FunFactsSection
						store={this.store}
						facts={() => this.funFactsOf()}
						onOpen={(index) =>
							this.openFunFactModal(index, this.funFactsOf()[index])
						}
						onAdd={() => this.openFunFactModal(null, null)}
					/>
				)
			);
			section("laugh", "Inside jokes").appendChild(
				this.island(
					"inside-jokes",
					<QuoteListSection
						store={this.store}
						items={() => this.insideJokesOf()}
						helperText="The jokes only the two of you get — keep them from fading."
						addLabel="Add inside joke"
						onOpen={(index) =>
							this.openInsideJokeModal(
								index,
								this.insideJokesOf()[index]
							)
						}
						onAdd={() => this.openInsideJokeModal(null, null)}
					/>
				)
			);
			section("quote", "Quotes").appendChild(
				this.island(
					"quotes",
					<QuoteListSection
						store={this.store}
						items={() => this.quotesOf()}
						helperText="Memorable things they've said — the one-liners you don't want to forget."
						addLabel="Add quote"
						quoted
						onOpen={(index) =>
							this.openQuoteModal(index, this.quotesOf()[index])
						}
						onAdd={() => this.openQuoteModal(null, null)}
					/>
				)
			);
		}
		section("pencil", "Notes").appendChild(this.notesIsland());
		// Raw markdown is reference material, not something you scan on every
		// visit — collapsed by default, with the Edit button left outside so
		// it stays one click away.
		const markdown = collapsibleSection(
			"document",
			"Markdown",
			this.expandedMarkdownSection,
			(open) => {
				this.expandedMarkdownSection = open;
			}
		);
		void this.renderExtrasSection(markdown.wrap, markdown.body);

		// Last thing on the page, below everything else. Plans have their own
		// delete inside the edit modal, and a group's page deletes through
		// the group modal — this is people only.
		if (this.isPersonFile()) {
			container.appendChild(
				this.island(
					"delete",
					<DeleteSection
						onDelete={() => this.confirmDeletePerson()}
					/>
				)
			);
		}
	}

	/** Trash this person's note, then leave the page it was showing. */
	private confirmDeletePerson() {
		const file = this._file;
		if (!file) return;
		const name = this.contactData.name || file.basename;
		new ConfirmModal(this.app, {
			title: "Remove friend",
			message: `Are you sure you want to remove ${file.basename}? Their note will be moved to your trash.`,
			failure: "Couldn't delete",
			onConfirm: async () => {
				await this.plugin.contactOperations.deleteContact(file);
				new Notice(`Deleted "${name}"`);
				// This view is now showing a file that no longer exists.
				this.leaf.detach();
				await this.plugin.activateDashboard();
			},
		}).open();
	}

	/** People live in People/ — the dashboard note and recaps do not. */
	private isPersonFile(): boolean {
		return (
			!!this._file &&
			this.plugin.contactOperations.isPersonFile(this._file.path)
		);
	}

	private renderNameSection(container: HTMLElement) {
		const nameSection = container.createDiv({
			cls: "contact-name-section",
		});

		const nameDisplay = nameSection.createDiv({
			cls: "contact-name-display",
		});

		const editContainer = nameDisplay.createDiv({
			cls: "contact-name-row",
		});

		const nameText = editContainer.createEl("h1", {
			text:
				this.contactData.displayName ||
				this.contactData.name ||
				"Unnamed Contact",
		});

		// Plans: the name is edited through "Edit details" instead of an
		// inline pencil, and long trip names wrap rather than overflow
		if (this.isPlanFile()) {
			nameText.addClass("contact-name-wrap");
			return;
		}

		const nameInput = editContainer.createEl("input", {
			type: "text",
			value: this.contactData.name || "",
			placeholder: "Contact name",
			cls: "contact-name-input",
		});

		const editButton = editContainer.createEl("button", {
			cls: "callander-button button-icon contact-name-edit",
		});
		setIcon(editButton, "pencil");

		// Add birthday-derived details, at whatever precision is recorded
		const birthdayValue = this.contactData.birthday ?? "";
		const birthdayFlex = parseFlexDate(birthdayValue);
		if (birthdayFlex && birthdayFlex.month) {
			const { year, month, day } = birthdayFlex;

			// Age is only known when the year is
			if (year !== null) {
				const ageText =
					this.plugin.contactOperations.calculateDetailedAge(
						birthdayValue
					);
				if (ageText) {
					nameDisplay.createSpan({
						text: ageText,
						cls: "contact-age-display",
					});
				}
			}

			// Birthday, at whatever precision is recorded (en-AU: day month year).
			// When the exact day is known, a relative countdown joins the same line.
			const birthdayText =
				day !== null && year !== null
					? `${day} ${monthName(month)} ${year}`
					: day !== null
					? `${day} ${monthName(month)}`
					: year !== null
					? `${monthName(month)} ${year}`
					: monthName(month);

			let relativeText: string | null = null;
			if (day !== null) {
				const daysUntil = this.calculateDaysUntilBirthday(
					birthdayValue
				);
				const daysSince =
					this.plugin.contactOperations.calculateDaysSinceBirthday(
						birthdayValue
					);

				if (daysUntil === 0) {
					relativeText = "today 🎂";
				} else if (
					daysSince !== null &&
					daysSince > 0 &&
					daysSince <= 30
				) {
					relativeText =
						`${formatCount(daysSince, "day")} ago`;
				} else if (daysUntil !== null) {
					relativeText =
						`in ${formatCount(daysUntil, "day")}`;
				}
			}

			nameDisplay.createSpan({
				text: relativeText
					? `Birthday: ${birthdayText} • ${relativeText}`
					: `Birthday: ${birthdayText}`,
				cls: "contact-age-display",
			});

			// Day unknown: keep a lightweight month-level countdown, only when near
			if (day === null) {
				const countdownContainer = nameDisplay.createDiv({
					cls: "contact-birthday-countdown",
				});
				const nowMonth = new Date().getMonth() + 1;
				const monthsAway = (month - nowMonth + 12) % 12;
				if (monthsAway > 3) {
					countdownContainer.remove();
				} else {
					countdownContainer.createSpan({
						text:
							month === nowMonth
								? "🎂 Birthday this month"
								: `Birthday in ${formatFlexDate({
										year: null,
										month,
										day: null,
								  })}`,
					});
				}
			}

			// Optional birthday trivia, each behind a setting
			const s = this.plugin.settings;
			if (day !== null && s.showStarSign) {
				nameDisplay.createSpan({
					text: `Star sign: ${zodiacSign(month, day)}`,
					cls: "contact-age-display",
				});
			}
			if (year !== null && s.showChineseZodiac) {
				nameDisplay.createSpan({
					text: `Zodiac: ${chineseZodiac(year)}`,
					cls: "contact-age-display",
				});
			}
			if (s.showBirthstone) {
				nameDisplay.createSpan({
					text: `Birthstone: ${birthstone(month)}`,
					cls: "contact-age-display",
				});
			}
			if (s.showBirthFlower) {
				nameDisplay.createSpan({
					text: `Birth flower: ${birthFlower(month)}`,
					cls: "contact-age-display",
				});
			}
		}

		// When a display name is in use, show the real name quietly
		if (
			this.contactData.displayName &&
			this.contactData.displayName !== this.contactData.name
		) {
			nameDisplay.createSpan({
				text: `Full name: ${this.contactData.name}`,
				cls: "contact-age-display",
			});
		}

		// Last updated — from the file itself, so edits made anywhere count
		if (this._file) {
			const mtime = new Date(this._file.stat.mtime);
			const daysAgo = wholeDaysBetween(mtime, new Date());
			const label =
				daysAgo === 0
					? "today"
					: daysAgo === 1
					? "yesterday"
					: daysAgo <= 30
					? `${daysAgo} days ago`
					: mtime.toLocaleDateString("en-AU", {
							day: "numeric",
							month: "long",
							year: "numeric",
					  });
			nameDisplay.createSpan({
				cls: "contact-age-display contact-last-updated",
				text: `Last updated: ${label}`,
			});
		}

		editButton.addEventListener("click", () => {
			if (!nameInput.classList.contains("editing")) {
				nameText.classList.add("editing");
				nameInput.classList.add("editing");
				setIcon(editButton, "checkmark");
				nameInput.focus();
			} else {
				void saveNameChange();
			}
		});

		const saveNameChange = async () => {
			if (!this._file) return;
			const newName = nameInput.value.trim();
			if (newName) {
				this.contactData.name = nameInput.value;
				await this.saveContactData();

				// Rename the file
				if (this._file.parent) {
					try {
						await this.plugin.contactOperations.renamePerson(
							this._file,
							newName
						);
						new Notice(`Updated contact name`);

						// Refresh Friend Tracker view
						const friendTrackerLeaves =
							this.app.workspace.getLeavesOfType(
								VIEW_TYPE_FRIEND_TRACKER
							);
						for (const leaf of friendTrackerLeaves) {
							const view = leaf.view;
							if (view instanceof FriendTrackerView) {
								await view.refresh();
								break;
							}
						}
					} catch (error) {
						new Notice(`Error updating file name: ${String(error)}`);
					}
				}
			}
			nameText.textContent = nameInput.value || "Unnamed Contact";
			nameText.classList.remove("editing");
			nameInput.classList.remove("editing");
			setIcon(editButton, "pencil");
		};

		nameInput.addEventListener("change", () => void saveNameChange());
	}

	private calculateDaysUntilBirthday(birthday: string): number | null {
		return this.plugin.contactOperations.calculateDaysUntilBirthday(
			birthday
		);
	}

	private renderInfoSection(container: HTMLElement) {
		// container is already a .contact-info-section — no second wrapper,
		// so the fields span the page like every other section
		const fieldsContainer = container.createDiv({
			cls: "contact-fields-container",
		});

		const renderViewMode = () => {
			fieldsContainer.empty();
			fieldsContainer.classList.remove("editing");

			// Render each field as read-only text
			Object.entries(this.contactData)
				// SYSTEM_FIELDS rather than a list repeated here: this was a
				// hand-kept duplicate and had already drifted from it, which
				// is how `extras`, `insideJokes` and `lifeGoals` ended up
				// rendered as About rows despite each having its own section.
				.filter(
					([key]) =>
						!(SYSTEM_FIELDS as readonly string[]).includes(key)
				)
				.forEach(([key, value]) => {
					if (!value) return; // Skip empty values
					if (Array.isArray(value) && value.length === 0) return;

					const field = fieldsContainer.createDiv({
						cls: "contact-field-view",
						attr: {
							"data-field": key.toLowerCase(),
						},
					});

					this.appendFieldLabel(field, key);

					// Groups render as colored chips, not plain text
					if (key === "groups") {
						const ops = this.plugin.contactOperations;
						const infos = ops.getGroupInfos();
						const colorOf = new Map(
							infos.map((i) => [i.name, i.color])
						);
						const fileOf = new Map(
							infos.map((i) => [i.name, i.file])
						);
						const displayOf = ops.groupDisplayNames();
						const chips = field.createDiv({
							cls: "contact-group-chips",
						});
						// Through groupsOf, not the raw array: these are
						// stored as `[[Wikilinks]]`, and reading them raw
						// printed the brackets and missed every colour —
						// the lookups below are all keyed on the bare name.
						for (const g of ContactOperations.groupsOf(
							this.contactData
						)) {
							const chip = chips.createSpan({
								cls: "contact-group-chip readonly",
							});
							const dot = chip.createSpan({
								cls: "group-dot",
							});
							dot.style.backgroundColor =
								colorOf.get(g) ??
								"var(--background-modifier-border)";
							const label = chip.createSpan({
								text:
									displayOf.get(g) ??
									ops.prettyGroupName(g),
							});
							// The value really is a link, so it should behave
							// like one. Only when the page exists — a group
							// nobody has opened yet has nothing to navigate
							// to, and a dead link that looks live is worse
							// than plain text.
							const dest = fileOf.get(g);
							if (!dest) continue;
							label.addClass("contact-group-chip-link");
							label.addEventListener("click", (e) => {
								e.stopPropagation();
								void this.app.workspace.openLinkText(
									dest.path,
									this._file?.path ?? "",
									true
								);
							});
						}
						return;
					}

					// Entries that name other notes render as real links —
					// Obsidian's own `internal-link` class, so they pick up
					// the accent colour, hover preview and unresolved styling
					// without this reinventing any of it. Plain-text entries
					// sit alongside unchanged.
					if (LINKABLE_FIELDS.includes(key)) {
						const entries = parseLinkField(value);
						if (entries.length === 0) return;
						const list = field.createDiv({
							cls: "contact-link-field",
						});
						for (const entry of entries) {
							const target = linkTarget(entry);
							if (!target) {
								list.createSpan({
									cls: "contact-link-plain",
									text: linkLabel(entry),
								});
								continue;
							}
							const link = list.createEl("a", {
								cls: "internal-link contact-link-chip",
								text: linkLabel(entry),
								attr: { href: target, "data-href": target },
							});
							link.addEventListener("click", (e) => {
								e.preventDefault();
								// Always a new tab, never in place: this page
								// is the thing you were reading, and following
								// a relative or a related file is a detour —
								// replacing the person you came from would
								// cost a Back press to undo every time.
								void this.app.workspace.openLinkText(
									target,
									this._file?.path ?? "",
									true
								);
							});
						}
						return;
					}

					// Format flexible dates at their recorded precision
					const displayValue = (() => {
						if (Array.isArray(value)) {
							return value.map(String).join(", ");
						}
						if ((key === "birthday" || key === "met") && value) {
							const parsed = parseFlexDate(
								value as string | number
							);
							if (parsed) {
								if (key === "met") {
									const since = formatTimeSince(parsed);
									return `${formatFlexDate(parsed)}${
										since ? ` (${since})` : ""
									}`;
								}
								return formatFlexDate(parsed);
							}
						}
						return value;
					})();

					field.createDiv({
						cls: "contact-field-value",
						text: displayValue as string,
					});
				});

			// Add edit button at the bottom
			const editButton = fieldsContainer.createEl("button", {
				cls: "callander-button",
				text: "Edit",
			});

			editButton.addEventListener("click", () => {
				renderEditMode();
			});
		};

		const renderEditMode = () => {
			fieldsContainer.empty();
			fieldsContainer.classList.add("editing");

			// Standard fields first
			Object.values(STANDARD_FIELDS)
				.filter((field) => !SYSTEM_FIELDS.includes(field))
				.forEach((field) => {
					if (field === STANDARD_FIELDS.MET) {
						this.createMetField(fieldsContainer);
					} else if (field === STANDARD_FIELDS.BIRTHDAY) {
						this.createBirthdayField(fieldsContainer);
					} else if (field === STANDARD_FIELDS.GROUPS) {
						this.createGroupsField(fieldsContainer);
					} else {
						this.createInfoField(
							fieldsContainer,
							field,
							// Linkable fields store a list; the box edits
							// them as one comma-separated line.
							LINKABLE_FIELDS.includes(field)
								? formatLinkField(this.contactData[field])
								: toText(this.contactData[field])
						);
					}
				});

			// Then custom fields
			const excludedFields = [
				...SYSTEM_FIELDS,
				...Object.values(STANDARD_FIELDS).map((f) => f.toLowerCase()),
				"created",
				"updated",
			];
			Object.entries(this.contactData)
				.filter(([key]) => !excludedFields.includes(key.toLowerCase()))
				.forEach(([key, value]) => {
					this.createInfoField(fieldsContainer, key, value as string);
				});

			// Add custom field button
			const addFieldButton = fieldsContainer.createEl("button", {
				cls: "callander-button button-outlined",
				text: "Add custom field",
			});
			addFieldButton.addEventListener("click", () => {
				void this.openAddFieldModal();
			});

			// Add done button
			const doneButton = fieldsContainer.createEl("button", {
				cls: "callander-button button-primary button-full-width",
				text: "Done",
			});

			const handleDone = async () => {
				await this.saveContactData();
				renderViewMode();
			};
			doneButton.addEventListener("click", () => void handleDone());
		};

		// Initial render in view mode
		renderViewMode();
	}

	/**
	 * A field's label, plus — while editing — the button that explains it.
	 *
	 * Shared by the read view and every edit-mode field so the wording can't
	 * drift between them, and adding a field means one entry in fieldLabel's
	 * tables rather than four call sites.
	 *
	 * The explanation is a popover anchored to its button, dismissed by the
	 * ✕, by clicking anywhere outside, or by Escape. Only one is ever open:
	 * opening a second closes the first, so the column can't fill up with
	 * stacked boxes.
	 *
	 * Edit mode only. Reading a filled-in page, the values speak for
	 * themselves and a row of buttons is clutter; the question "what goes
	 * here?" is one you have while filling it in.
	 */
	private appendFieldLabel(
		row: HTMLElement,
		key: string,
		{ editing = false } = {}
	) {
		const label = editing
			? row.createEl("label", { cls: "contact-field-label" })
			: row.createDiv({ cls: "contact-field-label" });
		label.createSpan({ text: fieldLabel(key) });

		const help = editing ? fieldHelp(key) : null;
		if (!help) return;

		// The anchor the popover positions against, so it tracks the button
		// rather than the row — the label column is a fixed width but the
		// button sits at the end of a variable-length word.
		const anchor = label.createSpan({ cls: "contact-field-info-anchor" });
		const button = anchor.createEl("button", {
			cls: "contact-field-info",
			attr: {
				type: "button",
				"aria-label": `What is ${fieldLabel(key)}?`,
				"aria-expanded": "false",
			},
		});
		// `info` isn't on the verified icon list in CLAUDE.md, and a name
		// Obsidian doesn't ship renders nothing at all — `lightbulb` is
		// verified and reads as "here's a hint", which is the job.
		setIcon(button, "lightbulb");

		button.addEventListener("click", (e) => {
			// The label wraps its input, so without this the click would also
			// focus the field and raise a keyboard on mobile.
			e.preventDefault();
			e.stopPropagation();
			if (this.openFieldHelp?.anchor === anchor) {
				this.closeFieldHelp();
				return;
			}
			this.openFieldHelpFor(anchor, button, key, help);
		});
	}

	/**
	 * The one open help popover, with the listeners that dismiss it.
	 *
	 * Held on the view rather than per-field so opening one can close the
	 * last, and so onClose can tear down document listeners that would
	 * otherwise outlive the page.
	 */
	private openFieldHelp: {
		anchor: HTMLElement;
		el: HTMLElement;
		button: HTMLElement;
		dispose: () => void;
	} | null = null;

	private closeFieldHelp() {
		const open = this.openFieldHelp;
		if (!open) return;
		this.openFieldHelp = null;
		open.dispose();
		open.el.remove();
		open.button.setAttribute("aria-expanded", "false");
		open.button.removeClass("is-open");
	}

	private openFieldHelpFor(
		anchor: HTMLElement,
		button: HTMLElement,
		key: string,
		help: FieldHelp
	) {
		this.closeFieldHelp();

		const el = anchor.createDiv({ cls: "contact-field-help" });
		// Arrow first in the DOM so it paints behind the box's own border.
		el.createDiv({ cls: "contact-field-help-arrow" });

		const header = el.createDiv({ cls: "contact-field-help-header" });
		header.createDiv({
			cls: "contact-field-help-title",
			text: fieldLabel(key),
		});
		const close = header.createEl("button", {
			cls: "contact-field-help-close",
			attr: { type: "button", "aria-label": "Close" },
		});
		setIcon(close, "x");
		close.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.closeFieldHelp();
		});

		el.createDiv({ cls: "contact-field-help-text", text: help.text });
		if (help.example) {
			el.createDiv({
				cls: "contact-field-help-example",
				text: `e.g. ${help.example}`,
			});
		}

		// A click that lands anywhere but inside this box closes it. Bound on
		// the next frame so the click that opened it doesn't immediately
		// dismiss it as it finishes bubbling.
		const onDocClick = (evt: MouseEvent) => {
			const target = evt.target as Node | null;
			if (target && el.contains(target)) return;
			this.closeFieldHelp();
		};
		const onKey = (evt: KeyboardEvent) => {
			if (evt.key === "Escape") this.closeFieldHelp();
		};
		const doc = this.containerEl.ownerDocument;
		const timer = window.setTimeout(() => {
			doc.addEventListener("click", onDocClick);
			doc.addEventListener("keydown", onKey);
		}, 0);

		button.setAttribute("aria-expanded", "true");
		button.addClass("is-open");
		this.openFieldHelp = {
			anchor,
			el,
			button,
			dispose: () => {
				window.clearTimeout(timer);
				doc.removeEventListener("click", onDocClick);
				doc.removeEventListener("keydown", onKey);
			},
		};
	}

	/**
	 * "When we met" with honest vagueness: record just the year, the month,
	 * or the exact day — whatever you actually remember.
	 */
	private createMetField(container: HTMLElement) {
		const fieldContainer = container.createDiv({
			cls: "contact-field",
		});

		this.appendFieldLabel(fieldContainer, "met", { editing: true });

		createFlexDateInput(fieldContainer, this.contactData.met, (value) => {
			void this.updateContactData("met", value);
		});
	}

	/**
	 * Birthday with honest imprecision: exact date, month + year (day
	 * unknown), or month + day (year unknown).
	 */
	private createBirthdayField(container: HTMLElement) {
		const fieldContainer = container.createDiv({
			cls: "contact-field",
		});

		this.appendFieldLabel(fieldContainer, "birthday", { editing: true });

		createBirthdayPrecisionInput(
			fieldContainer,
			this.contactData.birthday,
			(value) => {
				void this.updateContactData("birthday", value);
			}
		);
	}

	/** Groups as toggle chips with color dots; new groups via a small input */
	private createGroupsField(container: HTMLElement) {
		const ops = this.plugin.contactOperations;
		const fieldContainer = container.createDiv({
			cls: "contact-field contact-field-groups",
		});
		this.appendFieldLabel(fieldContainer, "groups", { editing: true });

		const wrap = fieldContainer.createDiv({
			cls: "contact-groups-edit",
		});
		const chipsRow = wrap.createDiv({ cls: "contact-group-chips" });

		// Through groupsOf, not the raw array: values are stored as
		// `[[Wikilinks]]` and everything below compares bare names.
		const member = new Set<string>(
			ContactOperations.groupsOf(this.contactData)
		);
		const infos = ops.getGroupInfos();
		const colorOf = new Map(infos.map((i) => [i.name, i.color]));
		const known = [
			...new Set([...infos.map((i) => i.name), ...member]),
		].sort();

		// The page's own spelling, so the stored link matches the file
		// rather than a first-letter guess — see groupDisplayNames.
		const displayOf = ops.groupDisplayNames();
		const save = () => {
			void this.updateContactData(
				"groups",
				[...member]
					.sort()
					.map((g) =>
						ContactOperations.groupLink(g, displayOf.get(g))
					)
			);
		};

		const addChip = (name: string) => {
			const chip = chipsRow.createEl("button", {
				cls: `contact-group-chip ${member.has(name) ? "selected" : ""}`,
			});
			const dot = chip.createSpan({ cls: "group-dot" });
			dot.style.backgroundColor =
				colorOf.get(name) ?? "var(--background-modifier-border)";
			chip.createSpan({
				text: displayOf.get(name) ?? ops.prettyGroupName(name),
			});
			chip.addEventListener("click", () => {
				member.has(name) ? member.delete(name) : member.add(name);
				chip.toggleClass("selected", member.has(name));
				save();
			});
		};
		known.forEach(addChip);

		// Group creation lives on the dashboard — here you only toggle
		if (known.length === 0) {
			wrap.createDiv({
				cls: "section-helper-text",
				text: "No groups yet — create them from the dashboard.",
			});
		}
	}

	private createInfoField(
		container: HTMLElement,
		field: string,
		value: string
	) {
		const fieldContainer = container.createDiv({
			cls: "contact-field",
		});

		this.appendFieldLabel(fieldContainer, field, { editing: true });

		const input = fieldContainer.createEl("input", {
			cls: "contact-field-input",
			attr: {
				type: field === "birthday" ? "date" : "text",
				placeholder: `Enter ${field.toLowerCase()}`,
				value: value || "",
				...(field === "relationship" && {
					list: "relationship-types",
				}),
			},
		});

		// Fields whose entries name other notes get note autocomplete, and
		// save as a list rather than the raw string — a link only counts to
		// Obsidian when it's the whole value (see LINKABLE_FIELDS).
		if (LINKABLE_FIELDS.includes(field)) {
			input.placeholder = "Type a name, or pick a note";
			new NoteSuggest(this.app, input);
			input.addEventListener("change", () => {
				const entries = parseLinkField(input.value);
				void this.updateContactData(field, entries);
			});
			return;
		}

		input.addEventListener("change", () => {
			void this.updateContactData(field, input.value);
		});
	}

	// A checked-off idea is usually something that just happened — offer to
	// put it on the timeline with one click
	private offerLogAsEvent(idea: Idea) {
		const verbs: Partial<Record<IdeaCategory, string>> = {
			gift: "Gave",
			conversation: "Talked about",
			activity: "Did",
			place: "Went to",
			recommendation: "Recommended",
			other: "",
		};
		const verb = verbs[this.normalizeCategory(idea)];
		const eventText = verb ? `${verb}: ${idea.text}` : idea.text;
		// The person whose idea it was: the notice outlives the page, which
		// may be showing someone else by the time the button is clicked.
		const file = this._file;

		const fragment = createFragment();
		fragment.createSpan({ text: "Idea done! " });
		const logButton = fragment.createEl("button", {
			cls: "callander-button contact-log-event-button",
			text: "Log on timeline",
		});

		const notice = new Notice(fragment, ACTION_NOTICE_MS);
		const logIdeaAsEvent = async () => {
			notice.hide();
			const today = todayISO();
			// Gifts given get their own type; everything else was time spent
			const type: EventType =
				this.normalizeCategory(idea) === "gift" ? "given" : "hangout";
			await this.addEvent(today, eventText, type, file);
			new Notice("Added to timeline");
		};
		logButton.addEventListener("click", () => void logIdeaAsEvent());
	}

	/** Reads differently for plans, groups and friends. */
	private notesPlaceholder(): string {
		if (this.isPlanFile()) {
			return "Anything else about the plan — booking details, addresses, who's driving...";
		}
		if (this.isGroupFile()) {
			return "Notes about this group — running jokes, how you all met, anything worth remembering...";
		}
		return "Add notes about anything here that you want to remember...";
	}

	private async saveNotes(text: string, file: TFile | null = this._file) {
		if (!file) return;
		if (file === this._file && normalizeNotes(text) === (this.bodyNotes ?? "")) {
			return;
		}
		await this.writeNotesToBody(text, file);
		// Moved on to another note while that write was in flight (see
		// writeNotesToBody): stamping now would mark the wrong one updated.
		if (this._file !== file) return;
		// The body write leaves frontmatter alone, so the last-updated stamp
		// has to be set on its own. That save also bumps the store, which is
		// what redraws the preview — no render() needed.
		await this.saveContactData();
	}

	/**
	 * Notes rendered the way Obsidian renders a note, into a box of their
	 * own that the returned function takes away again.
	 *
	 * A fresh box and component per render, rather than rendering into the
	 * same element: rendering is async, so a slow one finishing after a
	 * newer one started would otherwise add its output beside it. Here a
	 * late finisher writes into a box that's already gone. The component is
	 * what other plugins' post-processors hang their own work from, so it
	 * has to be unloaded with the render or it outlives it.
	 */
	private renderNotesMarkdown(text: string, el: HTMLElement): () => void {
		const child = new Component();
		child.load();
		const box = el.createDiv({ cls: "markdown-rendered contact-notes-rendered" });
		void MarkdownRenderer.render(
			this.app,
			text,
			box,
			this._file?.path ?? "",
			child
		);
		const onClick = (event: MouseEvent) => this.followRenderedLink(event, box);
		box.addEventListener("click", onClick);
		return () => {
			box.removeEventListener("click", onClick);
			box.remove();
			child.unload();
		};
	}

	/**
	 * Clicks on links inside rendered markdown. Obsidian only follows them
	 * in its own views, so here they're routed by hand: an anchor scrolls
	 * within the render, an internal link opens (in a new tab with the
	 * modifier held), and anything web goes to the browser as usual.
	 */
	private followRenderedLink(event: MouseEvent, container: HTMLElement) {
		const anchor = (event.target as HTMLElement | null)?.closest("a");
		if (!anchor || !container.contains(anchor)) return;
		const href = anchor.getAttribute("href");
		if (href?.startsWith("#")) {
			event.preventDefault();
			// A heading id isn't always a valid selector ("#My heading").
			try {
				container.querySelector(href)?.scrollIntoView();
			} catch {
				// Nothing to scroll to.
			}
		} else if (href && !/^[a-z][a-z0-9+.-]*:/i.test(href)) {
			event.preventDefault();
			void this.app.workspace.openLinkText(
				href,
				this._file?.path ?? "",
				event.ctrlKey || event.metaKey
			);
		}
	}

	/** Hold a native-editor edit for a pause in the typing. See notesDraft. */
	private queueNotesSave(text: string) {
		const file = this._file;
		if (!file) return;
		const pending = this.notesDraft;
		if (pending && pending.file !== file) void this.flushNotesDraft();
		else if (pending) window.clearTimeout(pending.timer);
		this.notesDraft = {
			file,
			text,
			timer: window.setTimeout(
				() => void this.flushNotesDraft(),
				NOTES_AUTOSAVE_MS
			),
		};
	}

	/** Write the held native-editor edit now, to the note it was typed in. */
	private async flushNotesDraft(): Promise<void> {
		const draft = this.notesDraft;
		if (!draft) return;
		window.clearTimeout(draft.timer);
		this.notesDraft = null;
		await this.saveNotes(draft.text, draft.file);
	}

	/**
	 * The Notes section. The same island on every kind of page — in
	 * Obsidian's own editor when the experimental setting is on, with the
	 * standard section standing by in case that editor can't start.
	 */
	private notesIsland(): HTMLElement {
		const openEditor = () =>
			this.plugin.openPathAsMarkdown(this._file?.path ?? "");
		const plain = (
			<NotesSection
				store={this.store}
				value={() => this.bodyNotes ?? ""}
				placeholder={() => this.notesPlaceholder()}
				onSave={(text) => this.saveNotes(text)}
				renderMarkdown={(text, el) => this.renderNotesMarkdown(text, el)}
				onOpenEditor={openEditor}
			/>
		);
		return this.island(
			"notes",
			<NotesChooser
				store={this.store}
				native={() => this.plugin.settings.nativeNotesEditor}
				plainSection={plain}
				nativeSection={
					<NativeNotesSection
						store={this.store}
						value={() => this.bodyNotes ?? ""}
						placeholder={() => this.notesPlaceholder()}
						mount={(host, initial, events) =>
							mountEmbeddedEditor(this.app, host, {
								value: initial,
								file: () => this._file,
								...events,
							})
						}
						onChange={(text) => this.queueNotesSave(text)}
						onFlush={() => this.flushNotesDraft()}
						onOpenEditor={openEditor}
						fallback={plain}
					/>
				}
			/>
		);
	}

	private renderEventsSection(container: HTMLElement) {
		const eventsSection = container.createDiv({
			cls: "contact-events-section",
		});

		const headerContainer = eventsSection.createDiv({
			cls: "contact-events-header",
		});

		const events = this.eventsList();
		const planRows = this.planTimelineRows();

		// Add helper text if no events yet — a plan they're on counts, so
		// someone with only plans still gets a timeline rather than a nudge.
		if (events.length === 0 && planRows.length === 0) {
			headerContainer.createDiv({
				cls: "section-helper-text",
				text: "Log things that happened — meetups, their life events, memorable outings.",
			});
		}

		if (events.length > 0 || planRows.length > 0 || this.contactData.met) {
			this.eventTimeline.render(
				eventsSection,
				events,
				this.contactData.met,
				planRows
			);
		}

		// Add button sits below the timeline
		const footer = eventsSection.createDiv({
			cls: "contact-section-footer",
		});
		const addButton = footer.createEl("button", {
			cls: "callander-button",
			text: "Add event",
		});
		addButton.addEventListener("click", () => {
			void this.openAddEventModal();
		});

		eventsSection.appendChild(
			this.island(
				"diary-mentions",
				<DiaryMentionsSection
					store={this.store}
					mentions={() => this.diaryMentions()}
					onOpen={(path) =>
						void this.app.workspace.openLinkText(path, "", true)
					}
				/>
			)
		);
	}

	/**
	 * File a draft as an idea. The draft stays until it's marked Done — the
	 * same as from the dashboard — so this only adds the idea.
	 */
	private promoteDraftToIdea(_index: number, text: string) {
		new QuickIdeaModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			this.lastIdeaCategory,
			async (category, ideaText) => {
				this.lastIdeaCategory = category;
				await this.writeIdeasToBody([
					...this.ideasList(),
					{ category, text: ideaText, done: false },
				]);
				this.render();
			},
			text
		).open();
	}

	private editDraft(index: number, text: string) {
		const about = this.aboutDrafts[index];
		if (!about) return;
		new NoteInputModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			async (updated) => {
				// Reworded in the note, keeping its date, person and box.
				await this.plugin.contactOperations.updateDraft(
					about.index,
					about.draft.text,
					updated
				);
				await this.refreshAboutDrafts();
			},
			text
		).open();
	}

	/** Tick a draft off in the dashboard note; it leaves this strip and
	 * stays in the record. */
	private async completeAboutDraft(index: number): Promise<void> {
		const about = this.aboutDrafts[index];
		if (!about) return;
		await this.plugin.contactOperations.completeDraft(
			about.index,
			about.draft.text
		);
		await this.refreshAboutDrafts();
	}

	private isPlanFile(): boolean {
		return !!this._file?.path.startsWith(
			this.plugin.planOperations.getPlansFolderPath() + "/"
		);
	}

	/** Plan date/status + location lines, shown under "Last updated". */
	private renderPlanMetaLines(container: HTMLElement) {
		const parts: string[] = [];
		const dateFlex = parseFlexDate(this.contactData.date);
		if (dateFlex) {
			let when = formatPlanDateRange(
				this.contactData.date,
				this.contactData.endDate
			);
			if (dateFlex.month !== null && dateFlex.day !== null) {
				const target = new Date(
					dateFlex.year ?? new Date().getFullYear(),
					dateFlex.month - 1,
					dateFlex.day
				);
				target.setHours(0, 0, 0, 0);
				const days = wholeDaysBetween(new Date(), target);
				if (days === 0) when += " · today!";
				else if (days === 1) when += " · tomorrow";
				else if (days > 1) when += ` · in ${days} days`;
				else when += ` · ${-days} days ago`;
			}
			parts.push(`🗓 ${when}`);
		}
		const est = PlanOperations.estimate(this.contactData);
		if (est > 0) parts.push(`~$${est} planned`);
		if (this.contactData.status === "done") parts.push("✅ Done");

		if (parts.length > 0 || this.contactData.location) {
			const linesWrap = container.createDiv({
				cls: "plan-meta-lines",
			});
			if (parts.length > 0) {
				linesWrap.createDiv({
					cls: "plan-meta-line",
					text: parts.join("  ·  "),
				});
			}
			if (this.contactData.location) {
				linesWrap.createDiv({
					cls: "plan-meta-line",
					text: `📍 ${this.contactData.location}`,
				});
			}
		}

		// Edit date/end-date/location — sits just below the location line.
		const editBtn = container.createEl("button", {
			cls: "callander-button plan-edit-details",
			attr: { "aria-label": "Edit plan details" },
		});
		setIcon(editBtn, "pencil");
		editBtn.createSpan({ text: "Edit details" });
		editBtn.addEventListener("click", () => this.openPlanDetailsModal());
	}

	/** Edit the plan's name, date, end date & location. */
	private openPlanDetailsModal() {
		new PlanDetailsModal(
			this.app,
			{
				name: this.contactData.name || "",
				date: this.contactData.date
					? String(this.contactData.date)
					: "",
				endDate: this.contactData.endDate
					? String(this.contactData.endDate)
					: "",
				location: this.contactData.location
					? String(this.contactData.location)
					: "",
			},
			async (details) => {
				const renamed =
					details.name && details.name !== this.contactData.name;
				this.contactData.name = details.name;
				this.contactData.date = details.date;
				if (details.endDate) {
					this.contactData.endDate = details.endDate;
				} else {
					delete this.contactData.endDate;
				}
				if (details.location) {
					this.contactData.location = details.location;
				} else {
					delete this.contactData.location;
				}
				await this.saveContactData();
				// Keep the filename in step with the name
				if (renamed && this._file) {
					try {
						await this.plugin.planOperations.renamePlan(
							this._file,
							details.name
						);
					} catch (error) {
						new Notice(`Error renaming plan: ${String(error)}`);
					}
				}
				this.render();
			},
			() => this.confirmDeletePlan()
		).open();
	}

	/** Delete the plan note entirely (sent to the Obsidian trash). */
	private confirmDeletePlan() {
		const file = this._file;
		if (!file) return;
		const name = this.contactData.name || file.basename;
		new ConfirmModal(this.app, {
			title: "Delete plan",
			message: `Delete the plan "${name}"?`,
			onConfirm: async () => {
				await this.plugin.planOperations.deletePlan(file);
				new Notice(`Deleted "${name}"`);
				this.leaf.detach();
				await this.plugin.activateDashboard();
			},
		}).open();
	}

	private createPlanDoneButton(container: HTMLElement) {
		const isDone = this.contactData.status === "done";
		const doneButton = container.createEl("button", {
			cls: "callander-button contact-header-action",
		});
		setIcon(doneButton, isDone ? "rotate-ccw" : "check");
		doneButton.createSpan({
			text: isDone ? "Reopen plan" : "Mark as done",
		});
		doneButton.addEventListener("click", () => {
			if (this.contactData.status === "done") {
				this.contactData.status = "planning";
				void this.saveContactData().then(() => this.render());
				return;
			}
			// Members' timelines list this plan already — derived live from
			// its membership — so marking it done only has to set the status.
			new ConfirmModal(this.app, {
				title: "Mark plan as done",
				message: "Archive this plan? It stays on the timeline of everyone who was on it.",
				confirmLabel: "Done",
				onConfirm: async () => {
					this.contactData.status = "done";
					await this.saveContactData();
					this.render();
				},
			}).open();
		});
	}

	/**
	 * This plan's members as display info — see resolvePeopleInfo, which does
	 * the resolving. Kept as a method so planMemberDisplays and
	 * planShortNameOverrides share one source and can never drift apart.
	 *
	 * Distinct from resolvePlanMembers() below, which resolves to TFiles —
	 * this resolves to the display info those files' frontmatter holds.
	 */
	private planMemberInfo(list?: string[]): PersonInfo[] {
		const members = list ?? asArray(this.contactData.members).map(String);
		return resolvePeopleInfo(this.app, this._file?.path ?? "", members);
	}

	/** Member display names — resolved contacts use displayName, guests as-is */
	private planMemberDisplays(list?: string[]): string[] {
		return this.planMemberInfo(list).map((m) => m.displayName);
	}

	/** shortName overrides for shortenPeopleList — see shortNameOverrides. */
	private planShortNameOverrides(list?: string[]): Map<string, string> {
		const map = new Map<string, string>();
		for (const m of this.planMemberInfo(list)) {
			if (m.shortName) {
				map.set(m.displayName.trim().toLowerCase(), m.shortName);
			}
		}
		return map;
	}

	/** The iMessage-ready version of a plan. Costs stay out of the invite. */
	private buildPlanShareText(detail?: PlanShareDetail): string {
		return buildPlanShareText(this.contactData, {
			detail,
			yourName: this.plugin.settings.yourName,
			members: this.planMemberDisplays(),
			unconfirmed: this.planMemberDisplays(
				Array.isArray(this.contactData.unconfirmedMembers)
					? this.contactData.unconfirmedMembers
					: []
			),
		});
	}

	/**
	 * Plans this person is a member of, shaped as timeline rows.
	 *
	 * Derived on every render rather than written onto their note: the plan
	 * owns its membership, so adding or dropping someone shows up here at
	 * once, with nothing stored to fall out of step. That's the same
	 * arrangement PlanOperations.timelineOf uses for a plan's own itinerary.
	 *
	 * Covers upcoming plans as well as finished ones — an upcoming plan is
	 * exactly the kind of thing worth seeing on someone's page, and because
	 * it's derived it simply disappears if they end up not coming.
	 */
	private planTimelineRows(): FriendEvent[] {
		const file = this._file;
		// Plan and group pages get their own layouts; only a person's
		// timeline should list the plans they're on.
		if (!file || this.isPlanFile() || this.isGroupFile()) return [];

		return this.plugin.planOperations
			.getPlans()
			.filter((plan) =>
				plan.members.some((raw) => {
					const linktext = String(raw).replace(/^\[\[|\]\]$/g, "");
					return (
						this.app.metadataCache.getFirstLinkpathDest(
							linktext,
							plan.file.path
						)?.path === file.path
					);
				})
			)
			.map((plan) => ({
				date: plan.date,
				text: plan.name,
				type: "hangout" as const,
				// Marks the row as plan-derived: drives the 🗺️ badge and the
				// click-through, and is never persisted to the person's note.
				plan: `[[${plan.file.basename}]]`,
			}));
	}

	/** Resolve the plan's wikilink members to contact files */
	private resolvePlanMembers(): TFile[] {
		if (!this._file) return [];
		const members = asArray(this.contactData.members).map(String);
		const files: TFile[] = [];
		for (const raw of members) {
			const linktext = String(raw).replace(/^\[\[|\]\]$/g, "");
			const dest = this.app.metadataCache.getFirstLinkpathDest(
				linktext,
				this._file.path
			);
			if (dest) files.push(dest);
		}
		return files;
	}

	/** Everyone at the table: guests/contacts + you. */
	private planMemberCount(): number {
		const yourName = this.plugin.settings.yourName;
		const members = asArray(this.contactData.members).map(String);
		const others = members.filter(
			(raw) =>
				!yourName ||
				String(raw)
					.replace(/^\[\[|\]\]$/g, "")
					.toLowerCase() !== yourName.toLowerCase()
		).length;
		return others + (yourName ? 1 : 0);
	}

	/**
	 * A member list resolved for display.
	 *
	 * Your own entry is dropped from `members`: you're rendered separately and
	 * unremovably, and a plan that also lists you as a guest would show you
	 * twice. The stored index rides along, since removal addresses the list
	 * rather than the name.
	 */
	private planMemberChips(
		key: "members" | "unconfirmedMembers"
	): PlanMemberChip[] {
		const file = this._file;
		if (!file) return [];
		const yourName = this.plugin.settings.yourName;
		return asArray(this.contactData[key])
			.map((raw, index) => ({ raw: toText(raw), index }))
			.filter(
				({ raw }) =>
					key !== "members" ||
					!yourName ||
					raw.replace(/^\[\[|\]\]$/g, "").toLowerCase() !==
						yourName.toLowerCase()
			)
			.map(({ raw, index }) => {
				const linktext = raw.replace(/^\[\[|\]\]$/g, "");
				const dest = this.app.metadataCache.getFirstLinkpathDest(
					linktext,
					file.path
				);
				return {
					// `||`, not `??`: a cleared `displayName: ""` is exactly
					// as unset as a missing one, and should fall back to the
					// file's own name the same way, rather than rendering
					// the chip blank.
					display: dest
						? String(
								this.app.metadataCache.getFileCache(dest)
									?.frontmatter?.displayName || dest.basename
						  )
						: linktext,
					path: dest ? dest.path : null,
					index,
				};
			});
	}

	private async removePlanEntry(
		key: "members" | "unconfirmedMembers",
		index: number
	) {
		this.removeFromList(key, index);
		await this.saveContactData();
		this.render();
	}

	private async confirmPlanMember(index: number) {
		// toText, not String(): a hand-edited list can hold a map, which
		// String() would turn into "[object Object]" and then store as a
		// member. An unusable entry confirms to nothing instead.
		const raw = toText(asArray(this.contactData.unconfirmedMembers)[index]);
		if (!raw) return;
		this.removeFromList("unconfirmedMembers", index);
		this.pushToList("members", raw);
		await this.saveContactData();
		this.render();
	}

	private async openAddPlanMember() {
		const ops = this.plugin.contactOperations;
		const contacts = await ops.getContacts();
		const existing = new Set(this.resolvePlanMembers().map((f) => f.path));
		const groups = ops.getGroupInfos(contacts).map((g) => ({
			name: g.name,
			label: ops.labelOf(g),
			color: g.color,
		}));
		new AddPlanMemberModal(
			this.app,
			contacts.filter((c) => !existing.has(c.file.path)),
			groups,
			async ({ contact, name }, isUnconfirmed) => {
				const entry = contact ? `[[${contact.file.basename}]]` : name;
				this.pushToList(
					isUnconfirmed ? "unconfirmedMembers" : "members",
					entry
				);
				await this.saveContactData();
				this.render();
			}
		).open();
	}

	/**
	 * The plan's own undated thoughts, waiting to be sorted — a draft with
	 * a day sits on the Timeline instead (see PlanOperations.timelineOf),
	 * so this is specifically the ones that don't have one yet.
	 *
	 * Body-backed once migrated (`bodyDrafts`); the frontmatter list still
	 * stands in until then — that's what makes the migration lazy.
	 */
	private planDrafts(): LedgerDraft[] {
		if (this.bodyDrafts !== null) return this.bodyDrafts;
		// Pre-migration, every frontmatter draft is still open — nothing in
		// the old shape could mark one done.
		return ContactOperations.draftsOf(this.contactData)
			.filter((d) => !d.date)
			.map((d) => ({ ...d, done: false }));
	}

	/** Rewrite just the plan's own Drafts section, leaving the rest of the
	 * note — frontmatter included — exactly as it was. */
	private async writeDraftsToBody(drafts: LedgerDraft[]): Promise<void> {
		const file = this._file;
		if (!file) return;
		this.writingUntil = Date.now() + OWN_WRITE_GRACE_MS;
		await this.plugin.planOperations.writeDrafts(file, drafts);
		// Only if the page is still on that note — see writeNotesToBody.
		if (this._file === file) this.bodyDrafts = drafts;
	}

	/**
	 * Carry drafts that 1.10.2–1.10.6 left inside this plan's Notes back up
	 * into its Drafts section (rescueDraftsFromNotes), and return the body as
	 * written. Worked out from the file as it is when the write lands, not
	 * from what setFile read, so nothing written in between is lost.
	 */
	private async rescuePlanDrafts(file: TFile): Promise<string> {
		this.writingUntil = Date.now() + OWN_WRITE_GRACE_MS;
		let rescued = "";
		await this.app.vault.process(file, (content) => {
			const { frontmatter, body } = splitFrontmatter(content);
			rescued = rescueDraftsFromNotes(body);
			return joinFrontmatter(frontmatter, rescued);
		});
		return rescued;
	}

	/**
	 * Move this plan's own undated drafts out of frontmatter and into its
	 * `## Drafts` section, once — the same move the dashboard's drafts
	 * made, scoped to one note. A draft with a day is left exactly where
	 * it is: it feeds the Timeline from frontmatter, which this doesn't
	 * touch.
	 *
	 * Body first, frontmatter cleared only on success, the same order
	 * every other move here uses — a crash in between leaves the drafts in
	 * both places, and the body wins the next read.
	 */
	private async migratePlanDraftsToBody(): Promise<void> {
		if (!this._file || this.bodyDrafts !== null) return;
		const all = ContactOperations.draftsOf(this.contactData);
		const undated = all.filter((d) => !d.date);
		if (undated.length === 0) return;
		await this.writeDraftsToBody(
			undated.map((d) => ({
				text: d.text,
				created: d.created,
				done: false,
				...(d.generated && { generated: true }),
			}))
		);
		const dated = all.filter((d) => d.date);
		if (dated.length > 0) this.contactData.drafts = dated;
		else delete this.contactData.drafts;
		await this.saveContactData(false);
	}

	/** Whether the draft at this index came from Claude. */
	private draftIsGenerated(index: number): boolean {
		return !!this.planDrafts()[index]?.generated;
	}

	/**
	 * Turn a draft into a plan idea — a timeline item with nowhere on the
	 * calendar yet. Left in place until it's marked Done, same as Make
	 * idea/Make event on the dashboard: filing it as something else isn't
	 * the same as being finished with the thought.
	 */
	private promotePlanDraft(index: number, text: string) {
		new PlanItemModal(
			this.app,
			String(this.contactData.name ?? ""),
			async (value) => {
				this.pushToList("items", value);
				await this.saveContactData();
				this.render();
			},
			{ category: "activity", priority: "must", text }
		).open();
	}

	/** Turn a draft into an event, seeded with its text as the name and
	 * this plan linked — same pattern as the page's own "Add event". Left
	 * in place until Done, like Make idea above. */
	private promotePlanDraftToEvent(text: string) {
		const file = this._file;
		if (!file) return;
		new EventModal(
			this.app,
			this.plugin,
			null,
			() => this.render(),
			{
				people: [`[[${file.basename}]]`],
				variant: "timeline",
			},
			[`[[${file.basename}]]`]
		).open();
	}

	/** Tick a draft off in the plan's own note; it leaves the strip and
	 * stays in the record. */
	private async completePlanDraft(index: number, text: string): Promise<void> {
		const list = this.planDrafts();
		const at = findDraft(list, index, text);
		if (at < 0) return;
		const next = [...list];
		next[at] = { ...next[at], done: true, doneDate: todayISO() };
		await this.writeDraftsToBody(next);
		this.render();
	}

	/** Edit a plan draft's text — and, from here, give it a day, which
	 * moves it onto the Timeline instead of leaving it in this strip. */
	private editPlanDraft(index: number, text: string) {
		const dayOptions = this.planScheduleOptions().dayOptions;
		new NoteInputModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			async (updated, date) => {
				const list = this.planDrafts();
				const at = findDraft(list, index, text);
				if (at < 0) return;
				if (date) {
					// Handed to the Timeline: out of the body list, into
					// frontmatter, where timelineOf reads dated drafts from.
					const next = [...list];
					next.splice(at, 1);
					await this.writeDraftsToBody(next);
					this.pushToList("drafts", {
						text: updated,
						created: list[at].created,
						date,
						...(list[at].generated && { generated: true }),
					});
					await this.saveContactData();
				} else {
					const next = [...list];
					next[at] = { ...next[at], text: updated };
					await this.writeDraftsToBody(next);
				}
				this.render();
			},
			text,
			dayOptions
		).open();
	}

	/**
	 * Edit a draft in place — its text and, on a plan, the day it sits on.
	 * Clearing the day takes it back off the timeline without discarding it,
	 * which is the difference between this and Discard.
	 */
	private openPlanDraftModal(index: number) {
		const drafts = ContactOperations.draftsOf(this.contactData);
		const draft = drafts[index];
		if (!draft) return;
		new NoteInputModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			async (text, date) => {
				const list = ContactOperations.draftsOf(this.contactData);
				const current = list[index];
				if (!current) return;
				list[index] = {
					...current,
					text,
					...(date ? { date } : {}),
				};
				if (!date) delete list[index].date;
				this.contactData.drafts = list;
				await this.saveContactData();
				this.render();
			},
			draft.text,
			this.planScheduleOptions().dayOptions,
			draft.date
		).open();
	}

	/** Read/edit a dated draft from the timeline, and act on it. */
	private openPlanDraftView(index: number) {
		const draft = ContactOperations.draftsOf(this.contactData)[index];
		if (!draft) return;
		const dayOptions = this.planScheduleOptions().dayOptions;

		const writeDraft = async (patch: Partial<Draft>) => {
			const list = ContactOperations.draftsOf(this.contactData);
			const current = list[index];
			if (!current) return;
			list[index] = { ...current, ...patch };
			if (!list[index].date) delete list[index].date;
			this.contactData.drafts = list;
			await this.saveContactData();
			this.render();
		};

		// Consumed by whatever it becomes: the draft goes first, then the
		// real form opens carrying its text and day. Cancelling that form
		// loses the draft — which is what the confirmation warned about.
		const convert = async (
			text: string,
			open: (text: string, date?: string) => void
		) => {
			// The day is written the moment it changes, so the store is
			// current for it; the text may still be mid-edit, so it comes
			// from the modal rather than from disk.
			const date =
				ContactOperations.draftsOf(this.contactData)[index]?.date;
			this.removeDraft(index);
			await this.saveContactData();
			this.render();
			open(text, date);
		};

		new PlanDraftViewModal(
			this.app,
			draft.text,
			draft.date,
			dayOptions,
			(text) => writeDraft({ text }),
			(date) => writeDraft({ date }),
			(text) =>
				convert(text, (text, date) =>
					this.openPlanIdeaModal(null, {
						category: "activity",
						priority: "must",
						text,
						...(date && { date }),
					})
				),
			(text) =>
				convert(text, (text, date) =>
					this.openPlanTravelModal(null, {
						text,
						...(date && { date }),
					})
				),
			async () => {
				this.removeDraft(index);
				await this.saveContactData();
				this.render();
			}
		).open();
	}

	/** A people string as first names, using the plan's own roster. */
	private shortenPlanPeople(people: string): string {
		return shortenPeopleList(
			people,
			this.planParticipants(),
			this.plugin.settings.yourName,
			this.planShortNameOverrides()
		);
	}

	/** Category names known to this plan, offered when adding another idea. */
	private quickIdeaCategories(): string[] {
		return PlanOperations.quickIdeaCategoriesOf(this.contactData);
	}

	private rememberQuickIdeaCategories(categories: string[] | undefined) {
		if (!categories || categories.length === 0) return;
		const known = PlanOperations.quickIdeaCategoriesOf(this.contactData);
		for (const cat of categories) {
			if (!known.some((k) => k.toLowerCase() === cat.toLowerCase())) {
				known.push(cat);
			}
		}
		this.contactData.quickIdeaCategories = known;
	}

	private async writeQuickIdeas(list: PlanQuickIdea[]) {
		if (list.length > 0) this.contactData.quickIdeas = list;
		else delete this.contactData.quickIdeas;
		await this.saveContactData();
		this.render();
	}

	/**
	 * The one real delete for a quick-idea category — rememberQuickIdeaCategories
	 * only ever adds. Stripping it just from the persisted vocabulary isn't
	 * enough: quickIdeaCategoriesOf unions that list with whatever ideas still
	 * reference, so a category left on any idea reappears immediately. Clearing
	 * it from every idea too is what makes the delete stick.
	 */
	private async deleteQuickIdeaCategory(category: string) {
		const matches = (c: string) => c.toLowerCase() === category.toLowerCase();
		const list = PlanOperations.quickIdeasOf(this.contactData);
		for (const idea of list) {
			if (!idea.categories) continue;
			const kept = idea.categories.filter((c) => !matches(c));
			if (kept.length > 0) idea.categories = kept;
			else delete idea.categories;
		}
		const known = this.quickIdeaCategories().filter((c) => !matches(c));
		if (known.length > 0) this.contactData.quickIdeaCategories = known;
		else delete this.contactData.quickIdeaCategories;
		if (list.length > 0) this.contactData.quickIdeas = list;
		else delete this.contactData.quickIdeas;
		await this.saveContactData();
		this.render();
	}

	/** Add (index null) or edit a quick idea. */
	private openQuickIdeaModal(index: number | null, idea: PlanQuickIdea | null) {
		new PlanQuickIdeaModal(
			this.app,
			async (value) => {
				const list = PlanOperations.quickIdeasOf(this.contactData);
				if (index === null) {
					list.push({ ...value, created: value.created || todayISO() });
				} else {
					list[index] = value;
				}
				this.rememberQuickIdeaCategories(value.categories);
				await this.writeQuickIdeas(list);
			},
			idea,
			index === null
				? undefined
				: async () => {
						const list = PlanOperations.quickIdeasOf(
							this.contactData
						);
						list.splice(index, 1);
						await this.writeQuickIdeas(list);
				  },
			this.planScheduleOptions(),
			this.quickIdeaCategories(),
			(category) => this.deleteQuickIdeaCategory(category)
		).open();
	}

	private openQuickIdeaView(index: number) {
		const idea = PlanOperations.quickIdeasOf(this.contactData)[index];
		if (!idea) return;
		new PlanQuickIdeaViewModal(
			this.app,
			idea,
			() => this.openQuickIdeaModal(index, idea),
			async () => {
				const list = PlanOperations.quickIdeasOf(this.contactData);
				list.splice(index, 1);
				await this.writeQuickIdeas(list);
			},
			() => this.promoteQuickIdea(index, idea),
			this.planParticipants(),
			this.plugin.settings.yourName,
			this.planShortNameOverrides()
		).open();
	}

	/**
	 * Move a quick idea onto the timeline, via the ordinary item form.
	 *
	 * The idea is removed inside the item modal's submit handler, not before
	 * it opens — so dismissing that form leaves the idea untouched rather
	 * than destroying it on the way to a decision that never happened.
	 *
	 * Its first candidate day is offered as the date; the rest can't be
	 * carried, since a timeline item happens on one day by definition.
	 */
	private promoteQuickIdea(index: number, idea: PlanQuickIdea) {
		new PlanItemModal(
			this.app,
			String(this.contactData.name ?? ""),
			async (value) => {
				const items = PlanOperations.itemsOf(this.contactData);
				items.push(value);
				this.contactData.items = items;
				// Only now, with the item actually created.
				const list = PlanOperations.quickIdeasOf(this.contactData);
				list.splice(index, 1);
				if (list.length > 0) this.contactData.quickIdeas = list;
				else delete this.contactData.quickIdeas;
				await this.saveContactData();
				this.render();
			},
			null,
			undefined,
			this.planScheduleOptions(),
			{
				text: idea.text,
				category: idea.type ?? "activity",
				priority: "must",
				...(idea.dates?.[0] && { date: idea.dates[0] }),
				...(idea.time && { time: idea.time }),
				...(idea.duration && { duration: idea.duration }),
				...(idea.people && { people: idea.people }),
				...(idea.cost !== undefined && { cost: idea.cost }),
				...(idea.notes && { notes: idea.notes }),
			}
		).open();
	}

	/** Context-aware placeholders for the travel / accommodation modal. */
	private planSimplePlaceholders(key: "travel" | "accommodation") {
		return key === "travel"
			? { text: "e.g. Harry's car to the coast" }
			: { text: "e.g. Beachfront Airbnb" };
	}

	/** Every day of the plan's exact span, or none when it hasn't got one. */
	private planRangeDays(): string[] {
		const startISO = this.exactPlanDay(this.contactData.date);
		const endISO = this.exactPlanDay(this.contactData.endDate);
		if (!startISO || !endISO) return [];
		return this.daysBetween(startISO, endISO);
	}

	/** Collapsed plan sections, tolerant of a hand-edited data.json. */
	private collapsedPlanSections(): string[] {
		const saved = this.plugin.settings.planSectionsCollapsed;
		return Array.isArray(saved) ? saved.map((v) => toText(v)) : [];
	}

	/**
	 * A plan's costs as text, at whatever scope the caller opened it from —
	 * one expense, one person, or the section.
	 *
	 * The build closure re-reads the vault each time a toggle flips, so the
	 * preview follows an edit made in another pane rather than a snapshot
	 * taken when the sheet opened.
	 */
	private openCostShare(scope: ExpenseShareScope) {
		new ShareTextModal(
			this.app,
			shareFieldsFor(scope),
			shareDefaultsFor(scope),
			(detail) =>
				buildExpenseShareText(
					{
						scope,
						expenses: expensesOf(this.contactData),
						credits: creditsOf(this.contactData),
						participants: this.planParticipants(),
						yourName: this.plugin.settings.yourName,
					},
					detail
				),
			async (text) => {
				await navigator.clipboard.writeText(text);
				new Notice("📋 Copied — ready to paste as text");
			},
			// One expense is a handful of lines.
			{ short: scope.kind === "expense" }
		).open();
	}

	/** Every idea as text, from the Ideas section's own button. */
	private openIdeaShare() {
		new ShareTextModal(
			this.app,
			IDEA_SHARE_FIELDS,
			{ ...IDEA_SHARE_DEFAULTS },
			(detail) =>
				buildIdeaShareText(
					PlanOperations.quickIdeasOf(this.contactData),
					detail,
					(people) => this.shortenPlanPeople(people)
				),
			async (text) => {
				await navigator.clipboard.writeText(text);
				new Notice("📋 Copied — ready to paste as text");
			}
		).open();
	}

	/** Every stay as text, from the Accommodation section's own button. */
	private openStayShare() {
		new ShareTextModal(
			this.app,
			STAY_SHARE_FIELDS,
			{ ...STAY_SHARE_DEFAULTS },
			(detail) =>
				buildStayShareText(
					PlanOperations.simpleListOf(
						this.contactData,
						"accommodation"
					),
					detail
				),
			async (text) => {
				await navigator.clipboard.writeText(text);
				new Notice("📋 Copied — ready to paste as text");
			}
		).open();
	}

	/** The whole itinerary as text, from the timeline's own button row. */
	private openPlanShare() {
		new PlanShareModal(
			this.app,
			(detail) => this.buildPlanShareText(detail),
			async (text) => {
				await navigator.clipboard.writeText(text);
				new Notice("📋 Copied — ready to paste as text");
			}
		).open();
	}

	private confirmDeleteTimelineEntry(entry: PlanTimelineEntry) {
		const preview = truncate(entry.text, CONFIRM_PREVIEW_CHARS);
		new ConfirmModal(this.app, {
			title: "Delete from plan",
			message: `Delete "${preview}"?`,
			onConfirm: () => this.deleteTimelineEntry(entry),
		}).open();
	}

	/** Exact YYYY-MM-DD for a plan flex date, or null if not day-precise. */
	private exactPlanDay(value: string | number | undefined): string | null {
		const p = parseFlexDate(value);
		if (isExactFlexDate(p)) {
			return isoDateOf(p.year, p.month, p.day);
		}
		return null;
	}

	/** Inclusive ISO days from start to end (capped for safety). */
	private daysBetween(startISO: string, endISO: string): string[] {
		const days: string[] = [];
		const d = new Date(`${startISO}T00:00:00`);
		const end = new Date(`${endISO}T00:00:00`);
		if (isNaN(d.getTime()) || isNaN(end.getTime()) || end < d) return days;
		let guard = 0;
		while (d <= end && guard++ < MAX_DAY_WALK) {
			days.push(
				isoDay(d)
			);
			d.setDate(d.getDate() + 1);
		}
		return days;
	}

	/** Tapping a timeline row reads it first; Edit/Delete live in that view. */
	private openTimelineEntry(entry: PlanTimelineEntry) {
		// A draft has its own view — the shared one is built around fields
		// it doesn't have, and would label it as accommodation besides.
		if (entry.source === "draft") {
			this.openPlanDraftView(entry.index);
			return;
		}
		new PlanTimelineViewModal(
			this.app,
			entry,
			() => this.editTimelineEntry(entry),
			() => this.deleteTimelineEntry(entry),
			(notes) => this.saveTimelineEntryNotes(entry, notes),
			this.planParticipants(),
			this.plugin.settings.yourName,
			this.planShortNameOverrides(),
			// Drafts returned above, so this is an idea, a leg or a stay —
			// all three carry the text/people/cost the form starts from.
			() => this.createExpenseFromEntry(entry)
		).open();
	}

	/**
	 * "Create expense" on a timeline row: the Cost breakdown's own Add form,
	 * opened with what the row already knows filled in.
	 *
	 * It's a starting point, not a link — the expense is an ordinary one from
	 * the moment it's added, with no tie back to the row. Editing the item's
	 * cost later doesn't chase it, which is deliberate: what a thing was
	 * estimated to cost and what it actually cost are different facts.
	 */
	private createExpenseFromEntry(entry: PlanTimelineEntry) {
		// The row's people are display names in one comma-joined string —
		// the same shape the timeline row renders from.
		const named = (entry.people ?? "")
			.split(",")
			.map((n) => n.trim())
			.filter(Boolean);

		new ExpenseModal(
			this.app,
			this.planParticipants(),
			null,
			(cost) => this.appendExpense(cost),
			undefined,
			this.plugin.settings.yourName,
			(this.plugin.settings.receiptTaxEnabled ? this.plugin.settings.receiptTaxPercent : null),
			(this.plugin.settings.receiptTipEnabled ? this.plugin.settings.receiptTipPercent : null),
			undefined,
			{
				label: entry.text,
				...(entry.cost !== undefined && { amount: entry.cost }),
				...(named.length > 0 && { included: named }),
			}
		).open();
	}

	/** Add a new expense to this plan's Cost breakdown. */
	private async appendExpense(cost: Expense) {
		const list = expensesOf(this.contactData);
		list.push(cost);
		this.contactData.costs = list;
		await this.saveContactData();
		this.render();
	}

	/** Remove a timeline row's underlying item from the plan. */
	private async deleteTimelineEntry(entry: PlanTimelineEntry) {
		if (entry.source === "draft") {
			this.removeDraft(entry.index);
			await this.saveContactData();
			this.render();
			return;
		}
		if (entry.source === "idea") {
			const current = PlanOperations.itemsOf(this.contactData);
			current.splice(entry.index, 1);
			if (current.length > 0) this.contactData.items = current;
			else delete this.contactData.items;
		} else {
			const current = PlanOperations.simpleListOf(
				this.contactData,
				entry.source
			);
			current.splice(entry.index, 1);
			if (current.length > 0) this.contactData[entry.source] = current;
			else delete this.contactData[entry.source];
		}
		await this.saveContactData();
		this.render();
	}

	/**
	 * Patch just the notes on a timeline row's underlying item — the
	 * auto-saving textarea in PlanTimelineViewModal. No `render()` after:
	 * the view modal owns its own DOM and floats above this page, so
	 * rebuilding the page behind it on every debounced keystroke would be
	 * pure waste (and risks a visible flash/scroll jump for no reason,
	 * since nothing about the page's own layout depends on this value).
	 */
	private async saveTimelineEntryNotes(
		entry: PlanTimelineEntry,
		notes: string
	) {
		if (entry.source === "idea") {
			const current = PlanOperations.itemsOf(this.contactData);
			const item = current[entry.index];
			if (!item) return;
			if (notes) item.notes = notes;
			else delete item.notes;
			this.contactData.items = current;
		} else {
			const current = PlanOperations.simpleListOf(
				this.contactData,
				entry.source
			);
			const item = current[entry.index];
			if (!item) return;
			if (notes) item.notes = notes;
			else delete item.notes;
			this.contactData[entry.source] = current;
		}
		await this.saveContactData();
	}

	/** Route a timeline row back to its real item's edit modal. */
	private editTimelineEntry(entry: PlanTimelineEntry) {
		if (entry.source === "draft") {
			this.openPlanDraftModal(entry.index);
			return;
		}
		if (entry.source === "idea") {
			const item =
				PlanOperations.itemsOf(this.contactData)[entry.index] ?? null;
			if (item) this.openPlanIdeaModal(entry.index, item);
			return;
		}
		const item =
			PlanOperations.simpleListOf(this.contactData, entry.source)[
				entry.index
			] ?? null;
		if (!item) return;
		if (entry.source === "travel") {
			this.openPlanTravelModal(entry.index, item);
		} else {
			this.openPlanAccommodationModal(entry.index, item);
		}
	}

	/** Day dropdown (when exact range) + trip people for the item modals. */
	private planScheduleOptions(): ScheduleFieldOptions {
		const opts: ScheduleFieldOptions = {
			people: this.planParticipants(),
		};
		const startISO = this.exactPlanDay(this.contactData.date);
		const endISO = this.exactPlanDay(this.contactData.endDate);
		if (startISO && endISO) {
			opts.dayOptions = this.daysBetween(startISO, endISO).map((d) => ({
				value: d,
				label: formatTimelineDay(d),
				// What a pill shows when the range is short enough for them.
				short: formatDate(new Date(`${d}T00:00:00`), {
					weekday: "long",
				}),
			}));
			opts.lastDay = endISO;
		}
		return opts;
	}

	/**
	 * Add (index null) or edit a travel leg.
	 *
	 * `date` prefills the day for a new leg, from the empty-day rows. Unlike
	 * PlanItemModal there's no separate prefill slot here, so it goes in
	 * through `initial` — which is also what picks the travel type, so the
	 * first type has to be named explicitly or a prefilled Add would open
	 * untyped where a blank one opens on Car.
	 */
	private openPlanTravelModal(
		index: number | null,
		item: PlanSimpleItem | null,
		date?: string
	) {
		new PlanSimpleItemModal(
			this.app,
			index === null ? "Add travel" : "Edit travel",
			item
				? {
						text: item.text,
						type: item.type,
						date: item.date,
						time: item.time,
						people: item.people,
						duration: item.duration,
						booked: item.booked,
						notes: item.notes,
						cost: item.cost,
				  }
				: date
				? { text: "", type: TRAVEL_TYPES[0]?.id, date }
				: null,
			async (value) => {
				const current = PlanOperations.simpleListOf(
					this.contactData,
					"travel"
				);
				if (index === null) current.push(value);
				else current[index] = value;
				this.contactData.travel = current;
				await this.saveContactData();
				this.render();
			},
			this.planSimplePlaceholders("travel"),
			TRAVEL_TYPES,
			true,
			index === null
				? undefined
				: async () => {
						const current = PlanOperations.simpleListOf(
							this.contactData,
							"travel"
						);
						current.splice(index, 1);
						if (current.length > 0)
							this.contactData.travel = current;
						else delete this.contactData.travel;
						await this.saveContactData();
						this.render();
				  },
			this.planScheduleOptions()
		).open();
	}

	/**
	 * Add (index null) or edit a plan idea; used by the list and timeline.
	 *
	 * `date` prefills the day for a brand-new item — passed by the empty-day
	 * rows, which already know which day you clicked on. It rides in through
	 * `prefill` rather than `initial`, so the form still reads as an Add.
	 */
	private openPlanIdeaModal(
		index: number | null,
		item: PlanItem | null,
		date?: string
	) {
		new PlanItemModal(
			this.app,
			String(this.contactData.name ?? ""),
			async (value) => {
				const current = PlanOperations.itemsOf(this.contactData);
				if (index === null) current.push(value);
				else current[index] = value;
				this.contactData.items = current;
				await this.saveContactData();
				this.render();
			},
			item,
			index === null
				? undefined
				: async () => {
						const current = PlanOperations.itemsOf(
							this.contactData
						);
						current.splice(index, 1);
						if (current.length > 0)
							this.contactData.items = current;
						else delete this.contactData.items;
						await this.saveContactData();
						this.render();
				  },
			this.planScheduleOptions(),
			date
				? { category: "activity", priority: "must", text: "", date }
				: null
		).open();
	}

	/** Add (index null) or edit an accommodation; used by the list and timeline. */
	private openPlanAccommodationModal(
		index: number | null,
		item: PlanSimpleItem | null
	) {
		new PlanSimpleItemModal(
			this.app,
			index === null ? "Add accommodation" : "Edit accommodation",
			item
				? {
						text: item.text,
						stay: item.stay,
						date: item.date,
						people: item.people,
						// Read only to migrate a legacy "3 nights" into `nights`.
						duration: item.duration,
						nights: item.nights,
						checkIn: item.checkIn,
						checkOut: item.checkOut,
						address: item.address,
						categories: item.categories,
						booked: item.booked,
						notes: item.notes,
						cost: item.cost,
				  }
				: null,
			async (value) => {
				const current = PlanOperations.simpleListOf(
					this.contactData,
					"accommodation"
				);
				if (index === null) current.push(value);
				else current[index] = value;
				this.contactData.accommodation = current;
				this.rememberStayCategories(value.categories);
				await this.saveContactData();
				this.render();
			},
			this.planSimplePlaceholders("accommodation"),
			null,
			true,
			index === null
				? undefined
				: async () => {
						const current = PlanOperations.simpleListOf(
							this.contactData,
							"accommodation"
						);
						current.splice(index, 1);
						if (current.length > 0)
							this.contactData.accommodation = current;
						else delete this.contactData.accommodation;
						await this.saveContactData();
						this.render();
				  },
			this.planScheduleOptions(),
			true,
			PlanOperations.stayCategoriesOf(this.contactData),
			(category) => this.deleteStayCategory(category)
		).open();
	}

	/** Add any new categories a saved stay carries to the plan's list. */
	private rememberStayCategories(categories: string[] | undefined) {
		if (!categories || categories.length === 0) return;
		const known = PlanOperations.stayCategoriesOf(this.contactData);
		for (const cat of categories) {
			if (!known.some((k) => k.toLowerCase() === cat.toLowerCase())) {
				known.push(cat);
			}
		}
		this.contactData.accommodationCategories = known;
	}

	/**
	 * The one real delete for a stay category — saving only ever adds.
	 * stayCategoriesOf unions the persisted list with whatever stays still
	 * reference, so clearing it from the vocabulary alone would let any stay
	 * still carrying it put it straight back.
	 */
	private async deleteStayCategory(category: string) {
		const matches = (c: string) =>
			c.toLowerCase() === category.toLowerCase();
		const list = PlanOperations.simpleListOf(
			this.contactData,
			"accommodation"
		);
		for (const stay of list) {
			if (!stay.categories) continue;
			stay.categories = stay.categories.filter((c) => !matches(c));
			if (stay.categories.length === 0) delete stay.categories;
		}
		const known = PlanOperations.stayCategoriesOf({
			...this.contactData,
			accommodation: list,
			accommodationCategories: [],
		});
		// An emptied list drops its key, as every other list here does.
		if (known.length > 0) this.contactData.accommodationCategories = known;
		else delete this.contactData.accommodationCategories;
		if (list.length > 0) this.contactData.accommodation = list;
		await this.saveContactData();
		this.render();
	}

	private async writeBring(list: PlanBringItem[]) {
		if (list.length > 0) this.contactData.bring = list;
		else delete this.contactData.bring;
		await this.saveContactData();
		this.render();
	}

	private async updateBringItem(index: number, done: boolean) {
		const list = PlanOperations.bringOf(this.contactData);
		if (!list[index]) return;
		list[index] = { ...list[index], done };
		await this.writeBring(list);
	}

	private async removeBringItem(index: number) {
		const list = PlanOperations.bringOf(this.contactData);
		list.splice(index, 1);
		await this.writeBring(list);
	}

	private async addBringItem(text: string) {
		await this.writeBring([
			...PlanOperations.bringOf(this.contactData),
			{ text, done: false },
		]);
	}

	private planParticipants(): string[] {
		const names = this.planMemberDisplays();
		const yourName = this.plugin.settings.yourName;
		if (
			yourName &&
			!names.some((n) => n.toLowerCase() === yourName.toLowerCase())
		) {
			return [yourName, ...names];
		}
		return names;
	}

	private async writeCosts(list: Expense[]) {
		if (list.length > 0) this.contactData.costs = list;
		else delete this.contactData.costs;
		await this.saveContactData();
		this.render();
	}

	private async deleteCost(index: number) {
		const list = expensesOf(this.contactData);
		list.splice(index, 1);
		await this.writeCosts(list);
	}

	private openCostModal(index: number, cost: Expense) {
		new ExpenseModal(
			this.app,
			this.planParticipants(),
			cost,
			async (updated) => {
				const list = expensesOf(this.contactData);
				list[index] = updated;
				await this.writeCosts(list);
			},
			() => this.deleteCost(index),
			this.plugin.settings.yourName,
			(this.plugin.settings.receiptTaxEnabled ? this.plugin.settings.receiptTaxPercent : null),
			(this.plugin.settings.receiptTipEnabled ? this.plugin.settings.receiptTipPercent : null)
		).open();
	}

	/** Tapping a row reads it first; Edit/Delete live in that view. */
	private openCostView(index: number, cost: Expense) {
		new ExpenseViewModal(
			this.app,
			cost,
			this.planParticipants(),
			() => this.openCostModal(index, cost),
			() => this.deleteCost(index),
			this.plugin.settings.yourName,
			({ paid, settled }) => {
				// Persists the tick state and refreshes the page underneath —
				// the view modal is a separate overlay, so this never disturbs
				// it; it updates its own display once the save resolves.
				const list = expensesOf(this.contactData);
				const current = list[index];
				if (!current) return Promise.resolve();
				const updated: Expense = { ...current, paid };
				if (settled) updated.settled = true;
				else delete updated.settled;
				list[index] = updated;
				return this.writeCosts(list);
			},
			this.planShortNameOverrides(),
			() => this.openCostShare({ kind: "expense", index })
		).open();
	}

	private openCreditModal(index: number | null, credit: Credit | null) {
		const yourName = this.plugin.settings.yourName;
		const creditPeople = this.planParticipants().filter(
			(p) => !yourName || p.toLowerCase() !== yourName.toLowerCase()
		);
		new CreditModal(
			this.app,
			creditPeople,
			credit,
			async (updated) => {
				const list = creditsOf(this.contactData);
				if (index === null) list.push(updated);
				else list[index] = updated;
				this.contactData.credits = list;
				await this.saveContactData();
				this.render();
			},
			index === null
				? undefined
				: async () => {
						const list = creditsOf(this.contactData);
						list.splice(index, 1);
						if (list.length > 0) this.contactData.credits = list;
						else delete this.contactData.credits;
						await this.saveContactData();
						this.render();
				  }
		).open();
	}

	/**
	 * One person's ledger for this plan.
	 *
	 * `rows` is handed over as a function so the modal can redraw itself
	 * from the vault after each tick, rather than over a snapshot taken when
	 * it opened — the same reason the sections take their data as getters.
	 */
	private openBreakdown(person: string) {
		const participants = () => this.planParticipants();
		const yourName = this.plugin.settings.yourName;
		const isYou =
			!!yourName && person.toLowerCase() === yourName.toLowerCase();

		new ExpenseBreakdownModal(
			this.app,
			person,
			() =>
				breakdownFor(
					person,
					expensesOf(this.contactData),
					participants(),
					creditsOf(this.contactData)
				),
			{
				isYou,
				onCopy: () => this.openCostShare({ kind: "person", person }),
				onSetPaid: (index, paid) => {
					const list = expensesOf(this.contactData);
					const cost = list[index];
					if (!cost) return Promise.resolve();
					list[index] = setPaidOn(
						cost,
						person,
						paid,
						participants(),
						yourName
					);
					return this.writeCosts(list);
				},
				onSettleAll: (settled) => {
					const list = expensesOf(this.contactData);
					return this.writeCosts(
						settled
							? settleAllFor(
									person,
									list,
									participants(),
									yourName
							  )
							: list.map((cost) =>
									setPaidOn(
										cost,
										person,
										false,
										participants(),
										yourName
									)
							  )
					);
				},
			}
		).open();
	}

	private openAddExpense() {
		new ExpenseModal(
			this.app,
			this.planParticipants(),
			null,
			(cost) => this.appendExpense(cost),
			undefined,
			this.plugin.settings.yourName,
			(this.plugin.settings.receiptTaxEnabled ? this.plugin.settings.receiptTaxPercent : null),
			(this.plugin.settings.receiptTipEnabled ? this.plugin.settings.receiptTipPercent : null)
		).open();
	}

	private isGroupFile(): boolean {
		return (
			!!this._file &&
			this.plugin.contactOperations.isGroupFile(this._file.path)
		);
	}

	private async removeGroupMember(contact: ContactWithCountdown) {
		const groupName = this._file?.basename.toLowerCase();
		if (!groupName) return;
		await this.plugin.contactOperations.removeFriendFromGroup(
			contact.file,
			groupName
		);
		this.render();
	}

	private openAddGroupMember(candidates: ContactWithCountdown[]) {
		const ops = this.plugin.contactOperations;
		const groupName = this._file?.basename.toLowerCase();
		if (!groupName) return;
		new ContactSuggestModal(
			this.app,
			candidates,
			(contact) =>
				void ops
					.addFriendToGroup(contact.file, groupName)
					.then(() => this.render()),
			`Add to ${ops.groupLabel(groupName)}…`
		).open();
	}

	// Diary entries that [[link]] to this friend — Obsidian-native, via backlinks
	/** Diary entries linking to this person, from the link index alone. */
	private diaryMentions(): DiaryMention[] {
		const file = this._file;
		if (!file) return [];
		// Metadata-only: no diary bodies are read just to check for links.
		const resolved = this.app.metadataCache.resolvedLinks;
		return this.plugin.diaryOperations
			.getEntriesMeta()
			.filter((e) => (resolved[e.file.path]?.[file.path] ?? 0) > 0)
			.map((e) => ({ path: e.file.path, date: e.date, title: e.title }));
	}

	// Migrate legacy giftIdeas -> ideas (category: gift). In-memory on load;
	// the file itself is rewritten on the next save.
	private migrateLegacyGiftIdeas() {
		const legacy = asArray(this.contactData.giftIdeas);
		this.pendingLegacyIdeas = legacy.map((g): Idea => {
			const text = fieldOf(g, "text");
			return {
				category: "gift",
				text: text == null ? toText(g) : toText(text),
				done: !!fieldOf(g, "done"),
			};
		});
		// Before the note has an Ideas section these can just join the
		// frontmatter list, which migrateIdeasToBody then moves wholesale.
		// Afterwards they have to be appended to the body instead, so they
		// stay pending until that runs.
		if (this.bodyIdeas === null && this.pendingLegacyIdeas.length > 0) {
			this.contactData.ideas = [
				...(asArray(this.contactData.ideas) as Idea[]),
				...this.pendingLegacyIdeas,
			];
			this.pendingLegacyIdeas = [];
		}
		delete this.contactData.giftIdeas;
	}

	// Old plan items had a single `bucket`; split into category+priority,
	// and move logistics items to the travel list. In-memory; persists on save.
	private migratePlanStructure() {
		if (!this.isPlanFile()) return;
		const items = asArray(this.contactData.items);
		if (!items.some((i) => isRecord(i) && "bucket" in i)) {
			return;
		}
		const newItems: unknown[] = [];
		const travel = asArray(this.contactData.travel);
		for (const item of items) {
			if (isRecord(item) && "bucket" in item) {
				if (item.bucket === "logistics") {
					travel.push({
						text: item.text,
						...(item.cost ? { cost: item.cost } : {}),
					});
				} else {
					newItems.push({
						text: item.text,
						category: "activity",
						priority: item.bucket === "must" ? "must" : "maybe",
						...(item.cost ? { cost: item.cost } : {}),
					});
				}
			} else {
				newItems.push(item);
			}
		}
		this.contactData.items = newItems;
		if (travel.length > 0) this.contactData.travel = travel;
	}

	private normalizeCategory(idea: Idea): IdeaCategory {
		return IDEA_CATEGORIES.some((c) => c.id === idea.category)
			? idea.category
			: "other";
	}

	private async toggleIdeaDone(index: number, done: boolean) {
		const list = this.ideasList();
		const idea = list[index];
		if (!idea) return;
		list[index] = { ...idea, done };
		await this.writeIdeasToBody(list);
		this.render();
		// A checked idea is usually something that just happened — offer to
		// put it on the timeline with one click.
		if (done) this.offerLogAsEvent(idea);
	}

	private openResurfaceModal(index: number) {
		const idea = this.ideasList()[index];
		if (!idea) return;
		new ResurfaceModal(
			this.app,
			idea.text,
			idea.resurface,
			async (resurface) => {
				const list = this.ideasList();
				const next = { ...list[index] };
				if (resurface) next.resurface = resurface;
				else delete next.resurface;
				list[index] = next;
				await this.writeIdeasToBody(list);
				this.render();
			}
		).open();
	}

	private async deleteIdea(index: number) {
		const list = this.ideasList();
		list.splice(index, 1);
		await this.writeIdeasToBody(list);
		this.render();
	}

	// Capture a raw draft about this friend/plan — appears in the drafts
	// strip to triage later
	private openQuickNote() {
		// A plan's days are offerable; a person's note has no day to sit on.
		const dayOptions = this.isPlanFile()
			? this.planScheduleOptions().dayOptions
			: undefined;
		new NoteInputModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			async (text, date) => {
				// A plan keeps its drafts with it — they take a day, and feed
				// its timeline. Anyone else's go in the dashboard note's
				// checklist, with a link back to them.
				if (!this.isPlanFile() && this._file) {
					await this.plugin.contactOperations.addDraft(text, this._file);
					await this.refreshAboutDrafts();
					return;
				}
				const created = todayISO();
				this.pushToList("drafts", {
					text,
					created,
					...(date && { date }),
				});
				await this.saveContactData();
				this.render();
			},
			undefined,
			dayOptions
		).open();
	}

	private openAddIdeaModal() {
		new QuickIdeaModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			this.lastIdeaCategory,
			async (category, text) => {
				this.lastIdeaCategory = category;
				await this.writeIdeasToBody([
					...this.ideasList(),
					{ category, text, done: false },
				]);
				// The body write leaves frontmatter alone, so the
				// last-updated stamp has to be set separately.
				await this.saveContactData();
				this.render();
			}
		).open();
	}

	/**
	 * The same modal, reopened on an existing idea — category, text, and
	 * whether it still carries the "added by Claude" flag are editable;
	 * done and resurface ride along untouched.
	 */
	private openEditIdeaModal(index: number, idea: Idea) {
		new QuickIdeaModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			this.normalizeCategory(idea),
			async (category, text, generated) => {
				this.lastIdeaCategory = category;
				const list = this.ideasList();
				const updated: Idea = { ...list[index], category, text };
				// Absence over a false flag, same as every other removable
				// marker in this note — a cleared tag leaves no trace.
				if (generated) updated.generated = true;
				else delete updated.generated;
				list[index] = updated;
				await this.writeIdeasToBody(list);
				await this.saveContactData();
				this.render();
			},
			idea.text,
			async () => this.deleteIdea(index),
			idea.generated
		).open();
	}

	/** Unknown/removed categories fall back to "other" so nothing is orphaned. */
	private normalizeInterestCategory(interest: Interest): InterestCategory {
		if (INTEREST_CATEGORIES.some((c) => c.id === interest.category)) {
			return interest.category;
		}
		// Legacy "Movie & TV" → Movie
		if (String(interest.category) === "screen") return "movie";
		// Legacy "Music Genre" → Music, once its own category
		if (String(interest.category) === "musicgenre") return "music";
		return "other";
	}

	/** Fun facts as a list (a legacy multi-line string splits into items). */
	private funFactsOf(): string[] {
		const raw = this.contactData.funFacts;
		if (Array.isArray(raw)) {
			return raw.map((f) => String(f).trim()).filter(Boolean);
		}
		if (typeof raw === "string") {
			// Legacy single field: split on newlines or the " · " separator
			return raw
				.split(/\r?\n|\s·\s/)
				.map((l) => l.trim())
				.filter(Boolean);
		}
		return [];
	}

	/** The person's life goals, still-open first and completed below. */
	private lifeGoalsOf(): LifeGoal[] {
		return parseLifeGoals(this.contactData.lifeGoals);
	}

	private async writeLifeGoals(list: LifeGoal[]) {
		if (list.length > 0) this.contactData.lifeGoals = list;
		else delete this.contactData.lifeGoals;
		await this.saveContactData();
		this.render();
	}

	/**
	 * Things they want to do someday.
	 *
	 * Completed goals stay on the page under their own heading rather than
	 * disappearing — the record is half the point, and "they finally did it"
	 * is worth being able to see.
	 */

	private openLifeGoalModal(index: number | null, goal: LifeGoal | null) {
		new LifeGoalModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			goal,
			async (value) => {
				const list = this.lifeGoalsOf();
				if (index === null) list.push(value);
				else list[index] = value;
				await this.writeLifeGoals(list);
			},
			index === null
				? undefined
				: async () => {
						const list = this.lifeGoalsOf();
						list.splice(index, 1);
						await this.writeLifeGoals(list);
				  }
		).open();
	}

	private openLifeGoalView(index: number) {
		const goal = this.lifeGoalsOf()[index];
		if (!goal) return;
		new LifeGoalViewModal(
			this.app,
			goal,
			// Read afresh: the view's notes may have been typed and saved
			// since it opened, and the form opening with the older copy
			// would write those notes back over them on Save.
			() => this.openLifeGoalModal(index, this.lifeGoalsOf()[index] ?? goal),
			async () => {
				const list = this.lifeGoalsOf();
				list.splice(index, 1);
				await this.writeLifeGoals(list);
			},
			async (notes) => {
				const list = this.lifeGoalsOf();
				if (!list[index]) return;
				if (notes) list[index].notes = notes;
				else delete list[index].notes;
				if (list.length > 0) this.contactData.lifeGoals = list;
				await this.saveContactData();
				// No render(): the modal is still open over this page, and
				// rebuilding underneath it on every keystroke pause is work
				// nobody can see. The next open reads the saved value.
			},
			async (done) => {
				const list = this.lifeGoalsOf();
				if (!list[index]) return;
				if (done) {
					list[index].done = true;
					list[index].completed = todayISO();
				} else {
					delete list[index].done;
					delete list[index].completed;
				}
				await this.writeLifeGoals(list);
			},
			() => this.openAddIdeaModal(),
			() => this.openAddEventModal()
		).open();
	}

	/** Add (index null) or edit a fun fact; Delete is offered when editing. */
	private openFunFactModal(index: number | null, fact: string | null) {
		new FunFactsModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			async (value) => {
				if (!value) return;
				const arr = this.funFactsOf();
				if (index === null) arr.push(value);
				else arr[index] = value;
				this.contactData.funFacts = arr;
				await this.saveContactData();
				this.render();
			},
			fact,
			index === null
				? undefined
				: async () => {
						const arr = this.funFactsOf();
						arr.splice(index, 1);
						if (arr.length > 0) this.contactData.funFacts = arr;
						else delete this.contactData.funFacts;
						await this.saveContactData();
						this.render();
				  }
		).open();
	}

	/** Quotes still in frontmatter — the pre-migration source. Legacy plain
	 * strings read as `{ text }`. */
	private frontmatterQuotes(): Quote[] {
		return asArray(this.contactData.quotes)
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
	private quotesOf(): Quote[] {
		return this.bodyQuotes ?? this.frontmatterQuotes();
	}

	/**
	 * Move a note's quotes out of frontmatter and into the body, once.
	 *
	 * Ordered so a failure is always recoverable: the body is written
	 * first, and only a successful write clears the frontmatter key. If the
	 * second step fails the quotes exist in both places, the body wins on
	 * the next read, and the stale key is cleared then.
	 */
	private async migrateQuotesToBody(): Promise<void> {
		if (!this._file) return;
		// Already migrated — but a previous run may have died between the
		// two writes, so clear any leftover key.
		if (this.bodyQuotes !== null) {
			if (this.contactData.quotes !== undefined) {
				delete this.contactData.quotes;
				await this.saveContactData(false);
			}
			return;
		}
		const quotes = this.frontmatterQuotes();
		if (quotes.length === 0) return;
		await this.writeQuotesToBody(quotes);
		delete this.contactData.quotes;
		await this.saveContactData(false);
	}

	/** Rewrite just the Quotes section, leaving the rest of the note —
	 * frontmatter included — exactly as it was. */
	private async writeQuotesToBody(quotes: Quote[]): Promise<void> {
		const file = this._file;
		if (!file) return;
		this.writingUntil = Date.now() + OWN_WRITE_GRACE_MS;
		await this.plugin.contactOperations.writeQuotes(file, quotes);
		// Only if the page is still on that note — see writeNotesToBody.
		if (this._file === file) this.bodyQuotes = quotes;
	}

	/** Normalized inside-joke list (legacy plain strings read as { text }). */
	private insideJokesOf(): InsideJoke[] {
		return asArray(this.contactData.insideJokes)
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

	private openInsideJokeModal(index: number | null, joke: InsideJoke | null) {
		new InsideJokeModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			joke,
			async (value) => {
				const list = this.insideJokesOf();
				if (index === null) list.push(value);
				else list[index] = value;
				this.contactData.insideJokes = list;
				await this.saveContactData();
				this.render();
			},
			index === null
				? undefined
				: async () => {
						const list = this.insideJokesOf();
						list.splice(index, 1);
						if (list.length > 0) this.contactData.insideJokes = list;
						else delete this.contactData.insideJokes;
						await this.saveContactData();
						this.render();
				  }
		).open();
	}

	private openQuoteModal(index: number | null, quote: Quote | null) {
		new QuoteModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			quote,
			async (value) => {
				const list = this.quotesOf();
				if (index === null) list.push(value);
				else list[index] = value;
				await this.writeQuotesToBody(list);
				this.render();
			},
			index === null
				? undefined
				: async () => {
						const list = this.quotesOf();
						list.splice(index, 1);
						await this.writeQuotesToBody(list);
						this.render();
				  }
		).open();
	}

	private async removeInterest(index: number) {
		this.removeFromList("interests", index);
		await this.saveContactData();
		this.render();
	}

	/** The interest's own modal, reopened on it — Delete sits in there. */
	private openEditInterestModal(index: number) {
		const interest = (asArray(this.contactData.interests) as Interest[])[
			index
		];
		if (!interest) return;
		new InterestModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			this.normalizeInterestCategory(interest),
			async (category, text, detail, detail2, notes) => {
				const list = [...(asArray(this.contactData.interests) as Interest[])];
				list[index] = {
					category,
					text,
					...(detail && { detail }),
					...(detail2 && { detail2 }),
					...(notes && { notes }),
				};
				this.contactData.interests = list;
				await this.saveContactData();
				this.render();
			},
			interest,
			() => this.removeInterest(index)
		).open();
	}

	/**
	 * An idea seeded from an interest — its name, with the first detail in
	 * brackets ("East of Eden (John Steinbeck)"), filed under the idea
	 * category the interest's type points at. Editable before it's saved.
	 */
	private makeIdeaFromInterest(index: number) {
		const interest = (asArray(this.contactData.interests) as Interest[])[
			index
		];
		if (!interest) return;
		const type = INTEREST_CATEGORIES.find(
			(c) => c.id === this.normalizeInterestCategory(interest)
		);
		const text = interest.detail
			? `${interest.text} (${interest.detail})`
			: interest.text;
		new QuickIdeaModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			type?.ideaCategory ?? this.lastIdeaCategory,
			async (category, ideaText) => {
				this.lastIdeaCategory = category;
				await this.writeIdeasToBody([
					...this.ideasList(),
					{ category, text: ideaText, done: false },
				]);
				// The body write leaves frontmatter alone, so the
				// last-updated stamp has to be set separately.
				await this.saveContactData();
				this.render();
			},
			text
		).open();
	}

	private openAddInterestModal() {
		new InterestModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			this.lastInterestCategory,
			async (category, text, detail, detail2, notes) => {
				this.lastInterestCategory = category;
				this.pushToList("interests", {
					category,
					text,
					...(detail && { detail }),
					...(detail2 && { detail2 }),
					...(notes && { notes }),
				});
				await this.saveContactData();
				this.render();
			}
		).open();
	}

	/**
	 * @param container The section wrap — the Edit button hangs off this, so
	 * on the person page it stays visible while the section is collapsed.
	 * @param body The collapsible area holding the rendered markdown.
	 */
	private async renderExtrasSection(
		container: HTMLElement,
		body: HTMLElement
	) {
		const extrasSection = body.createDiv({
			cls: "contact-extras-section",
		});

		if (!this._file) return;

		const headerContainer = extrasSection.createDiv({
			cls: "contact-extras-header",
		});

		// Add helper text if no markdown content
		const content = await this.app.vault.cachedRead(this._file);
		const extrasContent =
			content.split(/^---\n([\s\S]*?)\n---/).pop() || "";

		if (!extrasContent.trim()) {
			headerContainer.createDiv({
				cls: "section-helper-text",
				text: "Add formatted text, links, and other Markdown content",
			});
		}

		try {
			const content = await this.app.vault.cachedRead(this._file);
			const extrasContent =
				content.split(/^---\n([\s\S]*?)\n---/).pop() || "";

			if (extrasContent.trim()) {
				const contentDiv = extrasSection.createDiv({
					cls: "contact-extras-content",
				});

				await MarkdownRenderer.render(
					this.app,
					extrasContent,
					contentDiv,
					this._file.path,
					this
				);

				contentDiv.addEventListener("click", (event) =>
					this.followRenderedLink(event, contentDiv)
				);
			}
		} catch (error) {
			console.error(
				`Error reading extras from file ${this._file.path}:`,
				error
			);
		}

		// Outside the accordion body, so it's reachable without expanding.
		// It no longer sits inside .contact-extras-section, so it brings its
		// own gutters rather than inheriting that section's padding.
		const footer = container.createDiv({
			cls: "contact-section-footer contact-extras-footer",
		});
		const editButton = footer.createEl("button", {
			cls: "callander-button",
			text: "Edit markdown",
		});
		editButton.addEventListener("click", () => {
			// Bypass the contact-view intercept — here we WANT raw markdown
			this.plugin.openPathAsMarkdown(this._file?.path || "");
		});
	}

	/**
	 * Write what this page changed in the note's frontmatter since it last
	 * read or wrote it (frontmatterPatch): changed keys are set, removed keys
	 * deleted, and every other key left exactly as it is on disk. So clearing
	 * a list or field always sticks, and a key another device changed since
	 * the page loaded isn't written over with the page's older copy. A failed
	 * read leaves nothing to compare against, so it writes nothing.
	 *
	 * Saves run one at a time, and only into the note the data was read
	 * from: one that starts while the page is moving to another note is
	 * dropped rather than written into it.
	 *
	 * @param stamp Whether this counts as a user edit. Migrations pass
	 * false: moving a field between storage formats shouldn't make every
	 * friend look like you touched them today.
	 */
	async saveContactData(stamp = true) {
		const file = this._file;
		if (!file) return;
		const save = this.saveQueue.then(() =>
			this.writeContactData(file, stamp)
		);
		this.saveQueue = save.catch(() => undefined);
		await save;
	}

	private async writeContactData(file: TFile, stamp: boolean) {
		if (this._file !== file || this.dataFile !== file) return;

		// A copy taken now, not after the write: an edit made while the
		// write is in flight belongs to the next save, not to this one.
		const next = snapshotFrontmatter(this.contactData);
		const patch = frontmatterPatch(this.savedFrontmatter, next);
		// People and plans carry a last-updated stamp; group pages don't
		const stampUpdated =
			stamp &&
			(this.plugin.contactOperations.isPersonFile(file.path) ||
				file.path.startsWith(
					this.plugin.planOperations.getPlansFolderPath() + "/"
				));

		if (stampUpdated || !isEmptyPatch(patch)) {
			// Our own write will fire a modify event — ignore it briefly so
			// we don't reload on top of ourselves
			this.writingUntil = Date.now() + FRONTMATTER_WRITE_GRACE_MS;
			await this.app.fileManager.processFrontMatter(
				file,
				(frontmatter: Record<string, unknown>) => {
					applyFrontmatterPatch(frontmatter, patch);
					if (stampUpdated) frontmatter.updated = todayISO();
				}
			);
			this.savedFrontmatter = next;
		}

		// `contactData` was mutated before this ran, so the islands are
		// already behind by the time the write lands. Bumping here rather
		// than at each of its fifty-odd call sites means a ported section
		// updates whether or not its caller also redraws the imperative DOM
		// — and the double bump when one does costs a re-render of a small
		// tree, not a re-read of the vault.
		this.store.bump();
	}

	// Modal methods
	private async openAddFieldModal() {
		const modal = new AddFieldModal(this.app, async (fieldName) => {
			if (!this.contactData[fieldName]) {
				this.contactData[fieldName] = "";
				await this.saveContactData();
				this.render();
			} else {
				new Notice("Field already exists!");
			}
		});
		modal.open();
	}

	private openAddEventModal() {
		const file = this._file;
		if (!file) return;
		new EventModal(
			this.app,
			this.plugin,
			null,
			() => this.render(),
			{
				// The event lands on this page's timeline; more people can be
				// picked in the modal, and it reaches their timelines too.
				people: [`[[${file.basename}]]`],
				// Started from someone's page, so it's a record of them by
				// default — the modal's tick opts it onto your calendar too.
				variant: "timeline",
			},
			// Removing them would leave the event with nowhere to land.
			[`[[${file.basename}]]`],
			true
		).open();
	}

	/** Log a quick event on this page's timeline (idea done → timeline). */
	private async addEvent(
		date: string,
		text: string,
		type: EventType,
		file: TFile | null = this._file
	) {
		if (!file) return;
		await this.plugin.eventOperations.createEvent({
			name: text,
			date,
			type,
			people: [`[[${file.basename}]]`],
			// Added from someone's page: a record of them, not a calendar
			// entry, so it stays on their timeline.
			variant: "timeline",
		});
		this.render();
	}

	public openEditEventModal(event: EventInfo) {
		const file = this._file;
		new EventModal(
			this.app,
			this.plugin,
			event,
			() => this.render(),
			undefined,
			// Locked, not just pre-filled: removing the person whose page
			// this is would leave the event with nowhere to land, same as
			// on Add. Other people on the event stay removable as normal.
			file ? [`[[${file.basename}]]`] : [],
			true
		).open();
	}

	public async deleteEvent(event: EventInfo) {
		await this.plugin.eventOperations.deleteEvent(event.file);
		this.render();
	}

	async updateContactData(field: string, value: string | string[]) {
		// An emptied list drops its key instead of storing `[]` — a bare
		// empty array shows as a property with no values in Obsidian's own
		// UI, which reads as "set to nothing" rather than "not set".
		if (Array.isArray(value) && value.length === 0) {
			delete this.contactData[field];
		} else {
			this.contactData[field] = value;
		}
		await this.saveContactData();
	}
}
