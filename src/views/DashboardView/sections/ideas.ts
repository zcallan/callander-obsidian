import { Notice } from "obsidian";
import type { ContactWithCountdown, Idea } from "@/types";
import { IDEA_CATEGORIES } from "@/constants";
import { ContactSuggestModal } from "@/modals/QuickIdeaModal";
import { parseFlexDate } from "@/utils/flexdate";
import { runAction } from "@/utils/async";
import type { DashboardContext } from "@/views/DashboardView/context";

/** Ideas whose resurface date has come round. */
export function renderResurfacing(
	ctx: DashboardContext,
	container: HTMLElement
) {
	const due = dueResurfacedIdeas(ctx);
	if (due.length === 0) return;
	const section = container.createDiv({ cls: "dashboard-section" });
	section.createEl("h3", { text: "⏰ Resurfacing now" });
	for (const { contact, idea } of due) {
		const row = section.createDiv({
			cls: "dashboard-row dashboard-row-clickable",
		});
		const cat = IDEA_CATEGORIES.find((c) => c.id === idea.category);
		row.createSpan({ text: `${cat?.emoji ?? "✨"} ${idea.text}` });
		row.createSpan({
			cls: "dashboard-row-meta",
			text: contact.displayName,
		});
		row.addEventListener("click", () =>
			void ctx.openContact(contact.file)
		);
	}
}

export function dueResurfacedIdeas(ctx: DashboardContext): Array<{
	contact: ContactWithCountdown;
	idea: Idea;
}> {
	const now = new Date();
	const todayKey =
		now.getFullYear() * 10000 +
		(now.getMonth() + 1) * 100 +
		now.getDate();
	const due: Array<{ contact: ContactWithCountdown; idea: Idea }> = [];
	for (const contact of ctx.data.contacts) {
		for (const idea of contact.ideas) {
			if (idea.done || !idea.resurface) continue;
			const parsed = parseFlexDate(idea.resurface);
			if (!parsed || parsed.year === null) continue;
			const dueKey =
				parsed.year * 10000 +
				(parsed.month ?? 1) * 100 +
				(parsed.day ?? 1);
			if (dueKey <= todayKey) due.push({ contact, idea });
		}
	}
	return due;
}

export function renderInbox(ctx: DashboardContext, container: HTMLElement) {
	const open = ctx.data.inboxIdeas
		.map((idea, index) => ({ idea, index }))
		.filter(({ idea }) => !idea.done);
	if (open.length === 0) return;

	const section = container.createDiv({
		cls: "dashboard-section",
	});
	section.createEl("h3", { text: "📥 Idea inbox" });
	section.createDiv({
		cls: "section-helper-text",
		text: "Ideas you captured without picking a friend — file them when you know who they're for.",
	});
	for (const { idea, index } of open) {
		const row = section.createDiv({ cls: "dashboard-row" });
		const cat = IDEA_CATEGORIES.find((c) => c.id === idea.category);
		row.createSpan({ text: `${cat?.emoji ?? "✨"} ${idea.text}` });
		const fileButton = row.createEl("button", {
			cls: "callander-button dashboard-row-action",
			text: "File to friend…",
		});
		fileButton.addEventListener("click", () => {
			const handleChoose = async (contact: ContactWithCountdown) => {
				const moved =
					await ctx.plugin.contactOperations.moveInboxIdea(
						index,
						contact.file
					);
				if (moved) new Notice(`Filed to ${contact.displayName}`);
			};
			new ContactSuggestModal(
				ctx.app,
				ctx.data.contacts,
				(contact) =>
					runAction("file the idea", () => handleChoose(contact)),
				"File this idea to…"
			).open();
		});
	}
}
