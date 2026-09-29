import { parseYaml, type TFile } from "obsidian";
import type { Idea, Quote } from "@/types";
import { ContactOperations } from "@/services/ContactOperations";
import { todayISO } from "@/utils/flexdate";
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
	parseDraftsSection,
	type LedgerDraft,
} from "@/utils/draftsMarkdown";
import {
	adoptNotes,
	normalizeNotes,
	parseNotesSection,
	rescueDraftsFromNotes,
} from "@/utils/notesMarkdown";
import type { PageContext } from "@/views/ContactPageView/context";
import {
	ContactPageModel,
	toContactFrontmatter,
	type PageKind,
} from "@/views/ContactPageView/model";

/**
 * One write by the page into `model`'s note: counted as the page's own, so
 * its `modify` doesn't reload the page on top of itself (OwnWrites), and
 * reported once it lands (PageContext.wrote).
 */
async function ownWrite<T>(
	ctx: PageContext,
	model: ContactPageModel,
	file: TFile,
	write: () => Promise<T>
): Promise<T> {
	try {
		return await ctx.ownWrites.run(file, write);
	} finally {
		ctx.wrote(model);
	}
}

/** Rewrite just the Ideas section, leaving the rest of the note —
 * frontmatter included — exactly as it was. */
export async function writeIdeas(
	ctx: PageContext,
	model: ContactPageModel,
	ideas: Idea[]
): Promise<void> {
	const file = model.file;
	if (!file) return;
	await ownWrite(ctx, model, file, () =>
		ctx.plugin.contactOperations.writeIdeas(file, ideas)
	);
	model.bodyIdeas = ideas;
}

/** Rewrite just the notes, leaving the generated sections — and the
 * frontmatter — exactly as they were. */
export async function writeNotes(
	ctx: PageContext,
	model: ContactPageModel,
	notes: string
): Promise<void> {
	const file = model.file;
	if (!file) return;
	await ownWrite(ctx, model, file, () =>
		ctx.plugin.contactOperations.writeNotes(file, notes)
	);
	model.bodyNotes = normalizeNotes(notes);
}

/** Rewrite just the Quotes section, leaving the rest of the note —
 * frontmatter included — exactly as it was. */
export async function writeQuotes(
	ctx: PageContext,
	model: ContactPageModel,
	quotes: Quote[]
): Promise<void> {
	const file = model.file;
	if (!file) return;
	await ownWrite(ctx, model, file, () =>
		ctx.plugin.contactOperations.writeQuotes(file, quotes)
	);
	model.bodyQuotes = quotes;
}

/** Rewrite just the plan's own Drafts section, leaving the rest of the
 * note — frontmatter included — exactly as it was. */
export async function writePlanDrafts(
	ctx: PageContext,
	model: ContactPageModel,
	drafts: LedgerDraft[]
): Promise<void> {
	const file = model.file;
	if (!file) return;
	await ownWrite(ctx, model, file, () =>
		ctx.plugin.planOperations.writeDrafts(file, drafts)
	);
	model.bodyDrafts = drafts;
}

/**
 * Write what the page changed in the note's frontmatter since it last read
 * or wrote it (frontmatterPatch): changed keys are set, removed keys
 * deleted, and every other key left exactly as it is on disk. So clearing
 * a list or field always sticks, and a key another device changed since
 * the page loaded isn't written over with the page's older copy. A failed
 * read leaves nothing to compare against, so it writes nothing.
 *
 * Saves run one at a time per model, and always into the model's own note
 * — including one still running after the page has moved on.
 *
 * @param stamp Whether this counts as a user edit. Migrations pass
 * false: moving a field between storage formats shouldn't make every
 * friend look like you touched them today.
 */
export async function saveModel(
	ctx: PageContext,
	model: ContactPageModel,
	{ stamp = true }: { stamp?: boolean } = {}
): Promise<void> {
	const save = model.saveQueue.then(() => writePatch(ctx, model, stamp));
	model.saveQueue = save.catch(() => undefined);
	await save;
}

