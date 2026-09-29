import { setIcon } from "obsidian";
import {
	rememberRelationshipType,
	updateRelationshipDatalist,
} from "@/components/ContactFields";
import { NoteSuggest } from "@/components/NoteSuggest";
import { fieldHelp, fieldLabel } from "@/utils/fieldLabel";
import {
	formatLinkField,
	linkLabel,
	linkTarget,
	parseLinkField,
} from "@/utils/linkField";
import { createBirthdayPrecisionInput } from "@/components/BirthdayInput";
import { createFlexDateInput } from "@/components/FlexDateInput";
import { STANDARD_FIELDS, SYSTEM_FIELDS, LINKABLE_FIELDS } from "@/constants";
import { ContactOperations } from "@/services/ContactOperations";
import {
	formatFlexDate,
	formatTimeSince,
	parseFlexDate,
} from "@/utils/flexdate";
import {
	openAddFieldModal,
	updateContactData,
} from "@/views/ContactPageView/actions/person";
import { saveModel } from "@/views/ContactPageView/persistence";
import {
	fieldEditText,
	fieldEditValue,
	isFilledField,
} from "@/utils/contactPage";
import type { PageContext } from "@/views/ContactPageView/context";
import { makeActivatable, makeDisclosure } from "@/components/activatable";

/** "About": the person's attribute fields, in an accordion that remembers
 * whether it was open. */
export function renderAbout(ctx: PageContext, container: HTMLElement) {
	// "General" — a collapsed accordion of the attribute fields
	const infoWrap = container.createDiv({
		cls: "contact-stack-section plan-accordion contact-general-accordion",
	});
	const infoHeader = infoWrap.createDiv({
		cls: "contact-stack-header plan-accordion-header",
	});
	setIcon(
		infoHeader.createSpan({ cls: "contact-stack-header-icon" }),
		"user"
	);
	infoHeader.createSpan({
		cls: "plan-accordion-label",
		text: "About",
	});
	setIcon(
		infoHeader.createSpan({ cls: "plan-accordion-chevron" }),
		"chevron-down"
	);
	const infoBody = infoWrap.createDiv({
		cls: "plan-accordion-body",
	});
	const infoSection = infoBody.createDiv({
		cls: "contact-info-section",
	});
	renderInfoSection(ctx, infoSection);
	// Persisted rather than per-view: this page is rebuilt from
	// scratch on every open and on every vault event, so in-memory
	// state would spring back closed the moment anything changed.
	// Same treatment as the dashboard's draftsCollapsed.
	infoWrap.toggleClass("is-open", ctx.plugin.settings.aboutExpanded);
	makeDisclosure(
		infoHeader,
		infoWrap,
		() => {
			const open = !ctx.plugin.settings.aboutExpanded;
			ctx.plugin.settings.aboutExpanded = open;
			infoWrap.toggleClass("is-open", open);
			ctx.saveLayoutSetting();
		},
		"section:about"
	);
}

