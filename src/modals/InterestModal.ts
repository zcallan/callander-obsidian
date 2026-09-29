import { App } from "obsidian";
import { guardedAction } from "@/components/guardedAction";
import { FormModal } from "@/modals/FormModal";
import { confirmThenClose } from "@/modals/ConfirmModal";
import { INTEREST_CATEGORIES, InterestCategory } from "@/constants";
import type { Interest } from "@/types";

type InterestCategoryInfo = (typeof INTEREST_CATEGORIES)[number];

/**
 * Capture a friend's interest: pick a type, name the thing, up to two more
 * fields where the type has them (a book's author, music's artist and
 * genre), and notes on what they like about it. Deliberately factual —
 * what they're into, never a rating.
 */
export class InterestModal extends FormModal {
	private category: InterestCategory;

	constructor(
		app: App,
		private contactName: string,
		initialCategory: InterestCategory,
		private onSubmit: (
			category: InterestCategory,
			text: string,
			detail: string,
			detail2: string,
			notes: string
		) => Promise<void>,
		/** The interest being edited, or none for a new one. */
		private existing?: Interest,
		/** Offered only when editing — the same pattern QuickIdeaModal uses. */
		private onDelete?: () => Promise<void>
	) {
		super(app);
		this.category = initialCategory;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.existing
				? "Edit interest"
				: `What's ${this.contactName} into?`,
		});

		// Category picker — buttons are added after the inputs exist so their
		// handlers can update the detail field.
		const categoryRow = contentEl.createDiv({
			cls: "quick-idea-categories",
		});

		// Each field's label and placeholder follow the selected type — see
		// INTEREST_CATEGORIES — so the form asks for a Book and its Author,
		// a Song and its Band, and so on.
		const nameField = contentEl.createDiv({ cls: "callander-modal-field" });
		const nameLabel = nameField.createEl("label");
		const textInput = nameField.createEl("input", {
			cls: "quick-idea-input",
			attr: { type: "text" },
		});
		textInput.value = this.existing?.text ?? "";

		// Only shown for a type with a natural second (or third) thing to
		// ask — a book's author, music's artist and its genre.
		const detailField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		const detailLabel = detailField.createEl("label");
		const detailInput = detailField.createEl("input", {
			cls: "quick-idea-input interest-detail-input",
			attr: { type: "text" },
		});
		detailInput.value = this.existing?.detail ?? "";

		const detail2Field = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		const detail2Label = detail2Field.createEl("label");
		const detail2Input = detail2Field.createEl("input", {
			cls: "quick-idea-input interest-detail-input",
			attr: { type: "text" },
		});
		detail2Input.value = this.existing?.detail2 ?? "";

		const notesField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		notesField.createEl("label", { text: "Notes" });
		const notesInput = notesField.createEl("textarea", {
			cls: "quick-idea-input quick-note-text",
			attr: { rows: "2" },
		});
		notesInput.value = this.existing?.notes ?? "";

		const current = () =>
			INTEREST_CATEGORIES.find((c) => c.id === this.category) ??
			INTEREST_CATEGORIES[0];
		const detailOf = (cat: InterestCategoryInfo) =>
			"detailLabel" in cat
				? { label: cat.detailLabel, placeholder: cat.detailPlaceholder }
				: null;
		const detail2Of = (cat: InterestCategoryInfo) =>
			"detail2Label" in cat
				? { label: cat.detail2Label, placeholder: cat.detail2Placeholder }
				: null;
		const syncFields = () => {
			const cat = current();
			nameLabel.setText(cat.label);
			textInput.placeholder = cat.namePlaceholder;
			const detail = detailOf(cat);
			detailField.toggle(!!detail);
			detailLabel.setText(detail?.label ?? "");
			detailInput.placeholder = detail?.placeholder ?? "";
			const detail2 = detail2Of(cat);
			detail2Field.toggle(!!detail2);
			detail2Label.setText(detail2?.label ?? "");
			detail2Input.placeholder = detail2?.placeholder ?? "";
			notesInput.placeholder = cat.notesPlaceholder;
		};

		const categoryButtons = new Map<InterestCategory, HTMLButtonElement>();
		INTEREST_CATEGORIES.forEach((cat) => {
			const button = categoryRow.createEl("button", {
				cls: `quick-idea-category-button ${
					this.category === cat.id ? "selected" : ""
				}`,
				attr: { "aria-label": cat.label },
			});
			button.createSpan({
				cls: "quick-idea-category-emoji",
				text: cat.emoji,
			});
			button.createSpan({ text: cat.label });
			button.addEventListener("click", () => {
				this.category = cat.id;
				categoryButtons.forEach((el, id) =>
					el.toggleClass("selected", id === cat.id)
				);
				syncFields();
			});
			categoryButtons.set(cat.id, button);
		});
		syncFields();

		const buttonContainer = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		// Bottom-left, ahead of Save — the danger class pushes it there.
		const onDelete = this.onDelete;
		if (onDelete) {
			const deleteButton = buttonContainer.createEl("button", {
				text: "Delete",
				cls: "callander-modal-button callander-modal-button-danger",
			});
			deleteButton.addEventListener("click", () => {
				confirmThenClose(this, {
					title: "Delete interest",
					message: `Delete "${this.existing?.text ?? ""}"?`,
					onConfirm: async () => {
						await onDelete();
					},
				});
			});
		}
		const saveButton = buttonContainer.createEl("button", {
			text: this.existing ? "Save" : "Add",
			cls: "callander-modal-button mod-cta",
		});

		const submit = guardedAction(
			async () => {
				const text = textInput.value.trim();
				if (!text) return;
				// A field hidden by the type isn't asked, so isn't saved —
				// switching Book → Hobby shouldn't carry a stray author across.
				const cat = current();
				const detail = detailOf(cat) ? detailInput.value.trim() : "";
				const detail2 = detail2Of(cat) ? detail2Input.value.trim() : "";
				await this.onSubmit(
					this.category,
					text,
					detail,
					detail2,
					notesInput.value.trim()
				);
				this.close();
			},
			{ buttons: [saveButton] }
		);

		saveButton.addEventListener("click", () => void submit());
		this.submitOnEnter([textInput, detailInput, detail2Input], submit);
		// Plain Enter starts a new line, matching every other notes/description
		// textarea here — only Cmd/Ctrl+Enter submits.
		this.submitOnEnter(notesInput, submit, "mod-enter");

		this.blurInitialFocus();
	}
}
