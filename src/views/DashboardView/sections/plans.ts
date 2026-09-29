import { flexSortKey, parseFlexDate } from "@/utils/flexdate";
import { PlanModal } from "@/modals/PlanModal";
import { buildUpcomingRow } from "@/components/UpcomingRow";
import { planHiddenFrom, planRowFields } from "@/utils/planRow";
import { runAction } from "@/utils/async";
import type { DashboardContext } from "@/views/DashboardView/context";

export function renderPlans(ctx: DashboardContext, container: HTMLElement) {
	const plans = ctx.plugin.planOperations
		.getPlans()
		.filter((p) => p.status !== "done")
		.sort((a, b) => {
			const keyA = parseFlexDate(a.date)
				? flexSortKey(parseFlexDate(a.date)!)
				: Number.MAX_SAFE_INTEGER;
			const keyB = parseFlexDate(b.date)
				? flexSortKey(parseFlexDate(b.date)!)
				: Number.MAX_SAFE_INTEGER;
			return keyA - keyB;
		});

	const section = container.createDiv({
		cls: "dashboard-section",
	});
	const header = section.createDiv({
		cls: "dashboard-section-header",
	});
	header.createEl("h3", { text: "🗺️ Plans" });
	// Grouped, as on Upcoming, so two buttons sit as one unit at the
	// right of the header rather than spreading across it.
	const buttons = header.createDiv({ cls: "dashboard-section-buttons" });
	const newButton = buttons.createEl("button", {
		cls: "callander-button",
		text: "New plan",
	});
	newButton.addEventListener("click", () => {
		new PlanModal(ctx.app, ctx.plugin, (file) =>
			void ctx.plugin.openContactPage(file)
		).open();
	});
	const allButton = buttons.createEl("button", {
		cls: "callander-button",
		text: "See all",
	});
	allButton.addEventListener("click", () =>
		void ctx.plugin.activatePlans({ here: true })
	);

	if (plans.length === 0) {
		section.createDiv({
			cls: "section-helper-text",
			text: "Something brewing? A weekend away, a dinner — plan it with the people it's for.",
		});
		return;
	}

	const now = new Date();
	for (const plan of plans) {
		const hidden = planHiddenFrom(plan);
		buildUpcomingRow(section, {
			...planRowFields(plan, now),
			onClick: () => void ctx.openContact(plan.file),
			// The only way back from "Hide from this list" in the plan's
			// glance — that row is gone from Upcoming or the Events page,
			// so the offer to undo it has to live where the plan still
			// shows.
			...(hidden && {
				action: {
					icon: "eye",
					label: hidden.label,
					ariaLabel: `Show ${plan.name} in ${hidden.where}`,
					onClick: (e: MouseEvent) => {
						e.stopPropagation();
						runAction("show the plan again", () =>
							ctx.plugin.planOperations.setHiddenFrom(
								plan.file,
								hidden.lists,
								false
							)
						);
					},
				},
			}),
		});
	}
}
