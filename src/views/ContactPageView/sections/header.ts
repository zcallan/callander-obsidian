import { setIcon } from "obsidian";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { PlanOperations } from "@/services/PlanOperations";
import { planWhenLabel } from "@/utils/contactPage";
import type { PageContext } from "@/views/ContactPageView/context";
import { openAddIdeaModal } from "@/views/ContactPageView/actions/ideas";
import {
	openAddEventModal,
	openQuickNote,
} from "@/views/ContactPageView/actions/person";
import {
	openPlanDetailsModal,
} from "@/views/ContactPageView/actions/planDetails";
import { saveModel } from "@/views/ContactPageView/persistence";
import {
	renderNameSection,
} from "@/views/ContactPageView/sections/nameSection";

/** The page's header: the name and what's under it, and the actions. */
export function renderHeader(ctx: PageContext, container: HTMLElement) {
	const model = ctx.model;
	const header = container.createDiv({
		cls: "contact-page-header",
	});
	const nameContainer = header.createDiv({
		cls: "contact-name-container",
	});
	renderNameSection(ctx, nameContainer);

	// Plans: date/location (+ "Edit details") under "Last updated"; actions
	// top-right (Quick note · Mark as done), stacked below on mobile.
	if (model.kind === "plan") {
		header.addClass("plan-page-header");
		renderPlanMetaLines(ctx, nameContainer);

		const actions = header.createDiv({
			cls: "contact-header-actions plan-page-actions",
		});
		const noteButton = actions.createEl("button", {
			cls: "callander-button contact-header-action",
			attr: { "aria-label": "Quick note" },
		});
		setIcon(noteButton, "pencil-line");
		noteButton.createSpan({ text: "Quick note" });
		noteButton.addEventListener("click", () =>
			openQuickNote(ctx, ctx.model)
		);

		createPlanDoneButton(ctx, actions);
		return;
	}

	// Quick actions, top-right (friends only)
	if (model.kind !== "group") {
		const actions = header.createDiv({
			cls: "contact-header-actions",
		});
		const action = (
			icon: string,
			label: string,
			onClick: () => void | Promise<void>
		) => {
			const btn = actions.createEl("button", {
				cls: "callander-button contact-header-action",
			});
			setIcon(btn, icon);
			btn.createSpan({ text: label });
			btn.addEventListener("click", () => void onClick());
		};
		action("lightbulb", "Add idea", () => openAddIdeaModal(ctx, ctx.model));
		action("milestone", "Add event", () =>
			openAddEventModal(ctx, ctx.model)
		);
		action(
			"pencil-line",
			"Quick note",
			() => openQuickNote(ctx, ctx.model)
		);
	}
}

/** Plan date/status + location lines, shown under "Last updated". */
function renderPlanMetaLines(ctx: PageContext, container: HTMLElement) {
	const { data } = ctx.model;
	const parts: string[] = [];
	const when = planWhenLabel(data.date, data.endDate, new Date());
	if (when !== null) parts.push(`🗓 ${when}`);
	const est = PlanOperations.estimate(data);
	if (est > 0) parts.push(`~$${est} planned`);
	if (data.status === "done") parts.push("✅ Done");

	if (parts.length > 0 || data.location) {
		const linesWrap = container.createDiv({
			cls: "plan-meta-lines",
		});
		if (parts.length > 0) {
			linesWrap.createDiv({
				cls: "plan-meta-line",
				text: parts.join("  ·  "),
			});
		}
		if (data.location) {
			linesWrap.createDiv({
				cls: "plan-meta-line",
				text: `📍 ${data.location}`,
			});
		}
	}

	// Edit date/end-date/location — sits just below the location line.
	const editBtn = container.createEl("button", {
		cls: "callander-button plan-edit-details",
		attr: { "aria-label": "Edit plan details" },
	});
	setIcon(editBtn, "pencil");
	editBtn.createSpan({ text: "Edit details" });
	editBtn.addEventListener("click", () =>
		openPlanDetailsModal(ctx, ctx.model)
	);
}

function createPlanDoneButton(ctx: PageContext, container: HTMLElement) {
	const isDone = ctx.model.data.status === "done";
	const doneButton = container.createEl("button", {
		cls: "callander-button contact-header-action",
	});
	setIcon(doneButton, isDone ? "rotate-ccw" : "check");
	doneButton.createSpan({
		text: isDone ? "Reopen plan" : "Mark as done",
	});
	doneButton.addEventListener("click", () => {
		const model = ctx.model;
		if (model.data.status === "done") {
			model.data.status = "planning";
			void saveModel(ctx, model).then(() => ctx.render());
			return;
		}
		// Members' timelines list this plan already — derived live from
		// its membership — so marking it done only has to set the status.
		new ConfirmModal(ctx.app, {
			title: "Mark plan as done",
			message: "Archive this plan? It stays on the timeline of everyone who was on it.",
			confirmLabel: "Done",
			onConfirm: async () => {
				model.data.status = "done";
				await saveModel(ctx, model);
				ctx.render();
			},
		}).open();
	});
}
