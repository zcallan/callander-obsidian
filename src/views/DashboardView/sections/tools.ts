import { setIcon } from "obsidian";
import { EventImportModal } from "@/modals/EventImportModal";
import type { DashboardContext } from "@/views/DashboardView/context";

/**
 * Tools you reach for rarely — folded at the bottom of the page, laid
 * out like Getting started's steps without the ticks, since there's
 * nothing here to finish.
 */
export function renderSecretActions(
	ctx: DashboardContext,
	container: HTMLElement
) {
	const settings = ctx.plugin.settings;
	const wrap = container.createDiv({
		cls: "dashboard-section plan-accordion dashboard-secret-actions",
	});
	const header = wrap.createDiv({
		cls: "dashboard-section-header plan-accordion-header",
	});
	header.createEl("h3", { text: "🤫 Secret actions" });
	setIcon(
		header.createSpan({ cls: "plan-accordion-chevron" }),
		"chevron-down"
	);
	const body = wrap.createDiv({ cls: "plan-accordion-body" });
	const applyOpen = () =>
		wrap.toggleClass("is-open", !settings.secretActionsCollapsed);
	applyOpen();
	header.addEventListener("click", () => {
		settings.secretActionsCollapsed = !settings.secretActionsCollapsed;
		applyOpen();
		void ctx.plugin.saveSettings();
	});

	const list = body.createDiv({ cls: "getting-started-list" });
	const action = (
		title: string,
		blurb: string,
		label: string,
		onClick: () => void
	) => {
		const row = list.createDiv({ cls: "getting-started-step" });
		const text = row.createDiv({ cls: "getting-started-text" });
		text.createDiv({ cls: "getting-started-title", text: title });
		text.createDiv({ cls: "getting-started-blurb", text: blurb });
		const button = row.createEl("button", {
			cls: "callander-button getting-started-action",
			text: label,
			attr: { type: "button" },
		});
		button.addEventListener("click", onClick);
	};
	action(
		"Bulk event import",
		"Add a whole batch of events at once with CSV — e.g. a season of games, a term of classes, repeating events...",
		"Import events",
		() => new EventImportModal(ctx.app, ctx.plugin).open()
	);
}

/**
 * The way to the full Calendar page, dressed as a closed accordion so it
 * sits in the column like the sections around it. It never opens here:
 * a month of events, plans and birthdays wants the whole pane, so the
 * click goes there instead. The chevron points the way a closed one
 * does, which is also the way the click goes.
 */
export function renderCalendarLink(
	ctx: DashboardContext,
	container: HTMLElement
) {
	const wrap = container.createDiv({
		cls: "dashboard-section plan-accordion dashboard-calendar-link",
	});
	const header = wrap.createDiv({
		cls: "dashboard-section-header plan-accordion-header",
		attr: { role: "link", tabindex: "0" },
	});
	header.createEl("h3", { text: "📅 Calendar" });
	setIcon(
		header.createSpan({ cls: "plan-accordion-chevron" }),
		"chevron-down"
	);
	const open = () => void ctx.plugin.activateCalendar({ here: true });
	header.addEventListener("click", open);
	header.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			open();
		}
	});
}
