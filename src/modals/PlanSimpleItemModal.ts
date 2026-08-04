import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type { AccommodationType, BookingState, TravelType } from "@/constants";
import { ACCOMMODATION_TYPES, BOOKING_STATES } from "@/constants";
import { ConfirmModal } from "@/modals/ConfirmModal";
import {
	appendPeopleField,
	appendScheduleFields,
	PeopleFieldHandle,
	ScheduleFieldOptions,
} from "@/modals/scheduleFields";
import { stayRange } from "@/utils/planFormat";

export interface PlanSimpleItemValue {
	text: string;
	type?: TravelType;
	stay?: AccommodationType;
	date?: string;
	time?: string;
	people?: string;
	duration?: string;
	nights?: number;
	address?: string;
	booked?: BookingState;
	notes?: string;
	cost?: number;
}

interface TravelTypeOption {
	id: TravelType;
	label: string;
	emoji: string;
}

const MAX_NIGHTS = 60;

/**
 * Add/edit a flat plan item (travel leg, accommodation): an optional transport
 * type, a date + time, who's along, a detail line, a free-text duration,
 * booking status and a cost. Pass `types` to show the transport-type picker
 * (travel only) and `schedule` to show the Date / Time / People fields (travel
 * & accommodation). New travel legs default to the first type (Car).
 *
 * With `stay` set, it becomes the accommodation form instead: a kind-of-stay
 * picker, a nights stepper (never summons the keyboard), an address and notes —
 * and no Time, since a stay always closes out its day.
 */
