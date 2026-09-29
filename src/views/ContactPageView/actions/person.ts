import { Notice } from "obsidian";
import type {
	ContactWithCountdown,
	EventInfo,
	InsideJoke,
	Interest,
	LifeGoal,
	Quote,
} from "@/types";
import { AddFieldModal } from "@/modals/AddFieldModal";
import { LifeGoalModal } from "@/modals/LifeGoalModal";
import { LifeGoalViewModal } from "@/modals/LifeGoalViewModal";
import { EventModal } from "@/modals/EventModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { ContactSuggestModal } from "@/modals/QuickIdeaModal";
import { InterestModal } from "@/modals/InterestModal";
import { NoteInputModal } from "@/modals/NoteInputModal";
import { FunFactsModal } from "@/modals/FunFactsModal";
import { QuoteModal } from "@/modals/QuoteModal";
import { InsideJokeModal } from "@/modals/InsideJokeModal";
import { todayISO } from "@/utils/flexdate";
import { asArray } from "@/utils/fm";
import { normalizeInterestCategory } from "@/utils/contactPage";
import { saveModel, writeQuotes } from "@/views/ContactPageView/persistence";
import { planScheduleOptions } from "@/views/ContactPageView/actions/planItems";
import { openAddIdeaModal } from "@/views/ContactPageView/actions/ideas";
import type { PageContext } from "@/views/ContactPageView/context";
import type { ContactPageModel } from "@/views/ContactPageView/model";

/** Trash this person's note, then leave the page it was showing. */
export function confirmDeletePerson(ctx: PageContext, model: ContactPageModel) {
	const file = model.file;
	if (!file) return;
	const name = model.data.name || file.basename;
	new ConfirmModal(ctx.app, {
		title: "Remove friend",
		message: `Are you sure you want to remove ${file.basename}? Their note will be moved to your trash.`,
		failure: "Couldn't delete",
		onConfirm: async () => {
			await ctx.plugin.contactOperations.deleteContact(file);
			new Notice(`Deleted "${name}"`);
			// This view is now showing a file that no longer exists.
			ctx.leaf.detach();
			await ctx.plugin.activateDashboard();
		},
	}).open();
}

export function editDraft(
	ctx: PageContext,
	model: ContactPageModel,
	index: number,
	text: string
) {
	const about = model.aboutDrafts[index];
	if (!about) return;
	new NoteInputModal(
		ctx.app,
		model.data.displayName || model.data.name || "",
		async (updated) => {
			// Reworded in the note, keeping its date, person and box.
			await ctx.plugin.contactOperations.updateDraft(
				about.index,
				about.draft.text,
				{ text: updated }
			);
		},
		text
	).open();
}

/** Tick a draft off in the dashboard note; it leaves this strip and
 * stays in the record. */
export async function completeAboutDraft(
	ctx: PageContext,
	model: ContactPageModel,
	index: number
): Promise<void> {
	const about = model.aboutDrafts[index];
	if (!about) return;
	// The page hears the dashboard note change, and redraws the strip.
	await ctx.plugin.contactOperations.completeDraft(
		about.index,
		about.draft.text
	);
}

export async function removeGroupMember(
	ctx: PageContext,
	model: ContactPageModel,
	contact: ContactWithCountdown
) {
	const groupName = model.file?.basename.toLowerCase();
	if (!groupName) return;
	// A write to their note, which the page hears.
	await ctx.plugin.contactOperations.removeFriendFromGroup(
		contact.file,
		groupName
	);
}

export function openAddGroupMember(
	ctx: PageContext,
	model: ContactPageModel,
	candidates: ContactWithCountdown[]
) {
	const ops = ctx.plugin.contactOperations;
	const groupName = model.file?.basename.toLowerCase();
	if (!groupName) return;
	new ContactSuggestModal(
		ctx.app,
		candidates,
		(contact) => void ops.addFriendToGroup(contact.file, groupName),
		`Add to ${ops.groupLabel(groupName)}…`
	).open();
}

