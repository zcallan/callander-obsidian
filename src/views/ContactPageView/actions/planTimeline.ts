import type { PlanTimelineEntry } from "@/types";
import { CONFIRM_PREVIEW_CHARS, ConfirmModal } from "@/modals/ConfirmModal";
import { PlanOperations } from "@/services/PlanOperations";
import { PlanTimelineViewModal } from "@/modals/PlanTimelineViewModal";
import { truncate } from "@/utils/text";
import {
	openPlanDraftModal,
	openPlanDraftView,
} from "@/views/ContactPageView/actions/planDrafts";
import {
	planParticipants,
	planShortNameOverrides,
} from "@/views/ContactPageView/actions/planMembers";
import {
	createExpenseFromEntry,
} from "@/views/ContactPageView/actions/planCosts";
import { saveModel } from "@/views/ContactPageView/persistence";
import {
	openPlanAccommodationModal,
	openPlanIdeaModal,
	openPlanTravelModal,
} from "@/views/ContactPageView/actions/planItems";
import type { PageContext } from "@/views/ContactPageView/context";
import type { ContactPageModel } from "@/views/ContactPageView/model";

export function confirmDeleteTimelineEntry(
	ctx: PageContext,
	model: ContactPageModel,
	entry: PlanTimelineEntry
) {
	const preview = truncate(entry.text, CONFIRM_PREVIEW_CHARS);
	new ConfirmModal(ctx.app, {
		title: "Delete from plan",
		message: `Delete "${preview}"?`,
		onConfirm: () => deleteTimelineEntry(ctx, model, entry),
	}).open();
}

/** Tapping a timeline row reads it first; Edit/Delete live in that view. */
export function openTimelineEntry(
	ctx: PageContext,
	model: ContactPageModel,
	entry: PlanTimelineEntry
) {
	// A draft has its own view — the shared one is built around fields
	// it doesn't have, and would label it as accommodation besides.
	if (entry.source === "draft") {
		openPlanDraftView(ctx, model, entry.index);
		return;
	}
	new PlanTimelineViewModal(
		ctx.app,
		entry,
		() => editTimelineEntry(ctx, model, entry),
		() => deleteTimelineEntry(ctx, model, entry),
		(notes) => saveTimelineEntryNotes(ctx, model, entry, notes),
		planParticipants(ctx, model),
		ctx.plugin.settings.yourName,
		planShortNameOverrides(ctx, model),
		// Drafts returned above, so this is an idea, a leg or a stay —
		// all three carry the text/people/cost the form starts from.
		() => createExpenseFromEntry(ctx, model, entry)
	).open();
}

/** Remove a timeline row's underlying item from the plan. */
export async function deleteTimelineEntry(
	ctx: PageContext,
	model: ContactPageModel,
	entry: PlanTimelineEntry
) {
	if (entry.source === "draft") {
		model.removeDraft(entry.index);
		await saveModel(ctx, model);
		ctx.render();
		return;
	}
	if (entry.source === "idea") {
		const current = PlanOperations.itemsOf(model.data);
		current.splice(entry.index, 1);
		if (current.length > 0) model.data.items = current;
		else delete model.data.items;
	} else {
		const current = PlanOperations.simpleListOf(
			model.data,
			entry.source
		);
		current.splice(entry.index, 1);
		if (current.length > 0) model.data[entry.source] = current;
		else delete model.data[entry.source];
	}
	await saveModel(ctx, model);
	ctx.render();
}

/**
 * Patch just the notes on a timeline row's underlying item — the
 * auto-saving textarea in PlanTimelineViewModal. No `render()` after:
 * the view modal owns its own DOM and floats above this page, so
 * rebuilding the page behind it on every debounced keystroke would be
 * pure waste (and risks a visible flash/scroll jump for no reason,
 * since nothing about the page's own layout depends on this value).
 */
export async function saveTimelineEntryNotes(
	ctx: PageContext,
	model: ContactPageModel,
	entry: PlanTimelineEntry,
	notes: string
) {
	if (entry.source === "idea") {
		const current = PlanOperations.itemsOf(model.data);
		const item = current[entry.index];
		if (!item) return;
		if (notes) item.notes = notes;
		else delete item.notes;
		model.data.items = current;
	} else {
		const current = PlanOperations.simpleListOf(
			model.data,
			entry.source
		);
		const item = current[entry.index];
		if (!item) return;
		if (notes) item.notes = notes;
		else delete item.notes;
		model.data[entry.source] = current;
	}
	await saveModel(ctx, model);
}

/** Route a timeline row back to its real item's edit modal. */
export function editTimelineEntry(
	ctx: PageContext,
	model: ContactPageModel,
	entry: PlanTimelineEntry
) {
	if (entry.source === "draft") {
		openPlanDraftModal(ctx, model, entry.index);
		return;
	}
	if (entry.source === "idea") {
		const item =
			PlanOperations.itemsOf(model.data)[entry.index] ?? null;
		if (item) openPlanIdeaModal(ctx, model, entry.index, item);
		return;
	}
	const item =
		PlanOperations.simpleListOf(model.data, entry.source)[
			entry.index
		] ?? null;
	if (!item) return;
	if (entry.source === "travel") {
		openPlanTravelModal(ctx, model, entry.index, item);
	} else {
		openPlanAccommodationModal(ctx, model, entry.index, item);
	}
}
