import { App, Modal, setIcon } from "obsidian";
import { PLAN_IDEA_CATEGORIES } from "@/constants";
import { ConfirmModal } from "@/modals/ConfirmModal";
import {
	formatItemCost,
	formatItemTime,
	formatTimelineDay,
} from "@/utils/planFormat";
import { shortenPeopleList } from "@/utils/nameFormat";
import type { PlanQuickIdea } from "@/types";

/**
 * A read view of one quick idea, with the route onto the timeline.
 *
 * "Add to timeline" hands off to the item modal rather than converting
 * silently — the idea only disappears once that modal's Create is pressed,
 * so backing out of it leaves the idea exactly where it was.
 */
export class PlanQuickIdeaViewModal extends Modal {
	constructor(
		app: App,
		private idea: PlanQuickIdea,
		private onEdit: () => void,
		private onDelete: () => Promise<void>,
		private onAddToTimeline: () => void,
		/** Everyone on the plan, so first names disambiguate consistently. */
		private roster: string[] = [],
		private yourName = "",
		private shortNames: Map<string, string> = new Map()
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("someday-view-modal");
		const i = this.idea;

		contentEl.createDiv({ cls: "view-kind", text: "Idea" });
		contentEl.createEl("h2", { text: i.text });

		const type = PLAN_IDEA_CATEGORIES.find((c) => c.id === i.type);
		if (type) {
			contentEl.createDiv({
				cls: "someday-view-meta",
				text: `${type.emoji} ${type.label}`,
			});
		}

		// The days it could happen on — the whole point of the thing, so it
		// reads as a list rather than a single date.
		if (i.dates && i.dates.length > 0) {
			contentEl.createDiv({
				cls: "someday-view-meta",
				text: `📅 ${i.dates.map(formatTimelineDay).join(" · ")}`,
			});
		}
		if (i.time) {
			contentEl.createDiv({
				cls: "someday-view-meta",
				text: `🕘 ${formatItemTime(i.time)}`,
			});
		}

		const rows: string[] = [];
		if (i.people) {
			rows.push(
				`👥 ${shortenPeopleList(
					i.people,
					this.roster,
					this.yourName,
					this.shortNames
				)}`
			);
		}
		if (i.cost !== undefined) rows.push(`💵 ${formatItemCost(i.cost)}`);
		for (const row of rows) {
			contentEl.createDiv({ cls: "someday-view-meta", text: row });
		}

		if (i.categories && i.categories.length > 0) {
			const catRow = contentEl.createDiv({
				cls: "someday-view-meta quick-idea-view-cats",
			});
			for (const cat of i.categories) {
				catRow.createSpan({ cls: "quick-idea-cat-tag", text: cat });
			}
		}

		if (i.notes) {
			contentEl.createDiv({
				cls: "someday-view-notes",
				text: i.notes,
			});
		}

		contentEl.createDiv({ cls: "someday-view-divider" });

		const actions = contentEl.createDiv({ cls: "someday-view-actions" });

		const promote = actions.createEl("button", {
			cls: "callander-button mod-cta",
		});
		setIcon(promote, "calendar-clock");
		promote.createSpan({ text: "Add to timeline" });
		promote.addEventListener("click", () => {
			this.close();
			this.onAddToTimeline();
		});

		const edit = actions.createEl("button", { cls: "callander-button" });
		setIcon(edit, "pencil");
		edit.createSpan({ text: "Edit" });
		edit.addEventListener("click", () => {
			this.close();
			this.onEdit();
		});

		const del = actions.createEl("button", {
			cls: "callander-button button-icon button-danger",
			attr: { "aria-label": "Delete" },
		});
		setIcon(del, "trash-2");
		del.addEventListener("click", () => {
			const preview =
				i.text.length > 80 ? i.text.slice(0, 80) + "…" : i.text;
			new ConfirmModal(
				this.app,
				"Delete idea",
				`Delete "${preview}"?`,
				"Delete",
				async () => {
					await this.onDelete();
					this.close();
				}
			).open();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
