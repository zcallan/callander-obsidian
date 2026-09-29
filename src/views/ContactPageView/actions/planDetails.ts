import { Notice } from "obsidian";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { PlanDetailsModal } from "@/modals/PlanDetailsModal";
import { saveModel } from "@/views/ContactPageView/persistence";
import type { PageContext } from "@/views/ContactPageView/context";
import type { ContactPageModel } from "@/views/ContactPageView/model";

/** Edit the plan's name, date, end date & location. */
export function openPlanDetailsModal(
	ctx: PageContext,
	model: ContactPageModel
) {
	new PlanDetailsModal(
		ctx.app,
		{
			name: model.data.name || "",
			date: model.data.date
				? String(model.data.date)
				: "",
			endDate: model.data.endDate
				? String(model.data.endDate)
				: "",
			location: model.data.location
				? String(model.data.location)
				: "",
		},
		async (details) => {
			const renamed =
				details.name && details.name !== model.data.name;
			model.data.name = details.name;
			model.data.date = details.date;
			if (details.endDate) {
				model.data.endDate = details.endDate;
			} else {
				delete model.data.endDate;
			}
			if (details.location) {
				model.data.location = details.location;
			} else {
				delete model.data.location;
			}
			await saveModel(ctx, model);
			// Keep the filename in step with the name
			if (renamed && model.file) {
				try {
					await ctx.plugin.planOperations.renamePlan(
						model.file,
						details.name
					);
				} catch (error) {
					new Notice(`Error renaming plan: ${String(error)}`);
				}
			}
			ctx.render();
		},
		() => confirmDeletePlan(ctx, model)
	).open();
}

/** Delete the plan note entirely (sent to the Obsidian trash). */
export function confirmDeletePlan(ctx: PageContext, model: ContactPageModel) {
	const file = model.file;
	if (!file) return;
	const name = model.data.name || file.basename;
	new ConfirmModal(ctx.app, {
		title: "Delete plan",
		message: `Delete the plan "${name}"?`,
		onConfirm: async () => {
			await ctx.plugin.planOperations.deletePlan(file);
			new Notice(`Deleted "${name}"`);
			ctx.leaf.detach();
			await ctx.plugin.activateDashboard();
		},
	}).open();
}
