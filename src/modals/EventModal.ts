import { App, setIcon } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { CopyEventModal } from "@/modals/CopyEventModal";
import { createFlexDateInput } from "@/components/FlexDateInput";
import { appendContactPicker } from "@/components/ContactPicker";
import {
	appendClockField,
	appendDurationField,
} from "@/modals/scheduleFields";
import { normalizeUrl } from "@/utils/url";
import type FriendTracker from "@/main";
import type { EventInfo } from "@/types";
import type { EventFields } from "@/services/EventOperations";
import { EVENT_TYPES } from "@/constants";
import type { EventType } from "@/constants";

/**
 * Create or edit an event — anything on the calendar, past or future: a
 * hangout that happened, a booking coming up, a person-less task. People
 * are optional; whoever is attached gets it on their timeline.
 */
export class EventModal extends FormModal {
	private type: EventType | "";
	/**
	 * Whether to offer the "also show on the dashboard" tick.
	 *
	 * Only a caller that seeds a variant is somewhere the answer is a real
	 * question — in practice a person's page, where an event is usually a
	 * record of them but sometimes a plan with them. Everywhere else the
	 * surface you started from already answers it. Never on an edit: the
	 * view modal's Hide button owns that, and a tick defaulted here would
	 * quietly un-hide something.
	 */
	private readonly askVisibility: boolean;

