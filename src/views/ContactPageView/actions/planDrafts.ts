import type { Draft } from "@/types";
import { EventModal } from "@/modals/EventModal";
import { PlanItemModal } from "@/modals/PlanItemModal";
import { ContactOperations } from "@/services/ContactOperations";
import { PlanDraftViewModal } from "@/modals/PlanDraftViewModal";
import { NoteInputModal } from "@/modals/NoteInputModal";
import { todayISO } from "@/utils/flexdate";
import { findDraft } from "@/utils/draftsMarkdown";
import {
	saveModel,
	writePlanDrafts,
} from "@/views/ContactPageView/persistence";
import {
	openPlanIdeaModal,
	openPlanTravelModal,
	planScheduleOptions,
} from "@/views/ContactPageView/actions/planItems";
import type { PageContext } from "@/views/ContactPageView/context";
import type { ContactPageModel } from "@/views/ContactPageView/model";

/** Whether the draft at this index came from Claude. */
export function draftIsGenerated(
	ctx: PageContext,
	model: ContactPageModel,
	index: number
): boolean {
	return !!model.planDrafts()[index]?.generated;
}

/**
 * Turn a draft into a plan idea — a timeline item with nowhere on the
 * calendar yet. Left in place until it's marked Done, same as Make
 * idea/Make event on the dashboard: filing it as something else isn't
 * the same as being finished with the thought.
 */
export function promotePlanDraft(
	ctx: PageContext,
	model: ContactPageModel,
	index: number,
	text: string
) {
	new PlanItemModal(
		ctx.app,
		String(model.data.name ?? ""),
		async (value) => {
			model.push("items", value);
			await saveModel(ctx, model);
			ctx.render();
		},
		{ category: "activity", priority: "must", text }
	).open();
}

/** Turn a draft into an event, seeded with its text as the name and
 * this plan linked — same pattern as the page's own "Add event". Left
 * in place until Done, like Make idea above. */
export function promotePlanDraftToEvent(
	ctx: PageContext,
	model: ContactPageModel,
	text: string
) {
	const file = model.file;
	if (!file) return;
	new EventModal(
		ctx.app,
		ctx.plugin,
		null,
		() => ctx.render(),
		{
			people: [`[[${file.basename}]]`],
			variant: "timeline",
		},
		[`[[${file.basename}]]`]
	).open();
}

/** Tick a draft off in the plan's own note; it leaves the strip and
 * stays in the record. */
export async function completePlanDraft(
	ctx: PageContext,
	model: ContactPageModel,
	index: number,
	text: string
): Promise<void> {
	const list = model.planDrafts();
	const at = findDraft(list, index, text);
	if (at < 0) return;
	const next = [...list];
	next[at] = { ...next[at], done: true, doneDate: todayISO() };
	await writePlanDrafts(ctx, model, next);
	await saveModel(ctx, model);
	ctx.render();
}

/** Edit a plan draft's text — and, from here, give it a day, which
 * moves it onto the Timeline instead of leaving it in this strip. */
export function editPlanDraft(
	ctx: PageContext,
	model: ContactPageModel,
	index: number,
	text: string
) {
	const dayOptions = planScheduleOptions(ctx, model).dayOptions;
	new NoteInputModal(
		ctx.app,
		model.data.displayName || model.data.name || "",
		async (updated, date) => {
			const list = model.planDrafts();
			const at = findDraft(list, index, text);
			if (at < 0) return;
			if (date) {
				// Handed to the Timeline: out of the body list, into
				// frontmatter, where timelineOf reads dated drafts from.
				const next = [...list];
				next.splice(at, 1);
				await writePlanDrafts(ctx, model, next);
				model.push("drafts", {
					text: updated,
					created: list[at].created,
					date,
					...(list[at].generated && { generated: true }),
				});
				await saveModel(ctx, model);
			} else {
				const next = [...list];
				next[at] = { ...next[at], text: updated };
				await writePlanDrafts(ctx, model, next);
				await saveModel(ctx, model);
			}
			ctx.render();
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
export function openPlanDraftModal(
	ctx: PageContext,
	model: ContactPageModel,
	index: number
) {
	const drafts = ContactOperations.draftsOf(model.data);
	const draft = drafts[index];
	if (!draft) return;
	new NoteInputModal(
		ctx.app,
		model.data.displayName || model.data.name || "",
		async (text, date) => {
			const list = ContactOperations.draftsOf(model.data);
			const current = list[index];
			if (!current) return;
			list[index] = {
				...current,
				text,
				...(date ? { date } : {}),
			};
			if (!date) delete list[index].date;
			model.data.drafts = list;
			await saveModel(ctx, model);
			ctx.render();
		},
		draft.text,
		planScheduleOptions(ctx, model).dayOptions,
		draft.date
	).open();
}

/** Read/edit a dated draft from the timeline, and act on it. */
export function openPlanDraftView(
	ctx: PageContext,
	model: ContactPageModel,
	index: number
) {
	const draft = ContactOperations.draftsOf(model.data)[index];
	if (!draft) return;
	const dayOptions = planScheduleOptions(ctx, model).dayOptions;

	const writeDraft = async (patch: Partial<Draft>) => {
		const list = ContactOperations.draftsOf(model.data);
		const current = list[index];
		if (!current) return;
		list[index] = { ...current, ...patch };
		if (!list[index].date) delete list[index].date;
		model.data.drafts = list;
		await saveModel(ctx, model);
		ctx.render();
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
			ContactOperations.draftsOf(model.data)[index]?.date;
		model.removeDraft(index);
		await saveModel(ctx, model);
		ctx.render();
		open(text, date);
	};

	new PlanDraftViewModal(
		ctx.app,
		draft.text,
		draft.date,
		dayOptions,
		(text) => writeDraft({ text }),
		(date) => writeDraft({ date }),
		(text) =>
			convert(text, (text, date) =>
				openPlanIdeaModal(ctx, model, null, {
					category: "activity",
					priority: "must",
					text,
					...(date && { date }),
				})
			),
		(text) =>
			convert(text, (text, date) =>
				openPlanTravelModal(ctx, model, null, {
					text,
					...(date && { date }),
				})
			),
		async () => {
			model.removeDraft(index);
			await saveModel(ctx, model);
			ctx.render();
		}
	).open();
}