async function writePatch(
	ctx: PageContext,
	model: ContactPageModel,
	stamp: boolean
): Promise<void> {
	const { file, saved } = model;
	if (!file || !saved) return;

	// A copy taken now, not after the write: an edit made while the
	// write is in flight belongs to the next save, not to this one.
	const next = snapshotFrontmatter(model.data);
	const patch = frontmatterPatch(saved, next);
	// People and plans carry a last-updated stamp; group pages don't
	const stampUpdated =
		stamp && (model.kind === "person" || model.kind === "plan");

	if (stampUpdated || !isEmptyPatch(patch)) {
		await ownWrite(ctx, model, file, () =>
			ctx.app.fileManager.processFrontMatter(
				file,
				(frontmatter: Record<string, unknown>) => {
					applyFrontmatterPatch(frontmatter, patch);
					if (stampUpdated) frontmatter.updated = todayISO();
				}
			)
		);
		model.saved = next;
	}

	// The model was changed before this ran, so the islands are already
	// behind by the time the write lands. Bumping here rather than at each
	// of its fifty-odd call sites means a ported section updates whether or
	// not its caller also redraws the imperative DOM — and the double bump
	// when one does costs a re-render of a small tree, not a re-read of the
	// vault.
	ctx.store.bump();
}

/**
 * Read a note into a new model and bring its storage up to date (readInto).
 * A note that can't be read comes back as an unread model: the page shows
 * its empty state and nothing can be saved over the note.
 */
export async function loadModel(
	ctx: PageContext,
	file: TFile,
	{ kind, stillWanted }: { kind: PageKind; stillWanted: () => boolean }
): Promise<ContactPageModel> {
	const model = ContactPageModel.unread(file, kind);
	try {
		await readInto(
			ctx,
			model,
			await ctx.app.vault.cachedRead(file),
			stillWanted
		);
	} catch (error) {
		console.error(`Error reading contact file ${file.path}:`, error);
		model.forget();
	}
	return model;
}

/**
 * Read the note on screen again, into the model already showing it — after
 * a sync, an edit in another pane, or a write elsewhere in the plugin. One
 * model per note rather than one per read: a form still open over the page
 * then goes on working with the note as it is now.
 *
 * What the page changed and hasn't saved yet stays on top of what's read,
 * as a save would write it. Saves already queued land first, so the read
 * includes them.
 *
 * "stale" when the page moved on, or a newer read started, before this one
 * had anything to show; nothing is changed then.
 */
export async function reloadModel(
	ctx: PageContext,
	model: ContactPageModel,
	stillWanted: () => boolean
): Promise<"done" | "stale"> {
	const file = model.file;
	if (!file) return "stale";
	await model.saveQueue;
	try {
		const content = await ctx.app.vault.cachedRead(file);
		if (!stillWanted()) return "stale";
		await readInto(ctx, model, content, stillWanted);
	} catch (error) {
		console.error(`Error reading contact file ${file.path}:`, error);
		model.forget();
	}
	return stillWanted() ? "done" : "stale";
}

/**
 * Parse a note's `content` into `model`, then bring its storage up to date:
 * the one-time moves of quotes, ideas, notes and drafts out of frontmatter
 * and into the body, then the drafts about this person from the dashboard.
 *
 * `stillWanted` is asked between steps. Every step writes only this
 * note, so stopping early is never a hazard; it just doesn't finish work
 * for a note the page has already left, which the next read picks up.
 */