function renderInfoSection(ctx: PageContext, container: HTMLElement) {
	// container is already a .contact-info-section — no second wrapper,
	// so the fields span the page like every other section
	const fieldsContainer = container.createDiv({
		cls: "contact-fields-container",
	});

	const renderViewMode = () => {
		fieldsContainer.empty();
		fieldsContainer.classList.remove("editing");

		// Render each field as read-only text
		Object.entries(ctx.model.data)
			// SYSTEM_FIELDS rather than a list repeated here: this was a
			// hand-kept duplicate and had already drifted from it, which
			// is how `extras`, `insideJokes` and `lifeGoals` ended up
			// rendered as About rows despite each having its own section.
			.filter(
				([key]) =>
					!(SYSTEM_FIELDS as readonly string[]).includes(key)
			)
			.forEach(([key, value]) => {
				if (!isFilledField(value)) return;

				const field = fieldsContainer.createDiv({
					cls: "contact-field-view",
					attr: {
						"data-field": key.toLowerCase(),
					},
				});

				appendFieldLabel(ctx, field, key);

				// Groups render as colored chips, not plain text
				if (key === "groups") {
					const ops = ctx.plugin.contactOperations;
					const infos = ops.getGroupInfos();
					const colorOf = new Map(
						infos.map((i) => [i.name, i.color])
					);
					const fileOf = new Map(
						infos.map((i) => [i.name, i.file])
					);
					const displayOf = ops.groupDisplayNames();
					const chips = field.createDiv({
						cls: "contact-group-chips",
					});
					// Through groupsOf, not the raw array: these are
					// stored as `[[Wikilinks]]`, and reading them raw
					// printed the brackets and missed every colour —
					// the lookups below are all keyed on the bare name.
					for (const g of ContactOperations.groupsOf(
						ctx.model.data
					)) {
						const chip = chips.createSpan({
							cls: "contact-group-chip readonly",
						});
						const dot = chip.createSpan({
							cls: "group-dot",
						});
						dot.style.backgroundColor =
							colorOf.get(g) ??
							"var(--background-modifier-border)";
						const label = chip.createSpan({
							text:
								displayOf.get(g) ??
								ops.prettyGroupName(g),
						});
						// The value really is a link, so it should behave
						// like one. Only when the page exists — a group
						// nobody has opened yet has nothing to navigate
						// to, and a dead link that looks live is worse
						// than plain text.
						const dest = fileOf.get(g);
						if (!dest) continue;
						label.addClass("contact-group-chip-link");
						makeActivatable(
							label,
							(e) => {
								e.stopPropagation();
								void ctx.app.workspace.openLinkText(
									dest.path,
									ctx.model.file?.path ?? "",
									true
								);
							},
							{ role: "link" }
						);
					}
					return;
				}

				// Entries that name other notes render as real links —
				// Obsidian's own `internal-link` class, so they pick up
				// the accent colour, hover preview and unresolved styling
				// without this reinventing any of it. Plain-text entries
				// sit alongside unchanged.
				if (LINKABLE_FIELDS.includes(key)) {
					const entries = parseLinkField(value);
					if (entries.length === 0) return;
					const list = field.createDiv({
						cls: "contact-link-field",
					});
					for (const entry of entries) {
						const target = linkTarget(entry);
						if (!target) {
							list.createSpan({
								cls: "contact-link-plain",
								text: linkLabel(entry),
							});
							continue;
						}
						const link = list.createEl("a", {
							cls: "internal-link contact-link-chip",
							text: linkLabel(entry),
							attr: { href: target, "data-href": target },
						});
						link.addEventListener("click", (e) => {
							e.preventDefault();
							// Always a new tab, never in place: this page
							// is the thing you were reading, and following
							// a relative or a related file is a detour —
							// replacing the person you came from would
							// cost a Back press to undo every time.
							void ctx.app.workspace.openLinkText(
								target,
								ctx.model.file?.path ?? "",
								true
							);
						});
					}
					return;
				}

				// Format flexible dates at their recorded precision; the
				// rest reads as it edits, a list as one line.
				const displayValue = (() => {
					if ((key === "birthday" || key === "met") && value) {
						const parsed = parseFlexDate(
							value as string | number
						);
						if (parsed) {
							if (key === "met") {
								const since = formatTimeSince(parsed);
								return `${formatFlexDate(parsed)}${
									since ? ` (${since})` : ""
								}`;
							}
							return formatFlexDate(parsed);
						}
					}
					return fieldEditText(value);
				})();

				field.createDiv({
					cls: "contact-field-value",
					text: displayValue,
				});
			});

		// Add edit button at the bottom
		const editButton = fieldsContainer.createEl("button", {
			cls: "callander-button",
			text: "Edit",
		});

		editButton.addEventListener("click", () => {
			ctx.ui.aboutEditing = true;
			renderEditMode();
		});
	};

	const renderEditMode = () => {
		fieldsContainer.empty();
		fieldsContainer.classList.add("editing");

		// Standard fields first
		Object.values(STANDARD_FIELDS)
			.filter((field) => !SYSTEM_FIELDS.includes(field))
			.forEach((field) => {
				if (field === STANDARD_FIELDS.MET) {
					createMetField(ctx, fieldsContainer);
				} else if (field === STANDARD_FIELDS.BIRTHDAY) {
					createBirthdayField(ctx, fieldsContainer);
				} else if (field === STANDARD_FIELDS.GROUPS) {
					createGroupsField(ctx, fieldsContainer);
				} else {
					createInfoField(
						ctx,
						fieldsContainer,
						field,
						// Linkable fields store a list; the box edits
						// them as one comma-separated line.
						LINKABLE_FIELDS.includes(field)
							? formatLinkField(ctx.model.data[field])
							: fieldEditText(ctx.model.data[field])
					);
				}
			});

		// Then custom fields
		const excludedFields = [
			...SYSTEM_FIELDS,
			...Object.values(STANDARD_FIELDS).map((f) => f.toLowerCase()),
			"created",
			"updated",
		];
		Object.entries(ctx.model.data)
			.filter(([key]) => !excludedFields.includes(key.toLowerCase()))
			.forEach(([key, value]) => {
				createInfoField(ctx, fieldsContainer, key, fieldEditText(value));
			});

		// Add custom field button
		const addFieldButton = fieldsContainer.createEl("button", {
			cls: "callander-button button-outlined",
			text: "Add custom field",
		});
		addFieldButton.addEventListener("click", () => {
			void openAddFieldModal(ctx, ctx.model);
		});

		// Add done button
		const doneButton = fieldsContainer.createEl("button", {
			cls: "callander-button button-primary button-full-width",
			text: "Done",
		});

		const handleDone = async () => {
			const model = ctx.model;
			// Before the save, so a refresh that lands while it runs
			// draws the read view rather than putting you back in here.
			ctx.ui.aboutEditing = false;
			await saveModel(ctx, model);
			renderViewMode();
		};
		doneButton.addEventListener("click", () => void handleDone());
	};

	// Still editing if a refresh redrew the page mid-edit (see
	// PageUiState.aboutEditing).
	if (ctx.ui.aboutEditing) renderEditMode();
	else renderViewMode();
}

