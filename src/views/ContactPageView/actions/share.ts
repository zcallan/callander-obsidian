import { Notice } from "obsidian";
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
import {
	buildExpenseShareText,
	shareDefaultsFor,
	shareFieldsFor,
	type ExpenseShareScope,
} from "@/utils/expenseShare";
import { creditsOf, expensesOf } from "@/utils/expenseMath";
import { ShareTextModal } from "@/modals/ShareTextModal";
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
 * one expense, one person, or the section.
 *
 * The build closure re-reads the vault each time a toggle flips, so the
 * preview follows an edit made in another pane rather than a snapshot
 * taken when the sheet opened.
 */
export function openCostShare(
	ctx: PageContext,
	model: ContactPageModel,
	scope: ExpenseShareScope
) {
	new ShareTextModal(
		ctx.app,
		shareFieldsFor(scope),
		shareDefaultsFor(scope),
		(detail) =>
			buildExpenseShareText(
				{
					scope,
					expenses: expensesOf(model.data),
					credits: creditsOf(model.data),
					participants: planParticipants(ctx, model),
					yourName: ctx.plugin.settings.yourName,
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
		async (text) => {
			await navigator.clipboard.writeText(text);
			new Notice("📋 Copied — ready to paste as text");
		}
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
		async (text) => {
			await navigator.clipboard.writeText(text);
			new Notice("📋 Copied — ready to paste as text");
		}
	).open();
}

/** The whole itinerary as text, from the timeline's own button row. */
export function openPlanShare(ctx: PageContext, model: ContactPageModel) {
	new PlanShareModal(
		ctx.app,
		(detail) => planShareText(ctx, model, detail),
		async (text) => {
			await navigator.clipboard.writeText(text);
			new Notice("📋 Copied — ready to paste as text");
		}
	).open();
}