async function readInto(
	ctx: PageContext,
	model: ContactPageModel,
	content: string,
	stillWanted: () => boolean
): Promise<void> {
	const file = model.file;
	if (!file) return;
	const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
	const parsed: unknown = yamlMatch ? parseYaml(yamlMatch[1]) : {};
	const fresh = toContactFrontmatter(parsed);
	// What the page changed since it last read or wrote the note and
	// hasn't saved: kept on top of the note as it is now. Nothing, on a
	// first read.
	const unsaved =
		model.saved &&
		frontmatterPatch(model.saved, snapshotFrontmatter(model.data));
	model.data = fresh;
	// Before the in-memory migrations below, so what they change counts
	// as a change and reaches disk with the next save.
	model.saved = snapshotFrontmatter(fresh);
	if (unsaved) applyFrontmatterPatch(model.data, unsaved);
	const { kind } = model;
	// Quotes live in the body; the same read serves both, so this costs
	// no extra I/O.
	let body = splitFrontmatter(content).body;
	if (kind === "plan" && rescueDraftsFromNotes(body) !== body) {
		body = await rescuePlanDrafts(ctx, model, file);
		if (!stillWanted()) return;
	}
	model.bodyQuotes = parseQuotesSection(body);
	model.bodyIdeas = parseIdeasSection(body);
	model.bodyNotes = parseNotesSection(body);
	model.bodyDrafts =
		kind === "plan"
			? parseDraftsSection(body, PAGE_DRAFTS_SECTION)
			: null;
	migrateLegacyGiftIdeas(model);
	migratePlanStructure(model);
	await migrateQuotesToBody(ctx, model);
	if (!stillWanted()) return;
	await migrateIdeasToBody(ctx, model);
	if (!stillWanted()) return;
	await migrateNotesToBody(ctx, model, body);
	if (!stillWanted()) return;
	if (kind === "plan") {
		await migratePlanDraftsToBody(ctx, model);
	} else if (model.data.drafts !== undefined) {
		// A note that synced in still holding drafts in frontmatter is
		// carried to the dashboard's checklist before it's read from there.
		await ctx.plugin.contactOperations.migrateDraftsToDashboard();
	}
	if (!stillWanted()) return;
	await loadAboutDrafts(ctx, model);
}

/**
 * Carry drafts that 1.10.2–1.10.6 left inside this plan's Notes back up
 * into its Drafts section (rescueDraftsFromNotes), and return the body as
 * written. Worked out from the file as it is when the write lands, not
 * from what readInto read, so nothing written in between is lost.
 */
async function rescuePlanDrafts(
	ctx: PageContext,
	model: ContactPageModel,
	file: TFile
): Promise<string> {
	let rescued = "";
	await ownWrite(ctx, model, file, () =>
		ctx.app.vault.process(file, (content) => {
			const { frontmatter, body } = splitFrontmatter(content);
			rescued = rescueDraftsFromNotes(body);
			return joinFrontmatter(frontmatter, rescued);
		})
	);
	return rescued;
}