/**
 * A field's label, plus — while editing — the button that explains it.
 *
 * Shared by the read view and every edit-mode field so the wording can't
 * drift between them, and adding a field means one entry in fieldLabel's
 * tables rather than four call sites.
 *
 * The explanation is a popover anchored to its button, dismissed by the
 * ✕, by clicking anywhere outside, or by Escape. Only one is ever open:
 * opening a second closes the first, so the column can't fill up with
 * stacked boxes.
 *
 * Edit mode only. Reading a filled-in page, the values speak for
 * themselves and a row of buttons is clutter; the question "what goes
 * here?" is one you have while filling it in.
 */
export function appendFieldLabel(
	ctx: PageContext,
	row: HTMLElement,
	key: string,
	{ editing = false } = {}
) {
	const label = editing
		? row.createEl("label", { cls: "contact-field-label" })
		: row.createDiv({ cls: "contact-field-label" });
	label.createSpan({ text: fieldLabel(key) });

	const help = editing ? fieldHelp(key) : null;
	if (!help) return;

	// The anchor the popover positions against, so it tracks the button
	// rather than the row — the label column is a fixed width but the
	// button sits at the end of a variable-length word.
	const anchor = label.createSpan({ cls: "contact-field-info-anchor" });
	const button = anchor.createEl("button", {
		cls: "contact-field-info",
		attr: {
			type: "button",
			"aria-label": `What is ${fieldLabel(key)}?`,
			"aria-expanded": "false",
		},
	});
	// `info` isn't on the verified icon list in CLAUDE.md, and a name
	// Obsidian doesn't ship renders nothing at all — `lightbulb` is
	// verified and reads as "here's a hint", which is the job.
	setIcon(button, "lightbulb");

	button.addEventListener("click", (e) => {
		// The label wraps its input, so without this the click would also
		// focus the field and raise a keyboard on mobile.
		e.preventDefault();
		e.stopPropagation();
		if (ctx.helpPopover.isOpenAt(anchor)) {
			ctx.helpPopover.close();
			return;
		}
		ctx.helpPopover.open(anchor, button, key, help);
	});
}

/**
 * "When we met" with honest vagueness: record just the year, the month,
 * or the exact day — whatever you actually remember.
 */
export function createMetField(ctx: PageContext, container: HTMLElement) {
	const fieldContainer = container.createDiv({
		cls: "contact-field",
	});

	appendFieldLabel(ctx, fieldContainer, "met", { editing: true });

	createFlexDateInput(fieldContainer, ctx.model.data.met, (value) => {
		void updateContactData(ctx, ctx.model, "met", value);
	});
}

/**
 * Birthday with honest imprecision: exact date, month + year (day
 * unknown), or month + day (year unknown).
 */
