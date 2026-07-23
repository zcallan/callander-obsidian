import { App, Modal } from "obsidian";
import type { FriendEvent } from "@/types";
import { createFlexDateInput } from "@/components/FlexDateInput";

export class EventModal extends Modal {
	private event: FriendEvent | null;
	private onSubmit: (date: string, text: string) => void;

	constructor(
		app: App,
		event: FriendEvent | null,
		onSubmit: (date: string, text: string) => void
	) {
		super(app);
		this.event = event;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", {
			text: this.event ? "Edit event" : "Add event",
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
		const saveButton = buttonContainer.createEl("button", {
			text: this.event ? "Save changes" : "Add event",
			cls: "friend-tracker-modal-button mod-cta",
		});

		const submit = () => {
			const text = textInput.value.trim();
			if (!text || !dateValue) return;
			this.onSubmit(dateValue, text);
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
