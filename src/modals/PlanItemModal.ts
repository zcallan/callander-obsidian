import { App, setIcon } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import {
	PLAN_IDEA_CATEGORIES,
	PLAN_PRIORITIES,
	PlanIdeaCategory,
	PlanPriority,
} from "@/constants";
import {
	appendDurationField,
	appendPeopleField,
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
	duration?: string;
	people?: string;
	location?: string;
	cost?: number;
	notes?: string;
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
		private scheduleOptions: ScheduleFieldOptions = {},
		/**
		 * Starting values for a brand-new item, when whatever opened this
		 * already knows some of the answer — promoting a quick idea, say.
		 *
		 * Deliberately separate from `initial`: that means "an item that
		 * already exists", and drives the heading, the Add/Save wording and
		 * whether Delete is offered. A prefilled Add is still an Add.
		 */
		private prefill: PlanItemValue | null = null
	) {
		super(app);
		this.category = initial?.category ?? prefill?.category ?? "activity";
		this.priority = initial?.priority ?? prefill?.priority ?? "must";
	}

	/** Whatever should populate the fields — an edit's own values, else a prefill. */
	private get source(): PlanItemValue | null {
		return this.initial ?? this.prefill;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.initial ? "Edit item" : `Add to ${this.planName}`,
		});

		const form = contentEl.createEl("form", {
			cls: "callander-add-contact-form",
		});

		// Idea text first — the one thing you always fill in.
		const textField = form.createDiv({ cls: "callander-modal-field" });
		textField.createEl("label", { text: "Item" });
		const textInput = textField.createEl("input", {
			cls: "callander-modal-input",
			attr: {
				type: "text",
				name: "idea",
				placeholder: "e.g. Get a lobster roll",
			},
		});
		textInput.value = this.source?.text ?? "";
		// Arrives pre-filled either way, so don't land focus in the first
		// field and pop the mobile keyboard over text already there.
		if (this.source) this.blurInitialFocus();
		else textInput.focus();

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
		// People sits in the accordion below with the rest of the optional
		// detail, not here.
		const schedule = appendScheduleFields(
			form,
			{ date: this.source?.date, time: this.source?.time },
			{ ...this.scheduleOptions, hidePeople: true }
		);

		// How long it runs, straight under the time it starts — the two
		// answer one question between them, and a calendar export needs
		// both to know when the thing ends.
		const duration = appendDurationField(form, this.source?.duration);

		// Where it happens — a Map button, mirroring an accommodation's
		// address, since it's the same "get me there" affordance.
		const locationField = form.createDiv({ cls: "callander-modal-field" });
		locationField.createEl("label", { text: "Location (optional)" });
		const locationRow = locationField.createDiv({ cls: "event-link-row" });
		const locationInput = locationRow.createEl("input", {
			cls: "callander-modal-input",
			attr: {
				type: "text",
				name: "location",
				placeholder: "e.g. Eventide Oyster Co",
			},
		});
		locationInput.value = this.source?.location ?? "";
		const mapButton = locationRow.createEl("button", {
			cls: "callander-button event-link-open",
			text: "Map",
			attr: { type: "button" },
		});
		mapButton.addEventListener("click", () => {
			const query = locationInput.value.trim();
			if (!query) return;
			window.open(
				`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
					query
				)}`,
				"_blank"
			);
		});

		// Additional details — the same accordion the event modal uses, so
		// the form leads with what/category/when and folds the rest away.
		const detailsWrap = form.createDiv({
			cls: "callander-modal-field plan-accordion callander-modal-accordion",
		});
		const detailsHeader = detailsWrap.createDiv({
			cls: "plan-accordion-header callander-modal-accordion-header",
		});
		detailsHeader.createSpan({ text: "Additional details" });
		setIcon(
			detailsHeader.createSpan({ cls: "plan-accordion-chevron" }),
			"chevron-down"
		);
		const detailsBody = detailsWrap.createDiv({
			cls: "plan-accordion-body",
		});
		detailsHeader.addEventListener("click", () => {
			detailsWrap.toggleClass("is-open", !detailsWrap.hasClass("is-open"));
		});
		// An edit that already has any of these opens showing them, rather
		// than hiding saved detail behind a closed lid.
		detailsWrap.toggleClass(
			"is-open",
			!!(this.source?.people || this.source?.cost || this.source?.notes)
		);

		const peopleField = detailsBody.createDiv({
			cls: "callander-modal-field",
		});
		const people = appendPeopleField(
			peopleField,
			this.source?.people,
			this.scheduleOptions.people
		);

		const costField = detailsBody.createDiv({ cls: "callander-modal-field" });
		costField.createEl("label", { text: "Approx. cost (optional)" });
		const costWrap = costField.createDiv({
			cls: "expense-input-wrap",
		});
		costWrap.createSpan({ cls: "expense-input-prefix", text: "$" });
		const costInput = costWrap.createEl("input", {
			cls: "callander-modal-input expense-input",
			attr: { type: "number", name: "cost", min: "0", placeholder: "0" },
		});
		if (this.source?.cost) costInput.value = String(this.source.cost);

		const priField = detailsBody.createDiv({ cls: "callander-modal-field" });
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

		const notesField = detailsBody.createDiv({
			cls: "callander-modal-field",
		});
		notesField.createEl("label", { text: "Notes (optional)" });
		const notesInput = notesField.createEl("textarea", {
			cls: "callander-modal-input plan-notes-input",
			attr: {
				name: "notes",
				rows: "2",
				placeholder: "e.g. Booked for 7pm under Callan",
			},
		});
		notesInput.value = this.source?.notes ?? "";

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
					"Delete item",
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
			const location = locationInput.value.trim();
			const notes = notesInput.value.trim();
			const peopleValue = people.value();
			const durationValue = duration.value();
			void this.onSubmit({
				category: this.category,
				priority: this.priority,
				text,
				...schedule.values(),
				...(durationValue && { duration: durationValue }),
				...(peopleValue && { people: peopleValue }),
				...(location && { location }),
				...(Number.isFinite(cost) && cost > 0 && { cost }),
				...(notes && { notes }),
			}).then(() => this.close());
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
