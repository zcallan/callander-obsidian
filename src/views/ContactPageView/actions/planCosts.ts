import type { Expense, Credit, PlanTimelineEntry } from "@/types";
import { Notice } from "obsidian";
import {
	breakdownFor,
	creditsOf,
	expensesOf,
	locateEntry,
	setPaidOn,
	settleAllFor,
} from "@/utils/expenseMath";
import { ExpenseModal } from "@/modals/ExpenseModal";
import { ExpenseViewModal } from "@/modals/ExpenseViewModal";
import { ExpenseBreakdownModal } from "@/modals/ExpenseBreakdownModal";
import { CreditModal } from "@/modals/CreditModal";
import {
	planParticipants,
	planShortNameOverrides,
} from "@/views/ContactPageView/actions/planMembers";
import { saveModel } from "@/views/ContactPageView/persistence";
import { openCostShare } from "@/views/ContactPageView/actions/share";
import type { PageContext } from "@/views/ContactPageView/context";
import type { ContactPageModel } from "@/views/ContactPageView/model";

/**
 * "Create expense" on a timeline row: the Cost breakdown's own Add form,
 * opened with what the row already knows filled in.
 *
 * It's a starting point, not a link — the expense is an ordinary one from
 * the moment it's added, with no tie back to the row. Editing the item's
 * cost later doesn't chase it, which is deliberate: what a thing was
 * estimated to cost and what it actually cost are different facts.
 */
export function createExpenseFromEntry(
	ctx: PageContext,
	model: ContactPageModel,
	entry: PlanTimelineEntry
) {
	// The row's people are display names in one comma-joined string —
	// the same shape the timeline row renders from.
	const named = (entry.people ?? "")
		.split(",")
		.map((n) => n.trim())
		.filter(Boolean);

	new ExpenseModal(
		ctx.app,
		planParticipants(ctx, model),
		null,
		(cost) => appendExpense(ctx, model, cost),
		undefined,
		ctx.plugin.settings.yourName,
		(ctx.plugin.settings.receiptTaxEnabled ? ctx.plugin.settings.receiptTaxPercent : null),
		(ctx.plugin.settings.receiptTipEnabled ? ctx.plugin.settings.receiptTipPercent : null),
		undefined,
		{
			label: entry.text,
			...(entry.cost !== undefined && { amount: entry.cost }),
			...(named.length > 0 && { included: named }),
		}
	).open();
}

/** Add a new expense to this plan's Cost breakdown. */
export async function appendExpense(
	ctx: PageContext,
	model: ContactPageModel,
	cost: Expense
) {
	const list = expensesOf(model.data);
	list.push(cost);
	model.data.costs = list;
	await saveModel(ctx, model);
	ctx.render();
}

export async function writeCosts(
	ctx: PageContext,
	model: ContactPageModel,
	list: Expense[]
) {
	if (list.length > 0) model.data.costs = list;
	else delete model.data.costs;
	await saveModel(ctx, model);
	ctx.render();
}

/**
 * Writes to one of the plan's expenses or credits for as long as a modal has
 * it open, finding it by what it held as well as where it sat (locateEntry).
 * The plan can be read again under an open modal — a sync, an edit in
 * another pane — and writing by position alone would change or delete
 * whichever entry had moved into that place. If it has changed or gone,
 * nothing is written and a Notice says so. The dashboard's expenses work
 * the same way (ExpensesSection).
 */
function planEntryEditor<T>(
	ctx: PageContext,
	model: ContactPageModel,
	key: "costs" | "credits",
	index: number,
	opened: T
) {
	let known = structuredClone(opened);
	const read = () =>
		(key === "costs" ? expensesOf(model.data) : creditsOf(model.data)) as T[];
	const write = async (change: (list: T[], at: number) => T | null) => {
		const list = read();
		const at = locateEntry(list, index, known);
		if (at === -1) {
			new Notice(
				`That ${key === "costs" ? "expense" : "credit"} changed or was removed since you opened it, so nothing was saved.`
			);
			return;
		}
		const next = change(list, at);
		if (next) known = structuredClone(next);
		if (list.length > 0) model.data[key] = list;
		else delete model.data[key];
		await saveModel(ctx, model);
		ctx.render();
	};
	return {
		/** The entry as last written here. */
		current: () => structuredClone(known),
		save: (updated: T) =>
			write((list, at) => {
				list[at] = updated;
				return updated;
			}),
		remove: () =>
			write((list, at) => {
				list.splice(at, 1);
				return null;
			}),
		update: (patch: (entry: T) => T) =>
			write((list, at) => {
				const updated = patch(list[at]);
				list[at] = updated;
				return updated;
			}),
	};
}

