import { App } from "obsidian";
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
 *
 * Structured exactly like AddContactModal (a real <form>, labelled fields,
 * synchronous focus, type=submit) — that shape behaves with the iOS
 * keyboard where the previous flat layout didn't.
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

		const form = contentEl.createEl("form", {
			cls: "callander-add-contact-form",
		});

		// Idea text first — the one thing you always fill in.
		const textField = form.createDiv({ cls: "callander-modal-field" });
		textField.createEl("label", { text: "Idea" });
		const textInput = textField.createEl("input", {
			cls: "callander-modal-input",
			attr: {
				type: "text",
				name: "idea",
				placeholder: "e.g. Get a lobster roll",
			},
		});
		textInput.value = this.initial?.text ?? "";
		textInput.focus();

		// Category picker (type=button so chips don't submit the form)
		const catField = form.createDiv({ cls: "callander-modal-field" });
		catField.createEl("label", { text: "Category" });
		const catRow = catField.createDiv({
			cls: "quick-idea-categories",
		});
		const catButtons = new Map<PlanIdeaCategory, HTMLButtonElement>();
		PLAN_IDEA_CATEGORIES.forEach((c) => {
			const button = catRow.createEl("button", {
				cls: `quick-idea-category-button ${
					this.category === c.id ? "selected" : ""
				}`,
				attr: { type: "button" },
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
			form,
			{
				date: this.initial?.date,
				time: this.initial?.time,
				people: this.initial?.people,
			},
			this.scheduleOptions
		);

		const costField = form.createDiv({ cls: "callander-modal-field" });
		costField.createEl("label", { text: "Approx. cost (optional)" });
		const costWrap = costField.createDiv({
			cls: "plan-cost-input-wrap",
		});
		costWrap.createSpan({ cls: "plan-cost-input-prefix", text: "$" });
		const costInput = costWrap.createEl("input", {
			cls: "callander-modal-input plan-cost-input",
			attr: { type: "number", name: "cost", min: "0", placeholder: "0" },
		});
		if (this.initial?.cost) costInput.value = String(this.initial.cost);

		// Priority picker — at the bottom, above the buttons
		const priField = form.createDiv({ cls: "callander-modal-field" });
		priField.createEl("label", { text: "Priority" });
		const priRow = priField.createDiv({
			cls: "quick-idea-categories plan-priority-row",
		});
		const priButtons = new Map<PlanPriority, HTMLButtonElement>();
		PLAN_PRIORITIES.forEach((p) => {
			const button = priRow.createEl("button", {
				cls: `quick-idea-category-button ${
					this.priority === p.id ? "selected" : ""
				}`,
				attr: { type: "button" },
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

		const buttonRow = form.createDiv({
			cls: "callander-modal-buttons",
		});

		if (this.initial && this.onDelete) {
			const deleteButton = buttonRow.createEl("button", {
				text: "Delete",
				cls: "callander-modal-button callander-modal-button-danger",
				attr: { type: "button" },
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

		buttonRow.createEl("button", {
			text: this.initial ? "Save" : "Add",
			cls: "callander-modal-button mod-cta",
			attr: { type: "submit" },
		});

		// Enter in any field submits via the form, like Add friend
		form.addEventListener("submit", (e) => {
			e.preventDefault();
			const text = textInput.value.trim();
			if (!text) return;
			const cost = Number(costInput.value);
			void this.onSubmit({
				category: this.category,
				priority: this.priority,
				text,
				...schedule.values(),
				...(Number.isFinite(cost) && cost > 0 && { cost }),
			}).then(() => this.close());
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
