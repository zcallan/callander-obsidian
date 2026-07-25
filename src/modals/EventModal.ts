import { App, Modal } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type { FriendEvent } from "@/types";
import { EVENT_TYPES, EventType } from "@/constants";
import { createFlexDateInput } from "@/components/FlexDateInput";
import { ConfirmModal } from "@/modals/ConfirmModal";

export class EventModal extends FormModal {
	private event: FriendEvent | null;
	private type: EventType;
	private onSubmit: (date: string, text: string, type: EventType) => void;

	constructor(
		app: App,
		event: FriendEvent | null,
		onSubmit: (date: string, text: string, type: EventType) => void,
		private onDelete?: () => Promise<void>,
		private onCopy?: () => void
	) {
		super(app);
		this.event = event;
		this.type =
			event?.type && EVENT_TYPES.some((t) => t.id === event.type)
				? event.type
				: "hangout";
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", {
			text: this.event ? "Edit event" : "Add event",
		});

		// Type picker: one row of emoji buttons, hangout is the default
		const typeRow = contentEl.createEl("div", {
			cls: "quick-idea-categories",
		});
		const typeButtons = new Map<EventType, HTMLButtonElement>();
		EVENT_TYPES.forEach((t) => {
			const button = typeRow.createEl("button", {
				cls: `quick-idea-category-button ${
					this.type === t.id ? "selected" : ""
				}`,
				attr: { "aria-label": t.label },
			});
			button.createSpan({
				cls: "quick-idea-category-emoji",
				text: t.emoji,
			});
			button.createSpan({ text: t.label });
			button.addEventListener("click", () => {
				this.type = t.id;
				typeButtons.forEach((el, id) =>
					el.toggleClass("selected", id === t.id)
				);
			});
			typeButtons.set(t.id, button);
		});

		// Date, as precisely as you remember it ("May 2026" is fine)
		let dateValue =
			this.event?.date || new Date().toISOString().split("T")[0];
		const dateField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		dateField.createEl("label", { text: "When" });
		createFlexDateInput(
			dateField,
			dateValue,
			(value) => {
				dateValue = value;
			},
			{
				inputClass: "friend-tracker-modal-input",
				defaultPrecision: "day",
			}
		);

		const textInput = contentEl.createEl("textarea", {
			attr: {
				placeholder:
					"What happened? A meetup, a life event of theirs, a memorable outing...",
			},
			cls: "contact-event-text-input",
		});
		textInput.value = this.event?.text || "";

		const buttonContainer = contentEl.createEl("div", {
			cls: "friend-tracker-modal-buttons",
		});

		if (this.event && this.onDelete) {
			const deleteButton = buttonContainer.createEl("button", {
				text: "Delete",
				cls: "friend-tracker-modal-button friend-tracker-modal-button-danger",
			});
			deleteButton.addEventListener("click", () => {
				const preview =
					this.event!.text.length > 80
						? this.event!.text.slice(0, 80) + "…"
						: this.event!.text;
				new ConfirmModal(
					this.app,
					"Delete event",
					`Delete "${preview}" from the timeline?`,
					"Delete",
					async () => {
						await this.onDelete!();
						this.close();
					}
				).open();
			});
		}

		if (this.event && this.onCopy) {
			const copyButton = buttonContainer.createEl("button", {
				text: "Copy to…",
				cls: "friend-tracker-modal-button",
			});
			copyButton.addEventListener("click", () => {
				this.onCopy!();
				this.close();
			});
		}

		const saveButton = buttonContainer.createEl("button", {
			text: this.event ? "Save changes" : "Add event",
			cls: "friend-tracker-modal-button mod-cta",
		});

		const submit = () => {
			const text = textInput.value.trim();
			if (!text || !dateValue) return;
			this.onSubmit(dateValue, text, this.type);
			this.close();
		};

		saveButton.addEventListener("click", submit);
		textInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
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