export class PlanSimpleItemModal extends FormModal {
	private type?: TravelType;
	private stayType?: AccommodationType;
	private booked?: BookingState;
	private nights: number;

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
		private onDelete?: () => Promise<void>,
		private scheduleOptions: ScheduleFieldOptions = {},
		private stay = false
	) {
		super(app);
		// New legs default to the first type (Car); editing keeps what's set.
		// Stays start untyped — the 🛏️ fallback covers "just somewhere".
		this.type = initial ? initial.type : this.types?.[0]?.id;
		this.stayType = initial?.stay;
		this.booked = initial?.booked;
		// Stays predate `nights` — seed from a legacy free-text duration
		// ("3 nights") so editing one doesn't quietly reset it to 1.
		const legacyNights = Number(
			initial?.duration?.trim().match(/^(\d+)\s*night/i)?.[1]
		);
		this.nights = Math.min(
			MAX_NIGHTS,
			Math.max(
				1,
				Math.round(
					initial?.nights ??
						(Number.isFinite(legacyNights) ? legacyNights : 1)
				)
			)
		);
	}

	/** One row of emoji chips; re-tapping the selected one clears it. */
	private renderChips<T extends string>(
		parent: HTMLElement,
		label: string,
		options: readonly { id: T; label: string; emoji: string }[],
		selected: () => T | undefined,
		onPick: (id: T | undefined) => void
	) {
		parent.createDiv({ cls: "modal-section-label", text: label });
		const row = parent.createDiv({ cls: "quick-idea-categories" });
		const buttons = new Map<T, HTMLButtonElement>();
		options.forEach((o) => {
			const button = row.createEl("button", {
				cls: `quick-idea-category-button ${
					selected() === o.id ? "selected" : ""
				}`,
			});
			button.createSpan({
				cls: "quick-idea-category-emoji",
				text: o.emoji,
			});
			button.createSpan({ text: o.label });
			button.addEventListener("click", () => {
				onPick(selected() === o.id ? undefined : o.id);
				buttons.forEach((el, id) =>
					el.toggleClass("selected", id === selected())
				);
			});
			buttons.set(o.id, button);
		});
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: this.title });

		const renderTextField = () => {
			contentEl.createDiv({
				cls: "modal-section-label",
				text: this.stay ? "Where" : "Detail",
			});
			const input = contentEl.createEl("input", {
				cls: "quick-idea-input",
				attr: { type: "text", placeholder: this.placeholders.text },
			});
			input.value = this.initial?.text ?? "";
			return input;
		};

		// A stay leads with where you're staying — the one thing you always
		// know first. Travel keeps its detail line below the type and dates.
		let textInput!: HTMLInputElement;
		if (this.stay) textInput = renderTextField();

		// Transport-type picker (travel only). Optional — tap again to clear.
		if (this.types) {
			this.renderChips(
				contentEl,
				"Type",
				this.types,
				() => this.type,
				(id) => {
					this.type = id;
				}
			);
		}

		// Kind of stay (accommodation only) — the emoji becomes its timeline icon.
		if (this.stay) {
			this.renderChips(
				contentEl,
				"Type",
				ACCOMMODATION_TYPES,
				() => this.stayType,
				(id) => {
					this.stayType = id;
				}
			);
		}

		// Nights shows the span live, so the stepper answers "how long?" and
		// "until when?" at once. Needs the check-in date, which the schedule
		// fields own — hence the deferred handle.
		let nightsValueEl: HTMLElement | null = null;
		let nightsUntilEl: HTMLElement | null = null;
		let nightsPlusBtn: HTMLButtonElement | null = null;
		let schedule: ReturnType<typeof appendScheduleFields> | null = null;

		/**
		 * A stay can't check out after the plan ends, so the ceiling is the
		 * nights between check-in and the plan's last day. Only applies when
		 * the plan has an exact end date.
		 */
		const maxNights = (): number => {
			const lastDay = this.scheduleOptions.lastDay;
			const date = schedule?.values().date;
			if (!lastDay || !date) return MAX_NIGHTS;
			const from = new Date(`${date}T00:00:00`);
			const to = new Date(`${lastDay}T00:00:00`);
			if (isNaN(from.getTime()) || isNaN(to.getTime())) return MAX_NIGHTS;
			const span = Math.round(
				(to.getTime() - from.getTime()) / 86400000
			);
			return Math.max(1, Math.min(MAX_NIGHTS, span));
		};

		// Single path for clamping, the label and the "+" state, so changing
		// the date can't leave a stay running past the end of the plan.
		const applyNights = (next: number) => {
			const ceiling = maxNights();
			this.nights = Math.min(ceiling, Math.max(1, next));
			nightsValueEl?.setText(String(this.nights));
			if (nightsPlusBtn) {
				nightsPlusBtn.disabled = this.nights >= ceiling;
			}
			if (nightsUntilEl) {
				const date = schedule?.values().date;
				const range = date ? stayRange(date, this.nights) : null;
				nightsUntilEl.setText(range ? `(${range})` : "");
			}
		};

		// Date / Time / People — real pickers so legs sort chronologically
		// (travel & accommodation). Shared with the idea modal.
		schedule = this.schedule
			? appendScheduleFields(
					contentEl,
					{
						date: this.initial?.date,
						time: this.initial?.time,
						people: this.initial?.people,
					},
					{
						...this.scheduleOptions,
						hideTime: this.stay,
						hidePeople: this.stay,
						onDateChange: () => applyNights(this.nights),
					}
			  )
			: null;

		// Nights — a stepper, so entering "2" never opens the keyboard.
		if (this.stay) {
			contentEl.createDiv({
				cls: "modal-section-label",
				text: "Nights",
			});
			const stepper = contentEl.createDiv({ cls: "plan-nights-stepper" });
			const step = (delta: number, label: string) => {
				const btn = stepper.createEl("button", {
					cls: "plan-nights-step",
					text: delta < 0 ? "−" : "+",
					attr: { type: "button", "aria-label": label },
				});
				btn.addEventListener("click", () =>
					applyNights(this.nights + delta)
				);
				return btn;
			};
			step(-1, "One fewer night");
			nightsValueEl = stepper.createSpan({
				cls: "plan-nights-value",
				text: String(this.nights),
			});
			nightsPlusBtn = step(1, "One more night");
			stepper.createSpan({
				cls: "plan-nights-suffix",
				text: "nights",
			});
			nightsUntilEl = stepper.createSpan({
				cls: "plan-nights-until",
			});
			applyNights(this.nights);
		}

		if (!this.stay) textInput = renderTextField();

		// A flight or a train needs chasing just like a hotel does, so booking
		// belongs to both kinds — placed straight after the length of the thing
		// (nights for a stay, duration for a leg) in each.
		const renderBooking = () =>
			this.renderChips(
				contentEl,
				"Booking",
				BOOKING_STATES,
				() => this.booked,
				(id) => {
					this.booked = id;
				}
			);

		// Free-text duration is a travel thing ("2h flight"); stays use nights.
		let durationInput: HTMLInputElement | null = null;
		if (!this.stay) {
			contentEl.createDiv({
				cls: "modal-section-label",
				text: "Duration (optional)",
			});
			durationInput = contentEl.createEl("input", {
				cls: "quick-idea-input",
				attr: { type: "text", placeholder: this.placeholders.duration },
			});
			durationInput.value = this.initial?.duration ?? "";
			renderBooking();
		}

		// Address is accommodation-only; notes follow below for both kinds.
		let addressInput: HTMLInputElement | null = null;
		let notesInput: HTMLTextAreaElement | null = null;
		let people: PeopleFieldHandle | null = null;
		if (this.stay) {
			renderBooking();

			// Who's staying reads better after the booking status than up
			// among the dates, so a stay places it here itself.
			people = appendPeopleField(
				contentEl,
				this.initial?.people,
				this.scheduleOptions.people
			);

			contentEl.createDiv({
				cls: "modal-section-label",
				text: "Address (optional)",
			});
			const addressRow = contentEl.createDiv({ cls: "event-link-row" });
			addressInput = addressRow.createEl("input", {
				cls: "quick-idea-input",
				attr: { type: "text", placeholder: "e.g. 12 Bay St, Portland" },
			});
			addressInput.value = this.initial?.address ?? "";
			const mapButton = addressRow.createEl("button", {
				cls: "callander-button event-link-open",
				text: "Map",
				attr: { type: "button" },
			});
			mapButton.addEventListener("click", () => {
				const query = addressInput?.value.trim();
				if (!query) return;
				window.open(
					`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
						query
					)}`,
					"_blank"
				);
			});

		}

		// Notes apply to a leg as much as a stay — a confirmation number is
		// worth keeping on a flight too, so this sits outside the stay block.
		contentEl.createDiv({
			cls: "modal-section-label",
			text: "Notes (optional)",
		});
		notesInput = contentEl.createEl("textarea", {
			cls: "quick-idea-input plan-notes-input",
			attr: {
				rows: "2",
				placeholder: this.stay
					? "e.g. Check in 4pm, check out 10am"
					: "e.g. Confirmation ABC123, seat 14A",
			},
		});
		notesInput.value = this.initial?.notes ?? "";

		contentEl.createDiv({
			cls: "modal-section-label",
			text: this.stay
				? "Cost for the whole stay (blank if unknown)"
				: "Cost (0 = free, blank if unknown)",
		});
		const costWrap = contentEl.createDiv({
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

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});

		// Delete lives here so it's reachable on mobile, where the item is
		// edited by tapping the row (no inline hover actions to reach).
		if (this.initial && this.onDelete) {
			const deleteButton = buttons.createEl("button", {
				text: "Delete",
				cls: "callander-modal-button callander-modal-button-danger",
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
			cls: "callander-modal-button mod-cta",
		});
		const submit = async () => {
			const text = textInput.value.trim();
			if (!text) return;
			const duration = durationInput?.value.trim() ?? "";
			const address = addressInput?.value.trim() ?? "";
			const notes = notesInput?.value.trim() ?? "";
			// Blank stays unknown; an explicit 0 is kept as "free".
			const costStr = costInput.value.trim();
			const costNum = Number(costStr);
			const cost =
				costStr !== "" && Number.isFinite(costNum) && costNum >= 0
					? costNum
					: undefined;
			await this.onSubmit({
				text,
				...(this.type && !this.stay && { type: this.type }),
				...(this.stay && this.stayType && { stay: this.stayType }),
				...(schedule?.values() ?? {}),
				...(people?.value() && { people: people.value() }),
				...(duration && { duration }),
				...(this.stay && { nights: this.nights }),
				...(address && { address }),
				...(this.booked && { booked: this.booked }),
				...(notes && { notes }),
				...(cost !== undefined && { cost }),
			});
			this.close();
		};
		saveButton.addEventListener("click", () => void submit());
		const inputs: HTMLElement[] = [textInput, costInput];
		if (durationInput) inputs.push(durationInput);
		if (addressInput) inputs.push(addressInput);
		if (people?.input) inputs.push(people.input);
		if (schedule) inputs.push(...schedule.inputs);
		for (const input of inputs) {
			input.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					void submit();
				}
			});
		}
		window.setTimeout(() => textInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
