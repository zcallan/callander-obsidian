import { App, Modal } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type { TravelType } from "@/constants";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { appendScheduleFields } from "@/modals/scheduleFields";

export interface PlanSimpleItemValue {
	text: string;
	type?: TravelType;
	date?: string;
	time?: string;
	people?: string;
	duration?: string;
	cost?: number;
}

interface TravelTypeOption {
	id: TravelType;
	label: string;
	emoji: string;
}

/**
 * Add/edit a flat plan item (travel leg, accommodation): an optional transport
 * type, a date + time, who's along, a detail line, a free-text duration, and a
 * cost. Pass `types` to show the transport-type picker (travel only) and
 * `schedule` to show the Date / Time / People fields (travel & accommodation).
 * New travel legs default to the first type (Car).
 */
export class PlanSimpleItemModal extends FormModal {
	private type?: TravelType;

	constructor(
		app: App,
		private title: string,
		private initial: PlanSimpleItemValue | null,
		private onSubmit: (value: PlanSimpleItemValue) => Promise<void>,
		private placeholders: {
			text: string;
			duration: string;
		} = {
			text: "Add a detail…",
			duration: "Duration (optional)",
		},
		private types: readonly TravelTypeOption[] | null = null,
		private schedule = false,
		private onDelete?: () => Promise<void>
	) {
		super(app);
		// New legs default to the first type (Car); editing keeps what's set.
		this.type = initial ? initial.type : this.types?.[0]?.id;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: this.title });

		// Transport-type picker (travel only). Optional — tap again to clear.
		if (this.types) {
			contentEl.createEl("div", {
				cls: "modal-section-label",
				text: "Type",
			});
			const typeRow = contentEl.createEl("div", {
				cls: "quick-idea-categories",
			});
			const typeButtons = new Map<TravelType, HTMLButtonElement>();
			this.types.forEach((t) => {
				const button = typeRow.createEl("button", {
					cls: `quick-idea-category-button ${
						this.type === t.id ? "selected" : ""
					}`,
				});
				button.createSpan({
					cls: "quick-idea-category-emoji",
					text: t.emoji,
				});
				button.createSpan({ text: t.label });
				button.addEventListener("click", () => {
					// Toggle: re-tapping the selected type clears it.
					this.type = this.type === t.id ? undefined : t.id;
					typeButtons.forEach((el, id) =>
						el.toggleClass("selected", id === this.type)
					);
				});
				typeButtons.set(t.id, button);
			});
		}

		// Date / Time / People — real pickers so legs sort chronologically
		// (travel & accommodation). Shared with the idea modal.
		const schedule = this.schedule
			? appendScheduleFields(contentEl, {
					date: this.initial?.date,
					time: this.initial?.time,
					people: this.initial?.people,
			  })
			: null;

		contentEl.createEl("div", {
			cls: "modal-section-label",
			text: "Detail",
		});
		const textInput = contentEl.createEl("input", {
			cls: "quick-idea-input",
			attr: { type: "text", placeholder: this.placeholders.text },
		});
		textInput.value = this.initial?.text ?? "";

		contentEl.createEl("div", {
			cls: "modal-section-label",
			text: "Duration (optional)",
		});
		const durationInput = contentEl.createEl("input", {
			cls: "quick-idea-input",
			attr: { type: "text", placeholder: this.placeholders.duration },
		});
		durationInput.value = this.initial?.duration ?? "";

		contentEl.createEl("div", {
			cls: "modal-section-label",
			text: "Cost (0 = free, blank if unknown)",
		});
		const costWrap = contentEl.createEl("div", {
			cls: "plan-cost-input-wrap",
		});
		costWrap.createSpan({ cls: "plan-cost-input-prefix", text: "$" });
		const costInput = costWrap.createEl("input", {
			cls: "quick-idea-input plan-cost-input",
			attr: {
				type: "number",
				min: "0",
				inputmode: "decimal",
				placeholder: "0 = free",
			},
		});
		// Distinguish an explicit 0 (free) from blank (unknown) — 0 is falsy.
		if (this.initial?.cost !== undefined) {
			costInput.value = String(this.initial.cost);
		}

		const buttons = contentEl.createEl("div", {
			cls: "friend-tracker-modal-buttons",
		});

		// Delete lives here so it's reachable on mobile, where the item is
		// edited by tapping the row (no inline hover actions to reach).
		if (this.initial && this.onDelete) {
			const deleteButton = buttons.createEl("button", {
				text: "Delete",
				cls: "friend-tracker-modal-button friend-tracker-modal-button-danger",
			});
			deleteButton.addEventListener("click", () => {
				const preview =
					this.initial!.text.length > 80
						? this.initial!.text.slice(0, 80) + "…"
						: this.initial!.text;
				new ConfirmModal(
					this.app,
					"Delete item",
					`Delete "${preview}"?`,
					"Delete",
					async () => {
						await this.onDelete!();
						this.close();
					}
				).open();
			});
		}

		const saveButton = buttons.createEl("button", {
			text: this.initial ? "Save" : "Add",
			cls: "friend-tracker-modal-button mod-cta",
		});
		const submit = async () => {
			const text = textInput.value.trim();
			if (!text) return;
			const duration = durationInput.value.trim();
			// Blank stays unknown; an explicit 0 is kept as "free".
			const costStr = costInput.value.trim();
			const costNum = Number(costStr);
			const cost =
				costStr !== "" && Number.isFinite(costNum) && costNum >= 0
					? costNum
					: undefined;
			await this.onSubmit({
				text,
				...(this.type && { type: this.type }),
				...(schedule?.values() ?? {}),
				...(duration && { duration }),
				...(cost !== undefined && { cost }),
			});
			this.close();
		};
		saveButton.addEventListener("click", submit);
		const inputs: HTMLElement[] = [textInput, durationInput, costInput];
		if (schedule) inputs.push(...schedule.inputs);
		for (const input of inputs) {
			input.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					submit();
				}
			});
		}
		setTimeout(() => textInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
