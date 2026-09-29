import type { PlanBringItem, PlanItem, PlanSimpleItem } from "@/types";
import { TRAVEL_TYPES } from "@/constants";
import { PlanOperations } from "@/services/PlanOperations";
import { PlanItemModal } from "@/modals/PlanItemModal";
import { PlanSimpleItemModal } from "@/modals/PlanSimpleItemModal";
import { formatTimelineDay } from "@/utils/planFormat";
import { formatDate } from "@/utils/dateFormat";
import { ScheduleFieldOptions } from "@/modals/scheduleFields";
import { isoDaysBetween } from "@/utils/dates";
import { exactPlanDay } from "@/utils/contactPage";
import { planParticipants } from "@/views/ContactPageView/actions/planMembers";
import { saveModel } from "@/views/ContactPageView/persistence";
import type { PageContext } from "@/views/ContactPageView/context";
import type { ContactPageModel } from "@/views/ContactPageView/model";

/** Context-aware placeholders for the travel / accommodation modal. */
export function planSimplePlaceholders(
	ctx: PageContext,
	key: "travel" | "accommodation"
) {
	return key === "travel"
		? { text: "e.g. Harry's car to the coast" }
		: { text: "e.g. Beachfront Airbnb" };
}

/** Every day of the plan's exact span, or none when it hasn't got one. */
export function planRangeDays(
	ctx: PageContext,
	model: ContactPageModel
): string[] {
	const startISO = exactPlanDay(model.data.date);
	const endISO = exactPlanDay(model.data.endDate);
	if (!startISO || !endISO) return [];
	return isoDaysBetween(startISO, endISO);
}

