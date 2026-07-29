import { App, Modal } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import {
	PLAN_IDEA_CATEGORIES,
	PLAN_PRIORITIES,
	PlanIdeaCategory,
	PlanPriority,
} from "@/constants";
import {
	appendScheduleFields,
	ScheduleFieldOptions,
} from "@/modals/scheduleFields";
import { ConfirmModal } from "@/modals/ConfirmModal";

export interface PlanItemValue {
	category: PlanIdeaCategory;
	priority: PlanPriority;
	text: string;
	date?: string;
	time?: string;
	people?: string;
	cost?: number;
}

/**
 * Capture or edit a plan idea: category + priority + text + cost, plus an
 * optional date/time/people. A date promotes the idea onto the plan timeline.
 */
export class PlanItemModal extends FormModal {
	private category: PlanIdeaCategory;
	private priority: PlanPriority;

	constructor(
		app: App,
		private planName: string,
		private onSubmit: (value: PlanItemValue) => Promise<void>,
		private initial: PlanItemValue | null = null,
		private onDelete?: () => Promise<void>,
		private scheduleOptions: ScheduleFieldOptions = {}
	) {
		super(app);
		this.category = initial?.category ?? "activity";
		this.priority = initial?.priority ?? "must";
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.initial ? "Edit idea" : `Add to ${this.planName}`,
		});

		// Idea text first — the one thing you always fill in.
		contentEl.createDiv({
			cls: "modal-section-label",
			text: "Idea",
		});
		const textInput = contentEl.createEl("input", {
			cls: "quick-idea-input",
			attr: { type: "text", placeholder: "e.g. Get a lobster roll" },
		});
		textInput.value = this.initial?.text ?? "";

		// Category picker
		contentEl.createDiv({
			cls: "modal-section-label",
			text: "Category",
		});
		const catRow = contentEl.createDiv({
			cls: "quick-idea-categories",
		});
		const catButtons = new Map<PlanIdeaCategory, HTMLButtonElement>();
		PLAN_IDEA_CATEGORIES.forEach((c) => {
			const button = catRow.createEl("button", {
				cls: `quick-idea-category-button ${
					this.category === c.id ? "selected" : ""
				}`,
			});
			button.createSpan({
				cls: "quick-idea-category-emoji",
				text: c.emoji,
			});
			button.createSpan({ text: c.label });
			button.addEventListener("click", () => {
				this.category = c.id;
				catButtons.forEach((el, id) =>
					el.toggleClass("selected", id === c.id)
				);
			});
			catButtons.set(c.id, button);
		});

		// Optional scheduling — a date promotes this idea onto the timeline.
		const schedule = appendScheduleFields(
			contentEl,
			{
				date: this.initial?.date,
				time: this.initial?.time,
				people: this.initial?.people,
			},
			this.scheduleOptions
		);

		contentEl.createDiv({
			cls: "modal-section-label",
			text: "Approx. cost (optional)",
		});
		const costWrap = contentEl.createDiv({
			cls: "plan-cost-input-wrap",
		});
		costWrap.createSpan({ cls: "plan-cost-input-prefix", text: "$" });
		const costInput = costWrap.createEl("input", {
			cls: "quick-idea-input plan-cost-input",
			attr: { type: "number", min: "0", placeholder: "0" },
		});
		if (this.initial?.cost) costInput.value = String(this.initial.cost);

		// Priority picker — at the bottom, above the buttons
		contentEl.createDiv({
			cls: "modal-section-label",
			text: "Priority",
		});
		const priRow = contentEl.createDiv({
			cls: "quick-idea-categories plan-priority-row",
		});
		const priButtons = new Map<PlanPriority, HTMLButtonElement>();
		PLAN_PRIORITIES.forEach((p) => {
			const button = priRow.createEl("button", {
				cls: `quick-idea-category-button ${
					this.priority === p.id ? "selected" : ""
				}`,
			});
			button.createSpan({
				cls: "quick-idea-category-emoji",
				text: p.emoji,
			});
			button.createSpan({ text: p.label });
			button.addEventListener("click", () => {
				this.priority = p.id;
				priButtons.forEach((el, id) =>
					el.toggleClass("selected", id === p.id)
				);
			});
			priButtons.set(p.id, button);
		});

		const buttonRow = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});

		if (this.initial && this.onDelete) {
			const deleteButton = buttonRow.createEl("button", {
				text: "Delete",
				cls: "callander-modal-button callander-modal-button-danger",
			});
			deleteButton.addEventListener("click", () => {
				const preview =
					this.initial!.text.length > 80
						? this.initial!.text.slice(0, 80) + "…"
						: this.initial!.text;
				new ConfirmModal(
					this.app,
					"Delete idea",
					`Delete "${preview}"?`,
					"Delete",
					async () => {
						await this.onDelete!();
						this.close();
					}
				).open();
			});
		}

		const saveButton = buttonRow.createEl("button", {
			text: this.initial ? "Save" : "Add",
			cls: "callander-modal-button mod-cta",
		});

		const submit = async () => {
			const text = textInput.value.trim();
			if (!text) return;
			const cost = Number(costInput.value);
			await this.onSubmit({
				category: this.category,
				priority: this.priority,
				text,
				...schedule.values(),
				...(Number.isFinite(cost) && cost > 0 && { cost }),
			});
			this.close();
		};
		saveButton.addEventListener("click", () => void submit());
		for (const input of [textInput, costInput, ...schedule.inputs]) {
			input.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					void submit();
				}
			});
		}
		window.setTimeout(() => textInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
