import { App, FuzzySuggestModal, TFile } from "obsidian";
import { guardedAction } from "@/components/guardedAction";
import { FormModal } from "@/modals/FormModal";
import { confirmThenClose } from "@/modals/ConfirmModal";
import { appendGeneratedBadge } from "@/components/generatedBadge";
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

/** A place an idea can be captured to: a friend, group, plan, or the inbox. */
export interface CaptureTarget {
	kind: "friend" | "group" | "plan" | "inbox";
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
		if (target.kind === "plan") return `${target.label} (plan)`;
		return target.label;
	}

	onChooseItem(target: CaptureTarget): void {
		this.onChoose(target);
	}
}

/**
 * Step 2 of quick capture: category + text. Enter saves.
 *
 * Also how an existing idea gets edited — same fields, same modal. `onDelete`
 * is what tells the two apart: its presence means this idea already exists,
 * which is what flips the heading to "Edit idea" and offers Delete here,
 * the same way FunFactsModal treats an existing fun fact.
 */
export class QuickIdeaModal extends FormModal {
	private category: IdeaCategory;
	/**
	 * Whether this idea still carries the "added by Claude" flag. Only ever
	 * starts true when editing one that already has it — a freshly captured
	 * idea is never generated. Cleared here is local until Save; the badge
	 * disappearing is the confirmation, the same way a category swap only
	 * shows as selected until it's actually written.
	 */
	private generated: boolean;

	constructor(
		app: App,
		private contactName: string,
		initialCategory: IdeaCategory,
		private onSubmit: (
			category: IdeaCategory,
			text: string,
			generated: boolean
		) => Promise<void>,
		private initialText = "",
		private onDelete?: () => Promise<void>,
		initialGenerated = false
	) {
		super(app);
		this.category = initialCategory;
		this.generated = initialGenerated;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.onDelete ? "Edit idea" : `Idea for ${this.contactName}`,
		});

		// Category picker: one row of emoji buttons
		const categoryRow = contentEl.createDiv({
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
				// Editing opens unfocused, so don't pull the keyboard up
				// just for re-filing the idea.
				if (!this.onDelete) textInput.focus();
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
		textInput.value = this.initialText;

		// Only ever present on an idea that already carries the flag, and
		// gone the moment it's removed — there's nothing left here to
		// re-add it from, which is deliberate: the badge is provenance,
		// not a setting to flip back on.
		const badgeHost = contentEl.createDiv({ cls: "quick-idea-badge" });
		const renderBadge = () => {
			badgeHost.empty();
			appendGeneratedBadge(badgeHost, this.generated, () => {
				this.generated = false;
				renderBadge();
			});
		};
		renderBadge();

		const buttonContainer = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});

		// Only offered once there's something to delete — the same
		// onDelete-gated pattern FunFactsModal uses.
		if (this.onDelete) {
			const deleteButton = buttonContainer.createEl("button", {
				text: "Delete",
				cls: "callander-modal-button callander-modal-button-danger",
			});
			deleteButton.addEventListener("click", () => {
				confirmThenClose(this, {
					title: "Delete idea",
					message: `Delete "${this.initialText}"?`,
					onConfirm: async () => {
						await this.onDelete!();
					},
				});
			});
		}

		const saveButton = buttonContainer.createEl("button", {
			text: "Save",
			cls: "callander-modal-button mod-cta",
		});

		const submit = guardedAction(
			async () => {
				const text = textInput.value.trim();
				if (!text) return;
				await this.onSubmit(this.category, text, this.generated);
				this.close();
			},
			{ buttons: [saveButton] }
		);

		saveButton.addEventListener("click", () => void submit());
		textInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void submit();
			}
		});

		// A new idea wants typing straight away; an edit is as likely to be
		// a category change, so it opens unfocused (onDelete marks an edit).
		if (this.onDelete) this.blurInitialFocus();
		else window.setTimeout(() => textInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
