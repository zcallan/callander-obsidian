import { App, Setting } from "obsidian";
import { FormModal } from "@/modals/FormModal";
interface DiaryEntryModalValues {
	title: string;
	date: string;
}

export class DiaryEntryModal extends FormModal {
	private values: DiaryEntryModalValues;

	constructor(
		app: App,
		existing: DiaryEntryModalValues | null,
		private onSubmit: (title: string, date: string) => Promise<void>
	) {
		super(app);
		this.values = existing
			? { ...existing }
			: {
					title: "",
					date: new Date().toISOString().split("T")[0],
			  };
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.values.title ? "Edit diary entry" : "New diary entry",
		});

		let titleInput: HTMLInputElement;

		new Setting(contentEl).setName("Title").addText((text) => {
			titleInput = text.inputEl;
			text.setValue(this.values.title)
				.setPlaceholder("What is this entry about?")
				.onChange((value) => {
					this.values.title = value;
				});
			text.inputEl.addClass("diary-modal-title-input");
		});

		new Setting(contentEl)
			.setName("Date")
			.setDesc("The date this entry is about (not when you wrote it)")
			.addText((text) => {
				text.inputEl.type = "date";
				text.setValue(this.values.date).onChange((value) => {
					this.values.date = value;
				});
			});

		const buttonContainer = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
			cls: "callander-modal-button",
		});
		cancelButton.addEventListener("click", () => this.close());

		const saveButton = buttonContainer.createEl("button", {
			text: "Save",
			cls: "callander-modal-button mod-cta",
		});
		saveButton.addEventListener("click", () => void this.submit());

		// Ten-second capture: Enter in the title field submits
		titleInput!.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void this.submit();
			}
		});
		window.setTimeout(() => titleInput!.focus(), 0);
	}

	private async submit() {
		const title = this.values.title.trim();
		const date = this.values.date;
		if (!title || !date) return;
		await this.onSubmit(title, date);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}
