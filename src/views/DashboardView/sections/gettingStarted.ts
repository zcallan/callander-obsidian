import { setIcon } from "obsidian";
import {
	GETTING_STARTED_STEPS,
	type GettingStartedStep,
} from "@/utils/gettingStarted";
import { GroupModal } from "@/modals/GroupModal";
import { PlanModal } from "@/modals/PlanModal";
import type { DashboardContext } from "@/views/DashboardView/context";

/**
 * A first thing to try on each page, ticked off by itself as the vault
 * shows it done — see gettingStartedProgress. Gone entirely once hidden,
 * rather than folded: the setting brings it back.
 */
export function renderGettingStarted(
	ctx: DashboardContext,
	container: HTMLElement
) {
	const settings = ctx.plugin.settings;
	if (!settings.showGettingStarted) return;
	const plugin = ctx.plugin;

	const done = ctx.data.gettingStartedDone;

	const wrap = container.createDiv({
		cls: "dashboard-section plan-accordion dashboard-getting-started",
	});
	const header = wrap.createDiv({
		cls: "dashboard-section-header plan-accordion-header",
	});
	const heading = header.createEl("h3", { text: "👋 Getting started" });
	heading.createSpan({
		cls: "dashboard-count-badge",
		text: `${done.length}/${GETTING_STARTED_STEPS.length}`,
	});
	setIcon(
		header.createSpan({ cls: "plan-accordion-chevron" }),
		"chevron-down"
	);
	const body = wrap.createDiv({ cls: "plan-accordion-body" });
	const applyOpen = () =>
		wrap.toggleClass("is-open", !settings.gettingStartedCollapsed);
	applyOpen();
	header.addEventListener("click", () => {
		settings.gettingStartedCollapsed = !settings.gettingStartedCollapsed;
		applyOpen();
		void plugin.saveSettings();
	});

	const hide = () => {
		settings.showGettingStarted = false;
		void plugin.saveSettings();
	};
	const actions: Record<GettingStartedStep, () => void> = {
		friend: () => plugin.openAddContactModal(),
		name: () => plugin.openPluginSettings(),
		group: () =>
			new GroupModal(ctx.app, plugin, null).open(),
		quickNote: () => void plugin.openQuickNote(),
		event: () => plugin.openEventModal(),
		plan: () =>
			new PlanModal(ctx.app, plugin, (file) =>
				void plugin.openContactPage(file)
			).open(),
		someday: () => plugin.openSomedayModal(),
		diary: () => void plugin.openNewDiaryEntry(),
		calendar: () => void plugin.activateCalendar({ here: true }),
	};

	const list = body.createDiv({ cls: "getting-started-list" });
	const step = (
		title: string,
		blurb: string,
		action: string,
		onClick: () => void,
		isDone: boolean
	) => {
		const row = list.createDiv({
			cls: `getting-started-step${isDone ? " is-done" : ""}`,
		});
		const mark = row.createSpan({ cls: "getting-started-mark" });
		if (isDone) setIcon(mark, "check");
		const text = row.createDiv({ cls: "getting-started-text" });
		text.createDiv({ cls: "getting-started-title", text: title });
		text.createDiv({ cls: "getting-started-blurb", text: blurb });
		const button = row.createEl("button", {
			cls: "callander-button getting-started-action",
			text: action,
			attr: { type: "button" },
		});
		button.addEventListener("click", onClick);
	};
	for (const s of GETTING_STARTED_STEPS) {
		step(s.title, s.blurb, s.action, actions[s.id], done.includes(s.id));
	}
	// The last step is the way out, so it's never ticked — doing it is
	// what makes the list go away.
	step(
		"Complete onboarding",
		"Hides this checklist. The plugin settings can bring it back.",
		"Finish",
		hide,
		false
	);

	const footer = body.createDiv({ cls: "getting-started-footer" });
	const hideButton = footer.createEl("button", {
		cls: "getting-started-hide",
		text: "Hide this section",
		attr: { type: "button" },
	});
	hideButton.addEventListener("click", hide);
}
