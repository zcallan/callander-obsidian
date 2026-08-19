import { App, setIcon } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { PLAN_IDEA_CATEGORIES, PlanIdeaCategory } from "@/constants";
import {
	appendDurationField,
	appendPeopleField,
	appendScheduleFields,
	ScheduleFieldOptions,
} from "@/modals/scheduleFields";
import { formatShortWeekdayDate } from "@/utils/flexdate";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { AddCategoryModal } from "@/modals/AddCategoryModal";
import type { PlanQuickIdea } from "@/types";

/**
 * Capture or edit a quick idea: something you might do on this plan, with
 * no commitment to when.
 *
 * The shape differs from the timeline's item modal in the one way that
 * matters — days are a multi-select of candidates ("Tue or Wed would work")
 * rather than a single chosen day. Everything else reuses the item modal's
 * controls, so a promoted idea's type, time, people, cost and notes carry
 * straight across.
 */
export class PlanQuickIdeaModal extends FormModal {
	private type: PlanIdeaCategory;
	private categories: string[];
	private dates: string[];

	constructor(
		app: App,
		private onSubmit: (value: PlanQuickIdea) => Promise<void>,
		private initial: PlanQuickIdea | null = null,
		private onDelete?: () => Promise<void>,
		private scheduleOptions: ScheduleFieldOptions = {},
		/** Category names known to this plan, offered for reuse. */
		private knownCategories: string[] = [],
		/** Removes a category from the plan's vocabulary and every idea on it. */
		private onDeleteCategory?: (category: string) => Promise<void>
	) {
		super(app);
		this.type = initial?.type ?? "activity";
		this.categories = [...(initial?.categories ?? [])];
		this.dates = [...(initial?.dates ?? [])];
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.initial ? "Edit idea" : "Add idea",
		});

		const form = contentEl.createEl("form", {
			cls: "callander-add-contact-form",
		});

		// Name first, then categories — the order you think of them in.
		const textField = form.createDiv({ cls: "callander-modal-field" });
		textField.createEl("label", { text: "Idea" });
		const textInput = textField.createEl("input", {
			cls: "callander-modal-input",
			attr: {
				type: "text",
				name: "idea",
				placeholder: "e.g. Get a cannoli in the North End",
			},
		});
		textInput.value = this.initial?.text ?? "";
		if (this.initial) this.blurInitialFocus();
		else textInput.focus();

		this.renderCategories(form);

		// Type — the same list the timeline uses, so promoting keeps it.
		const typeField = form.createDiv({ cls: "callander-modal-field" });
		typeField.createEl("label", { text: "Type" });
		const typeRow = typeField.createDiv({ cls: "quick-idea-categories" });
		const typeButtons = new Map<PlanIdeaCategory, HTMLButtonElement>();
		PLAN_IDEA_CATEGORIES.forEach((c) => {
			const button = typeRow.createEl("button", {
				cls: `quick-idea-category-button ${
					this.type === c.id ? "selected" : ""
				}`,
				attr: { type: "button" },
			});
			button.createSpan({
				cls: "quick-idea-category-emoji",
				text: c.emoji,
			});
			button.createSpan({ text: c.label });
			button.addEventListener("click", () => {
				this.type = c.id;
				typeButtons.forEach((el, id) =>
					el.toggleClass("selected", id === c.id)
				);
			});
			typeButtons.set(c.id, button);
		});

		// Time only — one date field can't hold several candidates, so the
		// days below answer "when" instead. People sits in the accordion
		// below with the rest of the optional detail.
		const schedule = appendScheduleFields(
			form,
			{ time: this.initial?.time },
			{ ...this.scheduleOptions, hideDate: true, hidePeople: true }
		);

		this.renderDays(form);

		// Cost and notes fold away, same as the item modal.
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
		detailsWrap.toggleClass(
			"is-open",
			!!(
				this.initial?.duration ||
				this.initial?.people ||
				this.initial?.cost ||
				this.initial?.notes
			)
		);

		const duration = appendDurationField(
			detailsBody,
			this.initial?.duration
		);

		const peopleField = detailsBody.createDiv({
			cls: "callander-modal-field",
		});
		const people = appendPeopleField(
			peopleField,
			this.initial?.people,
			this.scheduleOptions.people
		);

		const costField = detailsBody.createDiv({
			cls: "callander-modal-field",
		});
		costField.createEl("label", { text: "Approx. cost (optional)" });
		const costWrap = costField.createDiv({ cls: "expense-input-wrap" });
		costWrap.createSpan({ cls: "expense-input-prefix", text: "$" });
		const costInput = costWrap.createEl("input", {
			cls: "callander-modal-input expense-input",
			attr: { type: "number", name: "cost", min: "0", placeholder: "0" },
		});
		if (this.initial?.cost) costInput.value = String(this.initial.cost);

		const notesField = detailsBody.createDiv({
			cls: "callander-modal-field",
		});
		notesField.createEl("label", { text: "Notes (optional)" });
		const notesInput = notesField.createEl("textarea", {
			cls: "callander-modal-input plan-notes-input",
			attr: {
				name: "notes",
				rows: "2",
				placeholder: "e.g. Walk-ins only, gets busy after 7",
			},
		});
		notesInput.value = this.initial?.notes ?? "";

		const buttonRow = form.createDiv({ cls: "callander-modal-buttons" });

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

		form.addEventListener("submit", (e) => {
			e.preventDefault();
			const text = textInput.value.trim();
			if (!text) return;
			const cost = Number(costInput.value);
			const notes = notesInput.value.trim();
			const { time } = schedule.values();
			const peopleValue = people.value();
			const durationValue = duration.value();
			void this.onSubmit({
				text,
				type: this.type,
				...(this.categories.length > 0 && {
					categories: [...this.categories],
				}),
				...(this.dates.length > 0 && { dates: [...this.dates] }),
				...(time && { time }),
				...(durationValue && { duration: durationValue }),
				...(peopleValue && { people: peopleValue }),
				...(Number.isFinite(cost) && cost > 0 && { cost }),
				...(notes && { notes }),
				...(this.initial?.created && { created: this.initial.created }),
			}).then(() => this.close());
		});
	}

	/**
	 * Categories: free text, because they're whatever this plan needs
	 * ("Boston", "Rainy day").
	 *
	 * Every category this plan knows renders as a toggle chip — purple when
	 * picked, same as the day chips below — so there's one state to read per
	 * chip rather than a separate row of what's selected above a row of
	 * what's available. Clicking a picked chip again un-picks it, so there's
	 * no separate remove control to learn.
	 *
	 * A trailing "+ Add" chip opens AddCategoryModal for a new name, rather
	 * than a text box sitting in this form permanently: the categories a plan
	 * uses settle early and then rarely change, so the common visit picks
	 * from what's already there. A new one arrives picked, since naming it
	 * here means wanting it on this idea.
	 *
	 * The list itself is saved against the plan (see ContactPageView's
	 * rememberQuickIdeaCategories), not derived from what's currently in
	 * use, so a category someone un-picks everywhere stays offered next
	 * time rather than quietly vanishing.
	 */
	private renderCategories(form: HTMLElement) {
		const field = form.createDiv({
			cls: "callander-modal-field quick-idea-cat-field",
		});
		field.createEl("label", { text: "Categories" });

		// Known categories plus whatever's already picked on this idea (an
		// edit can carry a category the plan has since stopped listing).
		const options = [...this.knownCategories];
		for (const cat of this.categories) {
			if (!options.some((c) => c.toLowerCase() === cat.toLowerCase())) {
				options.push(cat);
			}
		}

		const chipsEl = field.createDiv({ cls: "quick-idea-cat-chips" });

		const isPicked = (cat: string) =>
			this.categories.some((c) => c.toLowerCase() === cat.toLowerCase());

		// Holding a chip for LONG_PRESS_MS deletes the category from the whole
		// plan rather than toggling it — the only way to get rid of one, since
		// rememberQuickIdeaCategories only ever adds. Pointer events cover
		// mouse and touch alike; the timer is cleared on any early release so
		// a normal tap still just toggles.
		const LONG_PRESS_MS = 2000;
		const confirmDeleteCategory = (cat: string) => {
			if (!this.onDeleteCategory) return;
			new ConfirmModal(
				this.app,
				"Remove category",
				`Remove "${cat}"? This takes it off every idea on this plan, not just this one.`,
				"Remove",
				async () => {
					await this.onDeleteCategory!(cat);
					const at = options.findIndex(
						(c) => c.toLowerCase() === cat.toLowerCase()
					);
					if (at >= 0) options.splice(at, 1);
					const picked = this.categories.findIndex(
						(c) => c.toLowerCase() === cat.toLowerCase()
					);
					if (picked >= 0) this.categories.splice(picked, 1);
					renderChips();
				}
			).open();
		};

		const renderChips = () => {
			chipsEl.empty();
			for (const cat of options) {
				const chip = chipsEl.createEl("button", {
					cls: "someday-filter-pill",
					text: cat,
					attr: { type: "button" },
				});
				chip.toggleClass("is-active", isPicked(cat));

				let holdTimer: number | null = null;
				let longPressed = false;
				const clearHold = () => {
					if (holdTimer === null) return;
					window.clearTimeout(holdTimer);
					holdTimer = null;
				};
				chip.addEventListener("pointerdown", (e) => {
					if (e.button !== 0 || !this.onDeleteCategory) return;
					longPressed = false;
					holdTimer = window.setTimeout(() => {
						longPressed = true;
						confirmDeleteCategory(cat);
					}, LONG_PRESS_MS);
				});
				chip.addEventListener("pointerup", clearHold);
				chip.addEventListener("pointerleave", clearHold);
				chip.addEventListener("pointercancel", clearHold);
				// Long-press already opened the confirm dialog — the click
				// that follows a touch/mouse release shouldn't also toggle.
				chip.addEventListener("click", () => {
					if (longPressed) {
						longPressed = false;
						return;
					}
					toggle(cat);
				});
				chip.addEventListener("contextmenu", (e) => e.preventDefault());
			}

			// Trails the real categories, and deliberately looks like one:
			// adding is the same kind of act as picking, and a chip keeps it
			// on the same line rather than spending a form row on it.
			const addChip = chipsEl.createEl("button", {
				cls: "someday-filter-pill quick-idea-cat-add",
				text: "+ Add",
				attr: { type: "button" },
			});
			addChip.addEventListener("click", () => {
				new AddCategoryModal(
					this.app,
					(name) => add(name),
					// Both the plan's own list and anything picked here, so a
					// name already on screen can't be added a second time.
					options
				).open();
			});
		};

		const toggle = (cat: string) => {
			const at = this.categories.findIndex(
				(c) => c.toLowerCase() === cat.toLowerCase()
			);
			if (at >= 0) this.categories.splice(at, 1);
			else this.categories.push(cat);
			renderChips();
		};

		const add = (raw: string) => {
			const name = raw.trim();
			if (!name) return;
			// Case-insensitive: "boston" and "Boston" are one category, and
			// whichever spelling the plan already has wins.
			const existing = options.find(
				(c) => c.toLowerCase() === name.toLowerCase()
			);
			const value = existing ?? name;
			if (!existing) options.push(value);
			if (!isPicked(value)) this.categories.push(value);
			renderChips();
		};

		renderChips();
	}

	/**
	 * Candidate days — the field that makes this a quick idea rather than a
	 * timeline item. Several can be picked, so "Tue or Wed" is one idea
	 * rather than two half-committed ones.
	 *
	 * A dropdown that empties itself and drops a chip below, the same shape
	 * the People field uses: the full day reads unambiguously while you're
	 * choosing ("Friday 21 August"), and the chips stay short once chosen
	 * ("Fri 21 Aug") so several fit on a line. Picking one removes it from
	 * the list, so it can't be added twice.
	 *
	 * Only offered when the plan has an exact date range; without one there
	 * are no days to choose between and the idea simply has no dates.
	 */
	private renderDays(form: HTMLElement) {
		const days = this.scheduleOptions.dayOptions ?? [];
		if (days.length === 0) return;

		const field = form.createDiv({ cls: "callander-modal-field" });
		field.createEl("label", { text: "Possible days (optional)" });

		const pillsEl = field.createDiv({ cls: "quick-idea-cat-chips" });
		// Short date rather than bare weekday: unlike the item modal's own
		// date pills (capped at under a week, where "Friday" alone is
		// unambiguous), a plan can run long enough to have two Fridays, and
		// these are never hidden behind a length cap.
		const label = (iso: string) => {
			const d = new Date(`${iso}T00:00:00`);
			// Falls back to the stored value for a date that won't parse —
			// better a raw ISO pill than "Invalid Date".
			return isNaN(d.getTime()) ? iso : formatShortWeekdayDate(d);
		};

		const renderPills = () => {
			pillsEl.empty();
			// `days` is already chronological (built from daysBetween), so
			// the pills read left-to-right in plan order.
			for (const d of days) {
				const pill = pillsEl.createEl("button", {
					cls: "someday-filter-pill",
					text: label(d.value),
					attr: { type: "button" },
				});
				pill.toggleClass("is-active", this.dates.includes(d.value));
				pill.addEventListener("click", () => {
					const at = this.dates.indexOf(d.value);
					if (at >= 0) this.dates.splice(at, 1);
					else this.dates.push(d.value);
					renderPills();
				});
			}
		};

		renderPills();
	}

	onClose() {
		this.contentEl.empty();
	}
}