export function createBirthdayField(ctx: PageContext, container: HTMLElement) {
	const fieldContainer = container.createDiv({
		cls: "contact-field",
	});

	appendFieldLabel(ctx, fieldContainer, "birthday", { editing: true });

	createBirthdayPrecisionInput(
		fieldContainer,
		ctx.model.data.birthday,
		(value) => {
			void updateContactData(ctx, ctx.model, "birthday", value);
		}
	);
}

/** Groups as toggle chips with color dots; new groups via a small input */
export function createGroupsField(ctx: PageContext, container: HTMLElement) {
	const ops = ctx.plugin.contactOperations;
	const fieldContainer = container.createDiv({
		cls: "contact-field contact-field-groups",
	});
	appendFieldLabel(ctx, fieldContainer, "groups", { editing: true });

	const wrap = fieldContainer.createDiv({
		cls: "contact-groups-edit",
	});
	const chipsRow = wrap.createDiv({ cls: "contact-group-chips" });

	// Through groupsOf, not the raw array: values are stored as
	// `[[Wikilinks]]` and everything below compares bare names.
	const member = new Set<string>(
		ContactOperations.groupsOf(ctx.model.data)
	);
	const infos = ops.getGroupInfos();
	const colorOf = new Map(infos.map((i) => [i.name, i.color]));
	const known = [
		...new Set([...infos.map((i) => i.name), ...member]),
	].sort();

	// The page's own spelling, so the stored link matches the file
	// rather than a first-letter guess — see groupDisplayNames.
	const displayOf = ops.groupDisplayNames();
	const save = () => {
		void updateContactData(
			ctx,
			ctx.model,
			"groups",
			[...member]
				.sort()
				.map((g) =>
					ContactOperations.groupLink(g, displayOf.get(g))
				)
		);
	};

	const addChip = (name: string) => {
		const chip = chipsRow.createEl("button", {
			cls: `contact-group-chip ${member.has(name) ? "selected" : ""}`,
		});
		const dot = chip.createSpan({ cls: "group-dot" });
		dot.style.backgroundColor =
			colorOf.get(name) ?? "var(--background-modifier-border)";
		chip.createSpan({
			text: displayOf.get(name) ?? ops.prettyGroupName(name),
		});
		chip.addEventListener("click", () => {
			member.has(name) ? member.delete(name) : member.add(name);
			chip.toggleClass("selected", member.has(name));
			save();
		});
	};
	known.forEach(addChip);

	// Group creation lives on the dashboard — here you only toggle
	if (known.length === 0) {
		wrap.createDiv({
			cls: "section-helper-text",
			text: "No groups yet — create them from the dashboard.",
		});
	}
}

export function createInfoField(
	ctx: PageContext,
	container: HTMLElement,
	field: string,
	value: string
) {
	const fieldContainer = container.createDiv({
		cls: "contact-field",
	});

	appendFieldLabel(ctx, fieldContainer, field, { editing: true });

	const input = fieldContainer.createEl("input", {
		cls: "contact-field-input",
		attr: {
			type: field === "birthday" ? "date" : "text",
			placeholder: `Enter ${field.toLowerCase()}`,
			value: value || "",
			...(field === "relationship" && {
				list: "relationship-types",
			}),
		},
	});

	// Fields whose entries name other notes get note autocomplete, and
	// save as a list rather than the raw string — a link only counts to
	// Obsidian when it's the whole value (see LINKABLE_FIELDS).
	if (LINKABLE_FIELDS.includes(field)) {
		input.placeholder = "Type a name, or pick a note";
		new NoteSuggest(ctx.app, input);
		input.addEventListener("change", () => {
			const entries = parseLinkField(input.value);
			void updateContactData(ctx, ctx.model, field, entries);
		});
		return;
	}

	if (field === "relationship") {
		// Its suggestions, and a new one typed here offered next time, as
		// Add friend does.
		updateRelationshipDatalist(input, ctx.plugin);
		input.addEventListener("change", () =>
			rememberRelationshipType(ctx.plugin, input.value)
		);
	}
	input.addEventListener("change", () => {
		const value = fieldEditValue(input.value, ctx.model.data[field]);
		void updateContactData(ctx, ctx.model, field, value);
	});
}
