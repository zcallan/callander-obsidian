import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { INTEREST_CATEGORIES, InterestCategory } from "@/constants";

/**
 * Capture a friend's interest: pick a category, type the thing, and an optional
 * second detail whose label follows the category (author, artist, restaurant…).
 * Deliberately factual — what they're into, never a rating.
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
			detail: string
		) => Promise<void>,
		private initialText = "",
		private initialDetail = ""
	) {
		super(app);
		this.category = initialCategory;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: `What's ${this.contactName} into?` });

		// Category picker — buttons are added after the inputs exist so their
		// handlers can update the detail field.
		const categoryRow = contentEl.createDiv({
			cls: "quick-idea-categories",
		});

		const textInput = contentEl.createEl("input", {
			cls: "quick-idea-input",
			attr: {
				type: "text",
				placeholder: "e.g. Dune, cricket, spicy ramen…",
			},
		});
		textInput.value = this.initialText;

		// Second, optional field — its label/placeholder follow the category
		const detailLabel = contentEl.createDiv({
			cls: "interest-detail-label",
		});
		const detailInput = contentEl.createEl("input", {
			cls: "quick-idea-input interest-detail-input",
			attr: { type: "text" },
		});
		detailInput.value = this.initialDetail;
		const syncDetail = () => {
			const cat = INTEREST_CATEGORIES.find((c) => c.id === this.category);
			detailLabel.setText(cat?.detailLabel ?? "Details (optional)");
			detailInput.placeholder =
				cat?.detailPlaceholder ?? "Optional details";
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
				syncDetail();
				textInput.focus();
			});
			categoryButtons.set(cat.id, button);
		});
		syncDetail();

		const buttonContainer = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		const saveButton = buttonContainer.createEl("button", {
			text: this.initialText ? "Save" : "Add",
			cls: "callander-modal-button mod-cta",
		});

		const submit = async () => {
			const text = textInput.value.trim();
			if (!text) return;
			await this.onSubmit(this.category, text, detailInput.value.trim());
			this.close();
		};

		saveButton.addEventListener("click", () => void submit());
		const onEnter = (event: KeyboardEvent) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void submit();
			}
		};
		textInput.addEventListener("keydown", onEnter);
		detailInput.addEventListener("keydown", onEnter);

		window.setTimeout(() => textInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