// Migrate legacy giftIdeas -> ideas (category: gift). In-memory on load;
// the file itself is rewritten on the next save.
function migrateLegacyGiftIdeas(model: ContactPageModel) {
	const legacy = asArray(model.data.giftIdeas);
	model.pendingLegacyIdeas = legacy.map((g): Idea => {
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
	if (model.bodyIdeas === null && model.pendingLegacyIdeas.length > 0) {
		model.data.ideas = [
			...(asArray(model.data.ideas) as Idea[]),
			...model.pendingLegacyIdeas,
		];
		model.pendingLegacyIdeas = [];
	}
	delete model.data.giftIdeas;
}

// Old plan items had a single `bucket`; split into category+priority,
// and move logistics items to the travel list. In-memory; persists on save.
function migratePlanStructure(model: ContactPageModel) {
	if (model.kind !== "plan") return;
	const items = asArray(model.data.items);
	if (!items.some((i) => isRecord(i) && "bucket" in i)) {
		return;
	}
	const newItems: unknown[] = [];
	const travel = asArray(model.data.travel);
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
	model.data.items = newItems;
	if (travel.length > 0) model.data.travel = travel;
}

/**
 * Move a note's quotes out of frontmatter and into the body, once.
 *
 * Ordered so a failure is always recoverable: the body is written
 * first, and only a successful write clears the frontmatter key. If the
 * second step fails the quotes exist in both places, the body wins on
 * the next read, and the stale key is cleared then.
 */
async function migrateQuotesToBody(
	ctx: PageContext,
	model: ContactPageModel
): Promise<void> {
	// Already migrated — but a previous run may have died between the
	// two writes, so clear any leftover key.
	if (model.bodyQuotes !== null) {
		if (model.data.quotes !== undefined) {
			delete model.data.quotes;
			await saveModel(ctx, model, { stamp: false });
		}
		return;
	}
	const quotes = model.frontmatterQuotes();
	if (quotes.length === 0) return;
	await writeQuotes(ctx, model, quotes);
	delete model.data.quotes;
	await saveModel(ctx, model, { stamp: false });
}

/**
 * Move this note's ideas out of frontmatter and into the body, once.
 * Body first, frontmatter keys cleared only on success — so a failure
 * in between leaves the data in both places, the body wins next read,
 * and the stale keys are cleared then.
 */
async function migrateIdeasToBody(
	ctx: PageContext,
	model: ContactPageModel
): Promise<void> {
	const hasStaleKeys =
		model.data.ideas !== undefined || model.data.giftIdeas !== undefined;

	if (model.bodyIdeas !== null) {
		// Already migrated. A legacy `giftIdeas` key found now has
		// never been folded in, so it's appended; a stale `ideas` key
		// is just a crash between the two writes below, and the body
		// already holds those — dropping it can't lose anything.
		if (model.pendingLegacyIdeas.length > 0) {
			await writeIdeas(ctx, model, [
				...model.bodyIdeas,
				...model.pendingLegacyIdeas,
			]);
			model.pendingLegacyIdeas = [];
		}
		if (hasStaleKeys) {
			delete model.data.ideas;
			delete model.data.giftIdeas;
			await saveModel(ctx, model, { stamp: false });
		}
		return;
	}

	const ideas = asArray(model.data.ideas) as Idea[];
	if (ideas.length === 0) return;
	await writeIdeas(ctx, model, ideas);
	delete model.data.ideas;
	delete model.data.giftIdeas;
	await saveModel(ctx, model, { stamp: false });
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
 * `body` is what readInto read; it only decides whether there's anything
 * to do. The write itself works from the file as it is by then, since
 * the ideas and quotes moves may have just rewritten it.
 */
async function migrateNotesToBody(
	ctx: PageContext,
	model: ContactPageModel,
	body: string
): Promise<void> {
	const file = model.file;
	if (!file) return;
	const older =
		model.data.notes === undefined ? "" : toText(model.data.notes);
	if (adoptNotes(body, older) !== body) {
		let notes: string | null = null;
		await ownWrite(ctx, model, file, () =>
			ctx.app.vault.process(file, (content) => {
				const split = splitFrontmatter(content);
				const next = adoptNotes(split.body, older);
				notes = parseNotesSection(next);
				return joinFrontmatter(split.frontmatter, next);
			})
		);
		model.bodyNotes = notes;
	}
	if (model.data.notes === undefined) return;
	delete model.data.notes;
	await saveModel(ctx, model, { stamp: false });
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
async function migratePlanDraftsToBody(
	ctx: PageContext,
	model: ContactPageModel
): Promise<void> {
	if (model.bodyDrafts !== null) return;
	const all = ContactOperations.draftsOf(model.data);
	const undated = all.filter((d) => !d.date);
	if (undated.length === 0) return;
	await writePlanDrafts(
		ctx,
		model,
		undated.map((d) => ({
			text: d.text,
			created: d.created,
			done: false,
			...(d.generated && { generated: true }),
		}))
	);
	const dated = all.filter((d) => d.date);
	if (dated.length > 0) model.data.drafts = dated;
	else delete model.data.drafts;
	await saveModel(ctx, model, { stamp: false });
}

/**
 * Read the drafts about this person from the dashboard note. Plans keep
 * theirs in their own frontmatter — those carry a day, and feed the
 * plan's timeline — so this is for everyone else.
 */
export async function loadAboutDrafts(
	ctx: PageContext,
	model: ContactPageModel
): Promise<void> {
	const file = model.file;
	if (!file || model.kind === "plan") {
		model.aboutDrafts = [];
		return;
	}
	const ops = ctx.plugin.contactOperations;
	const drafts = await ops.readDrafts();
	model.aboutDrafts = drafts
		.map((draft, index) => ({ draft, index }))
		.filter(
			({ draft }) =>
				!draft.done && ops.draftAbout(draft)?.path === file.path
		);
}
