import { App, Modal, Notice, setIcon } from "obsidian";
import type FriendTracker from "@/main";
import type { SomedayInfo, SomedaySubIdea } from "@/types";
import { SomedayModal } from "@/modals/SomedayModal";
import { SomedaySubIdeaModal } from "@/modals/SomedaySubIdeaModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { parseFlexDate, formatFlexDate } from "@/utils/flexdate";
import {
	formatSomedayDays,
	formatSomedaySeasons,
	somedayCompany,
} from "@/constants";

/**
 * A read-first look at a Someday — its when/days/company/cost/notes and
 * sub-ideas — with the actions (convert, edit, done, copy, delete) as buttons.
 * Sub-idea ticks are mirrored locally so the view stays in step without a refetch.
 */
export class SomedayViewModal extends Modal {
	private status: string;
	private subIdeas: SomedaySubIdea[];

	constructor(
		app: App,
		private plugin: FriendTracker,
		private someday: SomedayInfo,
		private onChange: () => void | Promise<void>
	) {
		super(app);
		this.status = someday.status;
		this.subIdeas = someday.subIdeas.map((s) => ({ ...s }));
	}

	private whenLabel(): string {
		const f = parseFlexDate(this.someday.date);
		if (f) return formatFlexDate(f);
		return formatSomedaySeasons(this.someday.seasons) || "Any time";
	}

	onOpen() {
		this.render();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("someday-view-modal");
		const s = this.someday;

		contentEl.createEl("h2", { text: s.name });

		const metaParts: string[] = [this.whenLabel()];
		const comp = somedayCompany(s.company);
		if (comp) metaParts.push(comp.label);
		const days = formatSomedayDays(s.days);
		if (days) metaParts.push(days);
		contentEl.createDiv({
			cls: "someday-view-meta",
			text: metaParts.join(" · "),
		});

		if (s.cost !== null) {
			contentEl.createDiv({
				cls: "someday-view-cost",
				text: `~$${s.cost}`,
			});
		}

		if (s.notes) {
			contentEl.createDiv({
				cls: "someday-view-notes",
				text: s.notes,
			});
		}

		if (s.convertedTo) {
			const link = contentEl.createDiv({
				cls: "someday-converted-link",
				text: "→ opened as a plan",
			});
			link.addEventListener("click", () => {
				const pf = this.app.vault.getFileByPath(s.convertedTo);
				if (pf) {
					this.close();
					this.plugin.openContactPage(pf);
				}
			});
		}

		this.renderSubIdeas(contentEl);
		this.renderActions(contentEl);
	}

	private renderSubIdeas(container: HTMLElement) {
		const ops = this.plugin.somedayOperations;
		const wrap = container.createDiv({
			cls: "someday-view-subideas",
		});

		this.subIdeas.forEach((sub, index) => {
			const row = wrap.createDiv({
				cls: `someday-subidea${sub.done ? " done" : ""}`,
			});
			const box = row.createEl("input", {
				attr: { type: "checkbox", "aria-label": "Done" },
			});
			box.checked = !!sub.done;
			box.addEventListener("change", async () => {
				sub.done = box.checked;
				row.toggleClass("done", box.checked);
				await ops.toggleSubIdea(this.someday.file, index);
				await this.onChange();
			});
			row.createSpan({ cls: "someday-subidea-text", text: sub.text });
			const del = row.createEl("button", {
				cls: "callander-button button-icon button-danger",
				attr: { "aria-label": "Remove sub-idea" },
			});
			setIcon(del, "trash");
			del.addEventListener("click", async () => {
				this.subIdeas.splice(index, 1);
				await ops.removeSubIdea(this.someday.file, index);
				await this.onChange();
				this.render();
			});
		});

		const addBtn = wrap.createEl("button", {
			cls: "callander-button someday-subidea-addbtn",
		});
		setIcon(addBtn, "plus");
		addBtn.createSpan({ text: "Add sub-idea" });
		addBtn.addEventListener("click", () => {
			new SomedaySubIdeaModal(
				this.app,
				this.someday.name,
				async (text) => {
					this.subIdeas.push({ text, done: false });
					await ops.addSubIdea(this.someday.file, text);
					await this.onChange();
					this.render();
				}
			).open();
		});
	}

	private renderActions(container: HTMLElement) {
		const ops = this.plugin.somedayOperations;
		const s = this.someday;
		const actions = container.createDiv({
			cls: "someday-view-actions",
		});
		const button = (icon: string, label: string, onClick: () => void) => {
			const btn = actions.createEl("button", {
				cls: "callander-button",
			});
			setIcon(btn, icon);
			btn.createSpan({ text: label });
			btn.addEventListener("click", onClick);
			return btn;
		};

		if (!s.convertedTo) {
			button("map", "Convert to plan", () => {
				this.close();
				this.plugin.convertSomedayToPlan(s);
			});
		}
		button("pencil", "Edit", () => {
			this.close();
			new SomedayModal(
				this.app,
				this.plugin,
				s,
				this.onChange,
				this.onChange
			).open();
		});
		const isDone = this.status === "done";
		button(
			isDone ? "rotate-ccw" : "check",
			isDone ? "Reopen" : "Done",
			async () => {
				this.status = isDone ? "open" : "done";
				this.someday.status = this.status;
				await ops.setStatus(s.file, this.status as "open" | "done");
				await this.onChange();
				this.render();
			}
		);
		button("copy", "Copy", async () => {
			await navigator.clipboard.writeText(this.buildText());
			new Notice("📋 Copied");
		});

		const del = actions.createEl("button", {
			cls: "callander-button button-danger",
		});
		setIcon(del, "trash");
		del.createSpan({ text: "Delete" });
		del.addEventListener("click", () => {
			new ConfirmModal(
				this.app,
				"Delete someday",
				`Delete "${s.name}"?`,
				"Delete",
				async () => {
					await ops.deleteSomeday(s.file);
					await this.onChange();
					this.close();
				}
			).open();
		});
	}

	private buildText(): string {
		const s = this.someday;
		const lines: string[] = [s.name, `When: ${this.whenLabel()}`];
		const days = formatSomedayDays(s.days);
		if (days) lines.push(`Best days: ${days}`);
		const comp = somedayCompany(s.company);
		if (comp) lines.push(comp.label);
		if (s.cost !== null) lines.push(`~$${s.cost}`);
		if (s.notes) lines.push("", s.notes);
		if (this.subIdeas.length > 0) {
			lines.push("", "Ideas:");
			for (const sub of this.subIdeas) {
				lines.push(`- ${sub.done ? "✓ " : ""}${sub.text}`);
			}
		}
		return lines.join("\n");
	}

	onClose() {
		this.contentEl.empty();
	}
}
