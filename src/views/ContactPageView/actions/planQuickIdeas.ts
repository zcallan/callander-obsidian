import type { PlanQuickIdea } from "@/types";
import { PlanQuickIdeaModal } from "@/modals/PlanQuickIdeaModal";
import { PlanQuickIdeaViewModal } from "@/modals/PlanQuickIdeaViewModal";
import { PlanOperations } from "@/services/PlanOperations";
import { PlanItemModal } from "@/modals/PlanItemModal";
import { todayISO } from "@/utils/flexdate";
import { saveModel } from "@/views/ContactPageView/persistence";
import { planScheduleOptions } from "@/views/ContactPageView/actions/planItems";
import {
	planParticipants,
	planShortNameOverrides,
} from "@/views/ContactPageView/actions/planMembers";
import type { PageContext } from "@/views/ContactPageView/context";
import type { ContactPageModel } from "@/views/ContactPageView/model";

export function rememberQuickIdeaCategories(
	ctx: PageContext,
	model: ContactPageModel,
	categories: string[] | undefined
) {
	if (!categories || categories.length === 0) return;
	const known = PlanOperations.quickIdeaCategoriesOf(model.data);
	for (const cat of categories) {
		if (!known.some((k) => k.toLowerCase() === cat.toLowerCase())) {
			known.push(cat);
		}
	}
	model.data.quickIdeaCategories = known;
}

export async function writeQuickIdeas(
	ctx: PageContext,
	model: ContactPageModel,
	list: PlanQuickIdea[]
) {
	if (list.length > 0) model.data.quickIdeas = list;
	else delete model.data.quickIdeas;
	await saveModel(ctx, model);
	ctx.render();
}

/**
 * The one real delete for a quick-idea category — rememberQuickIdeaCategories
 * only ever adds. Stripping it just from the persisted vocabulary isn't
 * enough: quickIdeaCategoriesOf unions that list with whatever ideas still
 * reference, so a category left on any idea reappears immediately. Clearing
 * it from every idea too is what makes the delete stick.
 */
export async function deleteQuickIdeaCategory(
	ctx: PageContext,
	model: ContactPageModel,
	category: string
) {
	const matches = (c: string) => c.toLowerCase() === category.toLowerCase();
	const list = PlanOperations.quickIdeasOf(model.data);
	for (const idea of list) {
		if (!idea.categories) continue;
		const kept = idea.categories.filter((c) => !matches(c));
		if (kept.length > 0) idea.categories = kept;
		else delete idea.categories;
	}
	const known = model.quickIdeaCategories().filter((c) => !matches(c));
	if (known.length > 0) model.data.quickIdeaCategories = known;
	else delete model.data.quickIdeaCategories;
	if (list.length > 0) model.data.quickIdeas = list;
	else delete model.data.quickIdeas;
	await saveModel(ctx, model);
	ctx.render();
}

/** Add (index null) or edit a quick idea. */
export function openQuickIdeaModal(
	ctx: PageContext,
	model: ContactPageModel,
	index: number | null,
	idea: PlanQuickIdea | null
) {
	new PlanQuickIdeaModal(
		ctx.app,
		async (value) => {
			const list = PlanOperations.quickIdeasOf(model.data);
			if (index === null) {
				list.push({ ...value, created: value.created || todayISO() });
			} else {
				list[index] = value;
			}
			rememberQuickIdeaCategories(ctx, model, value.categories);
			await writeQuickIdeas(ctx, model, list);
		},
		idea,
		index === null
			? undefined
			: async () => {
					const list = PlanOperations.quickIdeasOf(
						model.data
					);
					list.splice(index, 1);
					await writeQuickIdeas(ctx, model, list);
			  },
		planScheduleOptions(ctx, model),
		model.quickIdeaCategories(),
		(category) => deleteQuickIdeaCategory(ctx, model, category)
	).open();
}

export function openQuickIdeaView(
	ctx: PageContext,
	model: ContactPageModel,
	index: number
) {
	const idea = PlanOperations.quickIdeasOf(model.data)[index];
	if (!idea) return;
	new PlanQuickIdeaViewModal(
		ctx.app,
		idea,
		() => openQuickIdeaModal(ctx, model, index, idea),
		async () => {
			const list = PlanOperations.quickIdeasOf(model.data);
			list.splice(index, 1);
			await writeQuickIdeas(ctx, model, list);
		},
		() => promoteQuickIdea(ctx, model, index, idea),
		planParticipants(ctx, model),
		ctx.plugin.settings.yourName,
		planShortNameOverrides(ctx, model)
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
export function promoteQuickIdea(
	ctx: PageContext,
	model: ContactPageModel,
	index: number,
	idea: PlanQuickIdea
) {
	new PlanItemModal(
		ctx.app,
		String(model.data.name ?? ""),
		async (value) => {
			const items = PlanOperations.itemsOf(model.data);
			items.push(value);
			model.data.items = items;
			// Only now, with the item actually created.
			const list = PlanOperations.quickIdeasOf(model.data);
			list.splice(index, 1);
			if (list.length > 0) model.data.quickIdeas = list;
			else delete model.data.quickIdeas;
			await saveModel(ctx, model);
			ctx.render();
		},
		null,
		undefined,
		planScheduleOptions(ctx, model),
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
