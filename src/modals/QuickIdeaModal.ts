import { App, FuzzySuggestModal, Modal, TFile } from "obsidian";
import type { ContactWithCountdown } from "@/types";
import { IDEA_CATEGORIES, IdeaCategory } from "@/constants";

/**
 * Step 1 of quick capture: fuzzy-pick a friend.
 */
export class ContactSuggestModal extends FuzzySuggestModal<ContactWithCountdown> {
	constructor(
		app: App,
		private contacts: ContactWithCountdown[],
		private onChoose: (contact: ContactWithCountdown) => void,
		placeholder = "Who is this idea for?"
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getItems(): ContactWithCountdown[] {
		return this.contacts;
	}

	getItemText(contact: ContactWithCountdown): string {
		// Match on both display name and real name
		return contact.displayName !== contact.name
			? `${contact.displayName} (${contact.name})`
			: contact.displayName;
	}

	onChooseItem(contact: ContactWithCountdown): void {
		this.onChoose(contact);
	}
}

/** A place an idea can be captured to: a friend, a group, or the inbox. */
export interface CaptureTarget {
	kind: "friend" | "group" | "inbox";
	label: string;
	/** Resolves lazily — group/inbox files are created on first use */
	getFile: () => Promise<TFile>;
}

export class CaptureTargetModal extends FuzzySuggestModal<CaptureTarget> {
	constructor(
		app: App,
		private targets: CaptureTarget[],
		private onChoose: (target: CaptureTarget) => void
	) {
		super(app);
		this.setPlaceholder("Who is this idea for?");
	}

	getItems(): CaptureTarget[] {
		return this.targets;
	}

	getItemText(target: CaptureTarget): string {
		if (target.kind === "group") return `${target.label} (group)`;
		return target.label;
	}

	onChooseItem(target: CaptureTarget): void {
		this.onChoose(target);
	}
}

/**
 * Step 2 of quick capture: category + text. Enter saves.
 */
export class QuickIdeaModal extends Modal {
	private category: IdeaCategory;

	constructor(
		app: App,
		private contactName: string,
		initialCategory: IdeaCategory,
		private onSubmit: (category: IdeaCategory, text: string) => Promise<void>
	) {
		super(app);
		this.category = initialCategory;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: `Idea for ${this.contactName}` });

		// Category picker: one row of emoji buttons
		const categoryRow = contentEl.createEl("div", {
			cls: "quick-idea-categories",
		});

		const categoryButtons = new Map<IdeaCategory, HTMLButtonElement>();
		IDEA_CATEGORIES.forEach((cat) => {
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
				placeholder: "Jot the thought before it evaporates...",
			},
		});

		const buttonContainer = contentEl.createEl("div", {
			cls: "friend-tracker-modal-buttons",
		});
		const saveButton = buttonContainer.createEl("button", {
			text: "Save",
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
