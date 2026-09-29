import { SomedayModal } from "@/modals/SomedayModal";
import { SomedayViewModal } from "@/modals/SomedayViewModal";
import { sortSomedays } from "@/utils/somedaySort";
import { somedayRowParts } from "@/utils/somedayRow";
import { buildSomedayRow } from "@/components/SomedayRow";
import type { DashboardContext } from "@/views/DashboardView/context";

export function renderSomedays(ctx: DashboardContext, container: HTMLElement) {
	// Ordered by whatever sort the Somedays page is set to, so the five
	// shown here are the five that page would lead with.
	const somedays = sortSomedays(
		ctx.plugin.somedayOperations
			.getSomedays()
			.filter((s) => s.status !== "done" && !s.convertedTo),
		ctx.plugin.settings.somedaySort,
		{
			randomSeed: ctx.somedaySeed,
			hemisphere: ctx.plugin.settings.hemisphere,
		}
	);

	const section = container.createDiv({
		cls: "dashboard-section",
	});
	const header = section.createDiv({
		cls: "dashboard-section-header",
	});
	header.createEl("h3", { text: "💭 Somedays" });
	const buttons = header.createDiv({
		cls: "dashboard-section-buttons",
	});
	const newButton = buttons.createEl("button", {
		cls: "callander-button",
		text: "New someday",
	});
	newButton.addEventListener("click", () => {
		new SomedayModal(ctx.app, ctx.plugin, null, async (file) => {
			await ctx.plugin.activateSomedays(file.path, { here: true });
		}).open();
	});
	const allButton = buttons.createEl("button", {
		cls: "callander-button",
		text: "See all",
	});
	allButton.addEventListener("click", () =>
		void ctx.plugin.activateSomedays(undefined, { here: true })
	);

	if (somedays.length === 0) {
		section.createDiv({
			cls: "section-helper-text",
			text: "A park to visit, a bar to try, a trip you keep meaning to take — jot it before it slips.",
		});
		return;
	}

	// Same row as the Somedays page, at the dashboard's own smaller
	// type — see .dashboard-somedays in styles.css.
	const now = new Date();
	const shown = ctx.plugin.settings.dashboardSomedayCount;
	for (const s of somedays.slice(0, shown)) {
		const row = section.createDiv({
			cls: "dashboard-row dashboard-row-clickable dashboard-someday-row",
		});
		buildSomedayRow(row, somedayRowParts(s, now));
		row.addEventListener("click", () => {
			new SomedayViewModal(ctx.app, ctx.plugin, s).open();
		});
	}
	if (somedays.length > shown) {
		const more = section.createDiv({
			cls: "section-helper-text dashboard-row-clickable",
			text: `+${somedays.length - shown} more on the Somedays page`,
		});
		more.addEventListener("click", () =>
			void ctx.plugin.activateSomedays(undefined, { here: true })
		);
	}
}
