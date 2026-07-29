import { App, Modal } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type { FriendEvent } from "@/types";
import { EVENT_TYPES, EventType } from "@/constants";
import { createFlexDateInput } from "@/components/FlexDateInput";
import { ConfirmModal } from "@/modals/ConfirmModal";

export class EventModal extends FormModal {
	private event: FriendEvent | null;
	private type: EventType;
	private onSubmit: (
		date: string,
		text: string,
		type: EventType,
		location: string,
		link: string
	) => void;

	constructor(
		app: App,
		event: FriendEvent | null,
		onSubmit: (
			date: string,
			text: string,
			type: EventType,
			location: string,
			link: string
		) => void,
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
		const typeRow = contentEl.createDiv({
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
		const dateField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		dateField.createEl("label", { text: "When" });
		createFlexDateInput(
			dateField,
			dateValue,
			(value) => {
				dateValue = value;
			},
			{
				inputClass: "callander-modal-input",
				defaultPrecision: "day",
				allowFuture: true,
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

		const locationField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		locationField.createEl("label", { text: "Location (optional)" });
		const locationInput = locationField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text", placeholder: "e.g. Providence, RI" },
		});
		locationInput.value = this.event?.location || "";

		// Link — a plain URL with an Open button to the right
		const linkField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		linkField.createEl("label", { text: "Link (optional)" });
		const linkRow = linkField.createDiv({ cls: "event-link-row" });
		const linkInput = linkRow.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text", placeholder: "https://…" },
		});
		linkInput.value = this.event?.link || "";
		const openButton = linkRow.createEl("button", {
			cls: "callander-button event-link-open",
			text: "Open",
			attr: { type: "button" },
		});
		openButton.addEventListener("click", () => {
			const raw = linkInput.value.trim();
			if (!raw) return;
			const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
				? raw
				: `https://${raw}`;
			window.open(url, "_blank");
		});

		const buttonContainer = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});

		if (this.event && this.onDelete) {
			const deleteButton = buttonContainer.createEl("button", {
				text: "Delete",
				cls: "callander-modal-button callander-modal-button-danger",
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
				cls: "callander-modal-button",
			});
			copyButton.addEventListener("click", () => {
				this.onCopy!();
				this.close();
			});
		}

		const saveButton = buttonContainer.createEl("button", {
			text: this.event ? "Save changes" : "Add event",
			cls: "callander-modal-button mod-cta",
		});

		const submit = () => {
			const text = textInput.value.trim();
			if (!text || !dateValue) return;
			this.onSubmit(
				dateValue,
				text,
				this.type,
				locationInput.value.trim(),
				linkInput.value.trim()
			);
			this.close();
		};

		saveButton.addEventListener("click", submit);
		const onKeydown = (event: KeyboardEvent) => {
			if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				submit();
			}
		};
		textInput.addEventListener("keydown", onKeydown);
		locationInput.addEventListener("keydown", onKeydown);

		window.setTimeout(() => textInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
