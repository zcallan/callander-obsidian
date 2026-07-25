import { App, Modal } from "obsidian";
import { INTEREST_CATEGORIES, InterestCategory } from "@/constants";

/**
 * Capture a friend's interest: pick a category, type the thing. Enter saves.
 * Deliberately factual — what they're into, never a rating.
 */
export class InterestModal extends Modal {
	private category: InterestCategory;

	constructor(
		app: App,
		private contactName: string,
		initialCategory: InterestCategory,
		private onSubmit: (
			category: InterestCategory,
			text: string
		) => Promise<void>,
		private initialText = ""
	) {
		super(app);
		this.category = initialCategory;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: `What's ${this.contactName} into?`,
		});

		// Category picker: a wrapping row of emoji buttons
		const categoryRow = contentEl.createEl("div", {
			cls: "quick-idea-categories",
		});
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
				textInput.focus();
			});
			categoryButtons.set(cat.id, button);
		});

		const textInput = contentEl.createEl("input", {
			cls: "quick-idea-input",
			attr: {
				type: "text",
				placeholder: "e.g. Dune, cricket, spicy ramen…",
			},
		});
		textInput.value = this.initialText;

		const buttonContainer = contentEl.createEl("div", {
			cls: "friend-tracker-modal-buttons",
		});
		const saveButton = buttonContainer.createEl("button", {
			text: this.initialText ? "Save" : "Add",
			cls: "friend-tracker-modal-button mod-cta",
		});

		const submit = async () => {
			const text = textInput.value.trim();
			if (!text) return;
			await this.onSubmit(this.category, text);
			this.close();
		};

		saveButton.addEventListener("click", submit);
		textInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				submit();
			}
		});

		setTimeout(() => textInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