// Capture a raw draft about this friend/plan — appears in the drafts
// strip to triage later
export function openQuickNote(ctx: PageContext, model: ContactPageModel) {
	// A plan's days are offerable; a person's note has no day to sit on.
	const dayOptions = model.kind === "plan"
		? planScheduleOptions(ctx, model).dayOptions
		: undefined;
	new NoteInputModal(
		ctx.app,
		model.data.displayName || model.data.name || "",
		async (text, date) => {
			// A plan keeps its drafts with it — they take a day, and feed
			// its timeline. Anyone else's go in the dashboard note's
			// checklist, with a link back to them.
			if (model.kind !== "plan" && model.file) {
				await ctx.plugin.contactOperations.addDraft(text, model.file);
				return;
			}
			const created = todayISO();
			model.push("drafts", {
				text,
				created,
				...(date && { date }),
			});
			await saveModel(ctx, model);
			ctx.render();
		},
		undefined,
		dayOptions
	).open();
}

export async function writeLifeGoals(
	ctx: PageContext,
	model: ContactPageModel,
	list: LifeGoal[]
) {
	if (list.length > 0) model.data.lifeGoals = list;
	else delete model.data.lifeGoals;
	await saveModel(ctx, model);
	ctx.render();
}

/**
 * Things they want to do someday.
 *
 * Completed goals stay on the page under their own heading rather than
 * disappearing — the record is half the point, and "they finally did it"
 * is worth being able to see.
 */
export function openLifeGoalModal(
	ctx: PageContext,
	model: ContactPageModel,
	index: number | null,
	goal: LifeGoal | null
) {
	new LifeGoalModal(
		ctx.app,
		model.data.displayName || model.data.name || "",
		goal,
		async (value) => {
			const list = model.lifeGoals();
			if (index === null) list.push(value);
			else list[index] = value;
			await writeLifeGoals(ctx, model, list);
		},
		index === null
			? undefined
			: async () => {
					const list = model.lifeGoals();
					list.splice(index, 1);
					await writeLifeGoals(ctx, model, list);
			  }
	).open();
}

export function openLifeGoalView(
	ctx: PageContext,
	model: ContactPageModel,
	index: number
) {
	const goal = model.lifeGoals()[index];
	if (!goal) return;
	new LifeGoalViewModal(
		ctx.app,
		goal,
		// Read afresh: the view's notes may have been typed and saved
		// since it opened, and the form opening with the older copy
		// would write those notes back over them on Save.
		() => openLifeGoalModal(
			ctx,
			model,
			index,
			model.lifeGoals()[index] ?? goal
		),
		async () => {
			const list = model.lifeGoals();
			list.splice(index, 1);
			await writeLifeGoals(ctx, model, list);
		},
		async (notes) => {
			const list = model.lifeGoals();
			if (!list[index]) return;
			if (notes) list[index].notes = notes;
			else delete list[index].notes;
			if (list.length > 0) model.data.lifeGoals = list;
			await saveModel(ctx, model);
			// No render(): the modal is still open over this page, and
			// rebuilding underneath it on every keystroke pause is work
			// nobody can see. The next open reads the saved value.
		},
		async (done) => {
			const list = model.lifeGoals();
			if (!list[index]) return;
			if (done) {
				list[index].done = true;
				list[index].completed = todayISO();
			} else {
				delete list[index].done;
				delete list[index].completed;
			}
			await writeLifeGoals(ctx, model, list);
		},
		() => openAddIdeaModal(ctx, model),
		() => openAddEventModal(ctx, model)
	).open();
}

/** Add (index null) or edit a fun fact; Delete is offered when editing. */
export function openFunFactModal(
	ctx: PageContext,
	model: ContactPageModel,
	index: number | null,
	fact: string | null
) {
	new FunFactsModal(
		ctx.app,
		model.data.displayName || model.data.name || "",
		async (value) => {
			if (!value) return;
			const arr = model.funFacts();
			if (index === null) arr.push(value);
			else arr[index] = value;
			model.data.funFacts = arr;
			await saveModel(ctx, model);
			ctx.render();
		},
		fact,
		index === null
			? undefined
			: async () => {
					const arr = model.funFacts();
					arr.splice(index, 1);
					if (arr.length > 0) model.data.funFacts = arr;
					else delete model.data.funFacts;
					await saveModel(ctx, model);
					ctx.render();
			  }
	).open();
}

export function openInsideJokeModal(
	ctx: PageContext,
	model: ContactPageModel,
	index: number | null,
	joke: InsideJoke | null
) {
	new InsideJokeModal(
		ctx.app,
		model.data.displayName || model.data.name || "",
		joke,
		async (value) => {
			const list = model.insideJokes();
			if (index === null) list.push(value);
			else list[index] = value;
			model.data.insideJokes = list;
			await saveModel(ctx, model);
			ctx.render();
		},
		index === null
			? undefined
			: async () => {
					const list = model.insideJokes();
					list.splice(index, 1);
					if (list.length > 0) model.data.insideJokes = list;
					else delete model.data.insideJokes;
					await saveModel(ctx, model);
					ctx.render();
			  }
	).open();
}