export function openCostModal(
	ctx: PageContext,
	model: ContactPageModel,
	index: number,
	cost: Expense
) {
	const editor = planEntryEditor(ctx, model, "costs", index, cost);
	new ExpenseModal(
		ctx.app,
		planParticipants(ctx, model),
		cost,
		(updated) => editor.save(updated),
		() => editor.remove(),
		ctx.plugin.settings.yourName,
		(ctx.plugin.settings.receiptTaxEnabled ? ctx.plugin.settings.receiptTaxPercent : null),
		(ctx.plugin.settings.receiptTipEnabled ? ctx.plugin.settings.receiptTipPercent : null)
	).open();
}

/** Tapping a row reads it first; Edit/Delete live in that view. */
export function openCostView(
	ctx: PageContext,
	model: ContactPageModel,
	index: number,
	cost: Expense
) {
	const editor = planEntryEditor(ctx, model, "costs", index, cost);
	new ExpenseViewModal(
		ctx.app,
		cost,
		planParticipants(ctx, model),
		// From what was last written here: the view may have ticked
		// someone paid since it opened.
		() => openCostModal(ctx, model, index, editor.current()),
		() => editor.remove(),
		ctx.plugin.settings.yourName,
		// Persists the tick state and refreshes the page underneath — the
		// view modal is a separate overlay, so this never disturbs it; it
		// updates its own display once the save resolves.
		({ paid, settled }) =>
			editor.update((current) => {
				const updated: Expense = { ...current, paid };
				if (settled) updated.settled = true;
				else delete updated.settled;
				return updated;
			}),
		planShortNameOverrides(ctx, model),
		() => openCostShare(ctx, model, { kind: "expense", index })
	).open();
}

export function openCreditModal(
	ctx: PageContext,
	model: ContactPageModel,
	index: number | null,
	credit: Credit | null
) {
	const yourName = ctx.plugin.settings.yourName;
	const creditPeople = planParticipants(ctx, model).filter(
		(p) => !yourName || p.toLowerCase() !== yourName.toLowerCase()
	);
	const editor =
		index === null || !credit
			? null
			: planEntryEditor(ctx, model, "credits", index, credit);
	new CreditModal(
		ctx.app,
		creditPeople,
		credit,
		async (updated) => {
			if (editor) return editor.save(updated);
			const list = creditsOf(model.data);
			list.push(updated);
			model.data.credits = list;
			await saveModel(ctx, model);
			ctx.render();
		},
		editor ? () => editor.remove() : undefined
	).open();
}

/**
 * One person's ledger for this plan.
 *
 * `rows` is handed over as a function so the modal can redraw itself
 * from the vault after each tick, rather than over a snapshot taken when
 * it opened — the same reason the sections take their data as getters.
 */
export function openBreakdown(
	ctx: PageContext,
	model: ContactPageModel,
	person: string
) {
	const participants = () => planParticipants(ctx, model);
	const yourName = ctx.plugin.settings.yourName;
	const isYou =
		!!yourName && person.toLowerCase() === yourName.toLowerCase();

	new ExpenseBreakdownModal(
		ctx.app,
		person,
		() =>
			breakdownFor(
				person,
				expensesOf(model.data),
				participants(),
				creditsOf(model.data)
			),
		{
			isYou,
			onCopy: () => openCostShare(ctx, model, { kind: "person", person }),
			onSetPaid: (index, paid) => {
				const list = expensesOf(model.data);
				const cost = list[index];
				if (!cost) return Promise.resolve();
				list[index] = setPaidOn(
					cost,
					person,
					paid,
					participants(),
					yourName
				);
				return writeCosts(ctx, model, list);
			},
			onSettleAll: (settled) => {
				const list = expensesOf(model.data);
				return writeCosts(
					ctx,
					model,
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

export function openAddExpense(ctx: PageContext, model: ContactPageModel) {
	new ExpenseModal(
		ctx.app,
		planParticipants(ctx, model),
		null,
		(cost) => appendExpense(ctx, model, cost),
		undefined,
		ctx.plugin.settings.yourName,
		(ctx.plugin.settings.receiptTaxEnabled ? ctx.plugin.settings.receiptTaxPercent : null),
		(ctx.plugin.settings.receiptTipEnabled ? ctx.plugin.settings.receiptTipPercent : null)
	).open();
}
