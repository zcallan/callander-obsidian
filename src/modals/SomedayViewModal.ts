import { App, Modal, Notice, setIcon } from "obsidian";
import type FriendTracker from "@/main";
import type { SomedayInfo, SomedaySubIdea } from "@/types";
import { SomedayModal } from "@/modals/SomedayModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { parseFlexDate, formatFlexDate } from "@/utils/flexdate";
import {
	formatSomedayDays,
	formatSomedaySeasons,
	somedayCompany,
} from "@/constants";

/**
 * A read-first look at a Someday — its when/days/company/cost/notes and
 * sub-ideas — with the actions (edit, copy, delete, mark done, convert) as
 * buttons. Sub-idea ticks are mirrored locally so the view stays in step
 * without a refetch.
 */
export class SomedayViewModal extends Modal {
	private status: string;
	private subIdeas: SomedaySubIdea[];
	private notesSaveTimer: number | null = null;
	private notesDirty = false;

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

		// When + candidate days, one line: "📅 Sometime in Oct • Weekends"
		const daysLabel = formatSomedayDays(s.days);
		contentEl.createDiv({
			cls: "someday-view-meta",
			text: `📅 ${[this.whenLabel(), daysLabel]
				.filter(Boolean)
				.join(" • ")}`,
		});

		// Company + cost, one line — the company's own emoji leads it, so
		// "Solo"/"Group"/"Either" carry their existing 🧍/👥/🔀 glyph rather
		// than a generic icon. Skipped entirely when neither is set.
		const comp = somedayCompany(s.company);
		const costLabel = s.cost !== null ? `~$${s.cost}` : "";
		if (comp || costLabel) {
			contentEl.createDiv({
				cls: "someday-view-meta",
				text: `${comp?.emoji ?? "💵"} ${[comp?.label, costLabel]
					.filter(Boolean)
					.join(" • ")}`,
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
					void this.plugin.openContactPage(pf);
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
			const handleToggle = async () => {
				sub.done = box.checked;
				row.toggleClass("done", box.checked);
				await ops.toggleSubIdea(this.someday.file, index);
				await this.onChange();
			};
			box.addEventListener("change", () => void handleToggle());
			row.createSpan({ cls: "someday-subidea-text", text: sub.text });
			const del = row.createEl("button", {
				cls: "callander-button button-icon button-danger",
				attr: { "aria-label": "Remove sub-idea" },
			});
			setIcon(del, "trash");
			const handleRemove = async () => {
				this.subIdeas.splice(index, 1);
				await ops.removeSubIdea(this.someday.file, index);
				await this.onChange();
				this.render();
			};
			del.addEventListener("click", () => void handleRemove());
		});

		// Description — edits live here rather than only in the full Edit
		// form, and saves itself shortly after you stop typing.
		const notesInput = wrap.createEl("textarea", {
			cls: "someday-view-notes-input",
			attr: { placeholder: "Notes (optional)", rows: "3" },
		});
		notesInput.value = this.someday.notes;
		notesInput.addEventListener("input", () => {
			this.scheduleNotesSave(notesInput.value);
		});
		notesInput.addEventListener("blur", () => void this.flushNotes());
		// Being the only textarea, it'd otherwise grab the modal's default
		// focus — undo that right after, so opening the modal doesn't pop
		// the keyboard on mobile or steal focus from the actual buttons.
		window.setTimeout(() => notesInput.blur(), 0);
	}

	/** Debounced write: keeps typing from hitting disk on every keystroke. */
	private scheduleNotesSave(value: string) {
		this.someday.notes = value;
		this.notesDirty = true;
		if (this.notesSaveTimer !== null) {
			window.clearTimeout(this.notesSaveTimer);
		}
		this.notesSaveTimer = window.setTimeout(
			() => void this.flushNotes(),
			600
		);
	}

	/** Write whatever's pending now — called on blur and on close, so a
	 * quick edit-then-dismiss never loses the last few keystrokes. */
	private async flushNotes() {
		if (this.notesSaveTimer !== null) {
			window.clearTimeout(this.notesSaveTimer);
			this.notesSaveTimer = null;
		}
		if (!this.notesDirty) return;
		this.notesDirty = false;
		await this.plugin.somedayOperations.updateSomeday(this.someday.file, {
			notes: this.someday.notes,
		});
		await this.onChange();
	}

	private renderActions(container: HTMLElement) {
		const ops = this.plugin.somedayOperations;
		const s = this.someday;

		const button = (
			row: HTMLElement,
			icon: string,
			label: string,
			onClick: () => void | Promise<void>,
			opts: { iconOnly?: boolean; danger?: boolean } = {}
		) => {
			const btn = row.createEl("button", {
				cls: [
					"callander-button",
					opts.iconOnly && "button-icon",
					opts.danger && "button-danger",
				]
					.filter(Boolean)
					.join(" "),
				attr: opts.iconOnly ? { "aria-label": label } : {},
			});
			setIcon(btn, icon);
			if (!opts.iconOnly) btn.createSpan({ text: label });
			btn.addEventListener("click", () => void onClick());
			return btn;
		};

		// Housekeeping — edit the fields, copy as text, or delete outright.
		const editRow = container.createDiv({ cls: "someday-view-actions" });
		button(editRow, "pencil", "Edit details", () => {
			this.close();
			new SomedayModal(
				this.app,
				this.plugin,
				s,
				this.onChange,
				this.onChange
			).open();
		});
		button(
			editRow,
			"copy",
			"Copy",
			async () => {
				await navigator.clipboard.writeText(this.buildText());
				new Notice("📋 Copied");
			},
			{ iconOnly: true }
		);
		button(
			editRow,
			"trash",
			"Delete",
			() => {
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
			},
			{ iconOnly: true, danger: true }
		);

		container.createDiv({ cls: "someday-view-divider" });

		// The two things that move a someday forward: tick it off, or turn
		// it into an actual plan.
		const progressRow = container.createDiv({
			cls: "someday-view-actions",
		});
		const isDone = this.status === "done";
		button(
			progressRow,
			isDone ? "rotate-ccw" : "check",
			isDone ? "Reopen" : "Mark done",
			async () => {
				this.status = isDone ? "open" : "done";
				this.someday.status = this.status;
				await ops.setStatus(s.file, this.status as "open" | "done");
				await this.onChange();
				this.render();
			}
		);
		if (!s.convertedTo) {
			button(progressRow, "map", "Convert to plan", () => {
				this.close();
				void this.plugin.convertSomedayToPlan(s);
			});
		}
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
		void this.flushNotes();
		this.contentEl.empty();
	}
}