	constructor(
		app: App,
		private plugin: FriendTracker,
		private existing: EventInfo | null,
		private onChange: () => void | Promise<void>,
		/** Starting values for a NEW event — e.g. seeded from a Someday or
		 * a person's page. Nothing is written until Save. */
		private prefill?: Partial<EventFields>,
		/**
		 * People who can't be removed here — the person whose page this was
		 * opened from. Taking them off would contradict where you are, and
		 * leave the event with nowhere to land.
		 */
		private lockedPeople: string[] = [],
		/**
		 * Opened from a person's own page — either adding or editing an
		 * event on their timeline, rather than from the Dashboard or the
		 * Events list.
		 *
		 * On their page, "does this show on their timeline?" isn't a real
		 * question — it's why the event is being touched here at all. So
		 * this suppresses the friend-timelines tick entirely rather than
		 * defaulting it, and every person on the event (this one, and
		 * anyone added afterward) gets it on their own timeline the same
		 * way. Distinct from `askVisibility`, which is about the dashboard
		 * question and only ever applies to a brand-new event.
		 */
		private readonly fromPersonPage: boolean = false
	) {
		super(app);
		this.type = existing?.type ?? prefill?.type ?? "hangout";
		this.askVisibility = !existing && prefill?.variant !== undefined;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.existing ? "Edit event" : "Add event",
		});

		// For the People picker — fetched up front like the Someday modal.
		const contacts = await this.plugin.contactOperations.getContacts();

		// ---- Name ----
		const nameField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		nameField.createEl("label", { text: "Event" });
		const nameInput = nameField.createEl("input", {
			cls: "callander-modal-input",
			attr: {
				type: "text",
				placeholder: "e.g. Dinner at the night market",
			},
		});
		nameInput.value = this.existing?.name ?? this.prefill?.name ?? "";

		// ---- Type: emoji chips, hangout is the default ----
		const typeRow = contentEl.createDiv({
			cls: "quick-idea-categories",
		});
		const typeButtons = new Map<EventType, HTMLButtonElement>();
		EVENT_TYPES.forEach((t) => {
			const button = typeRow.createEl("button", {
				cls: `quick-idea-category-button ${
					this.type === t.id ? "selected" : ""
				}`,
				attr: { type: "button", "aria-label": t.label },
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

		// ---- When ----
		let dateValue = this.existing?.date ?? this.prefill?.date ?? "";
		const dateField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		dateField.createEl("label", { text: "When (optional)" });
		createFlexDateInput(
			dateField,
			dateValue,
			(v) => {
				dateValue = v;
			},
			{
				inputClass: "callander-modal-input",
				defaultPrecision: "day",
				allowFuture: true,
			}
		);

		// ---- Time ----
		const timeField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		const time = appendClockField(
			timeField,
			this.existing?.time ?? this.prefill?.time
		);

		// ---- Duration ----
		// Directly under the time it starts: the two answer one question
		// between them, and "Add to calendar" needs both to know when the
		// event ends.
		const durationField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		const duration = appendDurationField(
			durationField,
			this.existing?.duration ?? this.prefill?.duration,
			"Duration (optional)"
		);

		// ---- People ----
		const peopleField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		peopleField.createEl("label", { text: "People (optional)" });
		// Declared before the picker so its onChange can reach them; the
		// tick below is built straight after and wired in.
		let syncTimelineBox: () => void = () => undefined;
		const people = appendContactPicker(
			peopleField,
			this.app,
			contacts,
			this.existing?.people ?? this.prefill?.people ?? [],
			this.existing?.file.path ?? "",
			{
				locked: this.lockedPeople,
				onChange: () => syncTimelineBox(),
			}
		);

		// ---- Where it shows ----
		// Two different things share this note shape: a calendar entry of
		// your own, and a record of someone you keep on their page. Which
		// question gets asked depends on where you started, since that's
		// what's already been answered.
		//
		// Sits above the details accordion: it changes where the event
		// turns up, which is a bigger decision than a location or a note.
		let showBox: HTMLInputElement | null = null;
		let timelineBox: HTMLInputElement | null = null;
		if (this.askVisibility) {
			// From a person's page — it's already on their timeline, so the
			// open question is whether it's also your own calendar entry.
			const showField = contentEl.createDiv({
				cls: "callander-modal-field",
			});
			const showLabel = showField.createEl("label", {
				cls: "event-show-check",
			});
			showBox = showLabel.createEl("input", {
				attr: { type: "checkbox" },
			});
			showBox.checked = this.prefill?.variant === "reminder";
			showLabel.createSpan({
				text: "Add to upcoming events on Dashboard?",
			});
		} else if (!this.fromPersonPage) {
			// From your own calendar — it shows there by definition, so the
			// open question is whether anyone named on it sees it too.
			const timelineField = contentEl.createDiv({
				cls: "callander-modal-field",
			});
			const timelineLabel = timelineField.createEl("label", {
				cls: "event-show-check",
			});
			timelineBox = timelineLabel.createEl("input", {
				attr: { type: "checkbox" },
			});
			timelineLabel.createSpan({ text: "Show on their timelines?" });
			const box = timelineBox;
			// Meaningless with nobody on the event — and it must fall back
			// to unchecked when the last person goes, or a hidden tick would
			// silently apply again the moment someone was re-added.
			syncTimelineBox = () => {
				const anyone = people.wikilinks().length > 0;
				box.disabled = !anyone;
				if (!anyone) box.checked = false;
				timelineLabel.toggleClass("is-disabled", !anyone);
			};
			// An edit keeps what it had; a new one starts off until asked for.
			box.checked =
				!!this.existing && this.existing.showOnTimelines !== false;
			syncTimelineBox();
		}

		// ---- Additional details: description, location, link — collapsed
		// by default so the form leads with what/type/when/who. Reuses the
		// same accordion mechanics as the Someday modal (.plan-accordion),
		// without their persisted collapsed state: a modal opens fresh
		// every time, so there's nothing to remember between opens.
		const detailsWrap = contentEl.createDiv({
			cls: "callander-modal-field plan-accordion callander-modal-accordion",
		});
		const detailsHeader = detailsWrap.createDiv({
			cls: "plan-accordion-header callander-modal-accordion-header",
		});
		detailsHeader.createSpan({ text: "Additional details" });
		setIcon(
			detailsHeader.createSpan({ cls: "plan-accordion-chevron" }),
			"chevron-down"
		);
		const detailsBody = detailsWrap.createDiv({
			cls: "plan-accordion-body",
		});
		detailsHeader.addEventListener("click", () => {
			detailsWrap.toggleClass("is-open", !detailsWrap.hasClass("is-open"));
		});
		// An edit that already has any of these opens showing them —
		// otherwise saved detail would be hidden behind a closed lid.
		const hasDetails = !!(
			this.existing?.description ||
			this.existing?.location ||
			this.existing?.link
		);
		detailsWrap.toggleClass("is-open", hasDetails);

		// ---- Location ----
		const locField = detailsBody.createDiv({
			cls: "callander-modal-field",
		});
		locField.createEl("label", { text: "Location (optional)" });
		const locInput = locField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text", placeholder: "e.g. The Fox & Hounds" },
		});
		locInput.value = this.existing?.location ?? this.prefill?.location ?? "";

		// ---- Link ----
		const linkField = detailsBody.createDiv({
			cls: "callander-modal-field",
		});
		linkField.createEl("label", { text: "Link (optional)" });
		const linkRow = linkField.createDiv({ cls: "event-link-row" });
		const linkInput = linkRow.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text", placeholder: "https://…" },
		});
		linkInput.value = this.existing?.link ?? this.prefill?.link ?? "";
		const openButton = linkRow.createEl("button", {
			cls: "callander-button event-link-open",
			text: "Open",
			attr: { type: "button" },
		});
		openButton.addEventListener("click", () => {
			const raw = linkInput.value.trim();
			if (!raw) return;
			window.open(normalizeUrl(raw), "_blank");
		});

		// ---- Notes ----
		const descField = detailsBody.createDiv({
			cls: "callander-modal-field",
		});
		descField.createEl("label", { text: "Notes (optional)" });
		const descInput = descField.createEl("textarea", {
			cls: "contact-event-text-input",
			attr: {
				placeholder:
					"Any details worth keeping — how it went, who else was there...",
			},
		});
		descInput.value =
			this.existing?.description ?? this.prefill?.description ?? "";

		// ---- Buttons ----
		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		if (this.existing) {
			const existing = this.existing;
			const deleteBtn = buttons.createEl("button", {
				text: "Delete",
				cls: "callander-modal-button callander-modal-button-danger",
			});
			deleteBtn.addEventListener("click", () => {
				new ConfirmModal(
					this.app,
					"Delete event",
					`Delete "${existing.name}"?`,
					"Delete",
					async () => {
						await this.plugin.eventOperations.deleteEvent(
							existing.file
						);
						await this.onChange();
						this.close();
					}
				).open();
			});
			const copyBtn = buttons.createEl("button", {
				text: "Copy to…",
				cls: "callander-modal-button",
			});
			copyBtn.addEventListener("click", () => {
				this.close();
				new CopyEventModal(this.app, this.plugin, existing).open();
			});
		}
		const saveBtn = buttons.createEl("button", {
			text: "Save",
			cls: "callander-modal-button mod-cta",
		});

		const submit = async () => {
			const name = nameInput.value.trim();
			if (!name) {
				nameInput.focus();
				return;
			}
			const picked = people.wikilinks();
			// Hiding an event only makes sense when someone's timeline can
			// still show it. With nobody on it there's nowhere for it to
			// go, so it stays on the calendar however the tick was left —
			// the alternative is a note you can't reach from anywhere.
			const wanted: EventFields["variant"] = showBox
				? showBox.checked
					? "reminder"
					: "timeline"
				: this.existing?.variant ?? "reminder";
			const fields: EventFields = {
				name,
				date: dateValue.trim() || undefined,
				time: time.value() || undefined,
				duration: duration.value() || undefined,
				type: this.type,
				people: picked,
				location: locInput.value.trim() || undefined,
				link: linkInput.value.trim() || undefined,
				description: descInput.value.trim() || undefined,
				// Flags the form doesn't edit carry over unchanged.
				source: this.existing?.source || this.prefill?.source,
				// Only the calendar-side form asks this. From a person's page
				// the answer is already yes — that's where it's being added
				// or edited — and with nobody on it there's no timeline
				// either way, so the default (absent, meaning yes) is the
				// honest record. An edit reached from a person's page can
				// only be an event already showing there, so keeping
				// `this.existing?.showOnTimelines` rather than forcing it
				// comes out the same either way, without a special case here.
				showOnTimelines: timelineBox
					? picked.length > 0
						? timelineBox.checked
						: undefined
					: this.existing?.showOnTimelines,
				// Without the tick, an edit keeps whatever it already had —
				// forcing a default here would silently un-hide an event
				// you'd deliberately hidden. A new one is a calendar entry,
				// which is what asking from the dashboard already implies.
				variant: picked.length === 0 ? "reminder" : wanted,
			};
			const ops = this.plugin.eventOperations;
			if (this.existing) {
				await ops.updateEvent(this.existing.file, fields);
			} else {
				await ops.createEvent(fields);
			}
			await this.onChange();
			this.close();
		};
		saveBtn.addEventListener("click", () => void submit());
		const onEnter = (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				void submit();
			}
		};
		nameInput.addEventListener("keydown", onEnter);
		locInput.addEventListener("keydown", onEnter);
		descInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				void submit();
			}
		});

		// A pre-filled form counts as an edit for focus purposes.
		if (this.existing || this.prefill?.name) this.blurInitialFocus();
		else window.setTimeout(() => nameInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