/** Day dropdown (when exact range) + trip people for the item modals. */
export function planScheduleOptions(
	ctx: PageContext,
	model: ContactPageModel
): ScheduleFieldOptions {
	const opts: ScheduleFieldOptions = {
		people: planParticipants(ctx, model),
	};
	const startISO = exactPlanDay(model.data.date);
	const endISO = exactPlanDay(model.data.endDate);
	if (startISO && endISO) {
		opts.dayOptions = isoDaysBetween(startISO, endISO).map((d) => ({
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
export function openPlanTravelModal(
	ctx: PageContext,
	model: ContactPageModel,
	index: number | null,
	item: PlanSimpleItem | null,
	date?: string
) {
	new PlanSimpleItemModal(
		ctx.app,
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
				model.data,
				"travel"
			);
			if (index === null) current.push(value);
			else current[index] = value;
			model.data.travel = current;
			await saveModel(ctx, model);
			ctx.render();
		},
		planSimplePlaceholders(ctx, "travel"),
		TRAVEL_TYPES,
		true,
		index === null
			? undefined
			: async () => {
					const current = PlanOperations.simpleListOf(
						model.data,
						"travel"
					);
					current.splice(index, 1);
					if (current.length > 0)
						model.data.travel = current;
					else delete model.data.travel;
					await saveModel(ctx, model);
					ctx.render();
			  },
		planScheduleOptions(ctx, model)
	).open();
}

/**
 * Add (index null) or edit a plan idea; used by the list and timeline.
 *
 * `date` prefills the day for a brand-new item — passed by the empty-day
 * rows, which already know which day you clicked on. It rides in through
 * `prefill` rather than `initial`, so the form still reads as an Add.
 */
export function openPlanIdeaModal(
	ctx: PageContext,
	model: ContactPageModel,
	index: number | null,
	item: PlanItem | null,
	date?: string
) {
	new PlanItemModal(
		ctx.app,
		String(model.data.name ?? ""),
		async (value) => {
			const current = PlanOperations.itemsOf(model.data);
			if (index === null) current.push(value);
			else current[index] = value;
			model.data.items = current;
			await saveModel(ctx, model);
			ctx.render();
		},
		item,
		index === null
			? undefined
			: async () => {
					const current = PlanOperations.itemsOf(
						model.data
					);
					current.splice(index, 1);
					if (current.length > 0)
						model.data.items = current;
					else delete model.data.items;
					await saveModel(ctx, model);
					ctx.render();
			  },
		planScheduleOptions(ctx, model),
		date
			? { category: "activity", priority: "must", text: "", date }
			: null
	).open();
}

/** Add (index null) or edit an accommodation; used by the list and timeline. */
export function openPlanAccommodationModal(
	ctx: PageContext,
	model: ContactPageModel,
	index: number | null,
	item: PlanSimpleItem | null
) {
	new PlanSimpleItemModal(
		ctx.app,
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
				model.data,
				"accommodation"
			);
			if (index === null) current.push(value);
			else current[index] = value;
			model.data.accommodation = current;
			rememberStayCategories(ctx, model, value.categories);
			await saveModel(ctx, model);
			ctx.render();
		},
		planSimplePlaceholders(ctx, "accommodation"),
		null,
		true,
		index === null
			? undefined
			: async () => {
					const current = PlanOperations.simpleListOf(
						model.data,
						"accommodation"
					);
					current.splice(index, 1);
					if (current.length > 0)
						model.data.accommodation = current;
					else delete model.data.accommodation;
					await saveModel(ctx, model);
					ctx.render();
			  },
		planScheduleOptions(ctx, model),
		true,
		PlanOperations.stayCategoriesOf(model.data),
		(category) => deleteStayCategory(ctx, model, category)
	).open();
}

/** Add any new categories a saved stay carries to the plan's list. */
export function rememberStayCategories(
	ctx: PageContext,
	model: ContactPageModel,
	categories: string[] | undefined
) {
	if (!categories || categories.length === 0) return;
	const known = PlanOperations.stayCategoriesOf(model.data);
	for (const cat of categories) {
		if (!known.some((k) => k.toLowerCase() === cat.toLowerCase())) {
			known.push(cat);
		}
	}
	model.data.accommodationCategories = known;
}

/**
 * The one real delete for a stay category — saving only ever adds.
 * stayCategoriesOf unions the persisted list with whatever stays still
 * reference, so clearing it from the vocabulary alone would let any stay
 * still carrying it put it straight back.
 */
export async function deleteStayCategory(
	ctx: PageContext,
	model: ContactPageModel,
	category: string
) {
	const matches = (c: string) =>
		c.toLowerCase() === category.toLowerCase();
	const list = PlanOperations.simpleListOf(
		model.data,
		"accommodation"
	);
	for (const stay of list) {
		if (!stay.categories) continue;
		stay.categories = stay.categories.filter((c) => !matches(c));
		if (stay.categories.length === 0) delete stay.categories;
	}
	const known = PlanOperations.stayCategoriesOf({
		...model.data,
		accommodation: list,
		accommodationCategories: [],
	});
	// An emptied list drops its key, as every other list here does.
	if (known.length > 0) model.data.accommodationCategories = known;
	else delete model.data.accommodationCategories;
	if (list.length > 0) model.data.accommodation = list;
	await saveModel(ctx, model);
	ctx.render();
}

export async function writeBring(
	ctx: PageContext,
	model: ContactPageModel,
	list: PlanBringItem[]
) {
	if (list.length > 0) model.data.bring = list;
	else delete model.data.bring;
	await saveModel(ctx, model);
	ctx.render();
}

export async function updateBringItem(
	ctx: PageContext,
	model: ContactPageModel,
	index: number,
	done: boolean
) {
	const list = PlanOperations.bringOf(model.data);
	if (!list[index]) return;
	list[index] = { ...list[index], done };
	await writeBring(ctx, model, list);
}

export async function removeBringItem(
	ctx: PageContext,
	model: ContactPageModel,
	index: number
) {
	const list = PlanOperations.bringOf(model.data);
	list.splice(index, 1);
	await writeBring(ctx, model, list);
}

export async function addBringItem(
	ctx: PageContext,
	model: ContactPageModel,
	text: string
) {
	await writeBring(ctx, model, [
		...PlanOperations.bringOf(model.data),
		{ text, done: false },
	]);
}
