import { App, Modal } from "obsidian";
import type { ContactWithCountdown, FriendEvent } from "@/types";
import { IDEA_CATEGORIES } from "@/constants";
import {
	parseFlexDate,
	formatFlexDate,
	formatTimeSince,
	flexSortKey,
} from "@/utils/flexdate";

/**
 * The ten-second pre-hangout glance: open threads, things to suggest,
 * and what happened recently — read-only, arrive as the friend who remembers.
 */
export class GlanceModal extends Modal {
	constructor(app: App, private contact: ContactWithCountdown) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("glance-modal");
		contentEl.createEl("h2", { text: this.contact.displayName });

		const met = parseFlexDate(this.contact.met);
		if (met && met.year !== null) {
			contentEl.createDiv({
				cls: "glance-met",
				text: `Met ${formatFlexDate(met)} (${formatTimeSince(met)})`,
			});
		}

		const openIdeas = this.contact.ideas.filter((i) => !i.done);
		// Conversations and plans first — gifts matter at birthdays, these
		// matter right now
		const order = [
			"conversation",
			"activity",
			"place",
			"recommendation",
			"gift",
			"other",
		];
		let any = false;
		for (const catId of order) {
			const cat = IDEA_CATEGORIES.find((c) => c.id === catId)!;
			const items = openIdeas.filter(
				(i) => (i.category as string) === catId
			);
			if (items.length === 0) continue;
			any = true;
			contentEl.createDiv({
				cls: "glance-section-header",
				text: `${cat.emoji} ${cat.label}`,
			});
			const list = contentEl.createEl("ul", { cls: "glance-list" });
			items.forEach((i) => list.createEl("li", { text: i.text }));
		}
		if (!any) {
			contentEl.createDiv({
				cls: "section-helper-text",
				text: "No open ideas for them yet.",
			});
		}

		const byDateDesc = (a: FriendEvent, b: FriendEvent) => {
			const empty = { year: null, month: null, day: null };
			return (
				flexSortKey(parseFlexDate(b.date) ?? empty) -
				flexSortKey(parseFlexDate(a.date) ?? empty)
			);
		};
		const sorted = [...this.contact.events].sort(byDateDesc);

		// What's happening in their life — the best pre-hangout memory jog
		const lifeEvents = sorted
			.filter((e) => e.type === "life" || e.type === "milestone")
			.slice(0, 3);
		if (lifeEvents.length > 0) {
			contentEl.createDiv({
				cls: "glance-section-header",
				text: "🌱 In their life",
			});
			const list = contentEl.createEl("ul", { cls: "glance-list" });
			lifeEvents.forEach((e) => {
				const parsed = parseFlexDate(e.date);
				list.createEl("li", {
					text: `${parsed ? formatFlexDate(parsed) : e.date} — ${
						e.text
					}`,
				});
			});
		}

		const recent = sorted
			.filter((e) => e.type !== "life" && e.type !== "milestone")
			.slice(0, 3);
		if (recent.length > 0) {
			contentEl.createDiv({
				cls: "glance-section-header",
				text: "🕘 Recently",
			});
			const list = contentEl.createEl("ul", { cls: "glance-list" });
			recent.forEach((e) => {
				const parsed = parseFlexDate(e.date);
				list.createEl("li", {
					text: `${parsed ? formatFlexDate(parsed) : e.date} — ${
						e.text
					}`,
				});
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
