import { PlanShareModal } from "@/modals/PlanShareModal";
import { PlanOperations } from "@/services/PlanOperations";
import { buildPlanShareText, type PlanShareDetail } from "@/utils/planShare";
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
import type { ExpenseShareScope } from "@/utils/expenseShare";
import { creditsOf, expensesOf } from "@/utils/expenseMath";
import {
	copyShareText,
	openExpenseShare,
	ShareTextModal,
} from "@/modals/ShareTextModal";
import {
	planMemberDisplays,
	planParticipants,
	shortenPlanPeople,
} from "@/views/ContactPageView/actions/planMembers";
import type { PageContext } from "@/views/ContactPageView/context";
import type { ContactPageModel } from "@/views/ContactPageView/model";

/** The iMessage-ready version of a plan. Costs stay out of the invite. */
function planShareText(
	ctx: PageContext,
	model: ContactPageModel,
	detail?: PlanShareDetail
): string {
	return buildPlanShareText(model.data, {
		detail,
		yourName: ctx.plugin.settings.yourName,
		members: planMemberDisplays(ctx, model),
		unconfirmed: planMemberDisplays(
			ctx,
			model,
			Array.isArray(model.data.unconfirmedMembers)
				? model.data.unconfirmedMembers
				: []
		),
	});
}

/**
 * A plan's costs as text, at whatever scope the caller opened it from —
 * one expense, one person, or the section. Re-read from the note on each
 * toggle; see openExpenseShare.
 */
export function openCostShare(
	ctx: PageContext,
	model: ContactPageModel,
	scope: ExpenseShareScope
) {
	openExpenseShare(ctx.app, scope, () => ({
		expenses: expensesOf(model.data),
		credits: creditsOf(model.data),
		participants: planParticipants(ctx, model),
		yourName: ctx.plugin.settings.yourName,
	}));
}

/** Every idea as text, from the Ideas section's own button. */
export function openIdeaShare(ctx: PageContext, model: ContactPageModel) {
	new ShareTextModal(
		ctx.app,
		IDEA_SHARE_FIELDS,
		{ ...IDEA_SHARE_DEFAULTS },
		(detail) =>
			buildIdeaShareText(
				PlanOperations.quickIdeasOf(model.data),
				detail,
				(people) => shortenPlanPeople(ctx, model, people)
			),
		copyShareText
	).open();
}

/** Every stay as text, from the Accommodation section's own button. */
export function openStayShare(ctx: PageContext, model: ContactPageModel) {
	new ShareTextModal(
		ctx.app,
		STAY_SHARE_FIELDS,
		{ ...STAY_SHARE_DEFAULTS },
		(detail) =>
			buildStayShareText(
				PlanOperations.simpleListOf(
					model.data,
					"accommodation"
				),
				detail
			),
		copyShareText
	).open();
}

/** The whole itinerary as text, from the timeline's own button row. */
export function openPlanShare(ctx: PageContext, model: ContactPageModel) {
	new PlanShareModal(
		ctx.app,
		(detail) => planShareText(ctx, model, detail),
		copyShareText
	).open();
}