export function openQuoteModal(
	ctx: PageContext,
	model: ContactPageModel,
	index: number | null,
	quote: Quote | null
) {
	new QuoteModal(
		ctx.app,
		model.data.displayName || model.data.name || "",
		quote,
		async (value) => {
			const list = model.quotes();
			if (index === null) list.push(value);
			else list[index] = value;
			await writeQuotes(ctx, model, list);
			await saveModel(ctx, model);
			ctx.render();
		},
		index === null
			? undefined
			: async () => {
					const list = model.quotes();
					list.splice(index, 1);
					await writeQuotes(ctx, model, list);
					await saveModel(ctx, model);
					ctx.render();
			  }
	).open();
}

export async function removeInterest(
	ctx: PageContext,
	model: ContactPageModel,
	index: number
) {
	model.removeAt("interests", index);
	await saveModel(ctx, model);
	ctx.render();
}

/** The interest's own modal, reopened on it — Delete sits in there. */
export function openEditInterestModal(
	ctx: PageContext,
	model: ContactPageModel,
	index: number
) {
	const interest = (asArray(model.data.interests) as Interest[])[
		index
	];
	if (!interest) return;
	new InterestModal(
		ctx.app,
		model.data.displayName || model.data.name || "",
		normalizeInterestCategory(interest),
		async (category, text, detail, detail2, notes) => {
			const list = [...(asArray(model.data.interests) as Interest[])];
			list[index] = {
				category,
				...(text && { text }),
				...(detail && { detail }),
				...(detail2 && { detail2 }),
				...(notes && { notes }),
			};
			model.data.interests = list;
			await saveModel(ctx, model);
			ctx.render();
		},
		interest,
		() => removeInterest(ctx, model, index)
	).open();
}

export function openAddInterestModal(
	ctx: PageContext,
	model: ContactPageModel
) {
	new InterestModal(
		ctx.app,
		model.data.displayName || model.data.name || "",
		ctx.ui.lastInterestCategory,
		async (category, text, detail, detail2, notes) => {
			ctx.ui.lastInterestCategory = category;
			model.push("interests", {
				category,
				// Left out when blank: an artist on their own needs no title.
				...(text && { text }),
				...(detail && { detail }),
				...(detail2 && { detail2 }),
				...(notes && { notes }),
			});
			await saveModel(ctx, model);
			ctx.render();
		}
	).open();
}

export async function openAddFieldModal(
	ctx: PageContext,
	model: ContactPageModel
) {
	const modal = new AddFieldModal(ctx.app, async (fieldName) => {
		if (!model.data[fieldName]) {
			model.data[fieldName] = "";
			await saveModel(ctx, model);
			ctx.render();
		} else {
			new Notice("Field already exists!");
		}
	});
	modal.open();
}

export function openAddEventModal(ctx: PageContext, model: ContactPageModel) {
	const file = model.file;
	if (!file) return;
	// The page hears the event file, so the modal needn't redraw it.
	new EventModal(
		ctx.app,
		ctx.plugin,
		null,
		undefined,
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

export function openEditEventModal(
	ctx: PageContext,
	model: ContactPageModel,
	event: EventInfo
) {
	const file = model.file;
	new EventModal(
		ctx.app,
		ctx.plugin,
		event,
		undefined,
		undefined,
		// Locked, not just pre-filled: removing the person whose page
		// this is would leave the event with nowhere to land, same as
		// on Add. Other people on the event stay removable as normal.
		file ? [`[[${file.basename}]]`] : [],
		true
	).open();
}

export async function deleteEvent(ctx: PageContext, event: EventInfo) {
	await ctx.plugin.eventOperations.deleteEvent(event.file);
}

export async function updateContactData(
	ctx: PageContext,
	model: ContactPageModel,
	field: string,
	value: string | string[] | number | boolean
) {
	// An emptied list drops its key instead of storing `[]` — a bare
	// empty array shows as a property with no values in Obsidian's own
	// UI, which reads as "set to nothing" rather than "not set".
	if (Array.isArray(value) && value.length === 0) {
		delete model.data[field];
	} else {
		model.data[field] = value;
	}
	await saveModel(ctx, model);
}
