import { Notice, setIcon } from "obsidian";
import { formatFlexDate, monthName, parseFlexDate } from "@/utils/flexdate";
import { formatCount } from "@/utils/text";
import {
	birthFlower,
	birthstone,
	chineseZodiac,
	zodiacSign,
} from "@/utils/birthTrivia";
import { lastUpdatedLabel } from "@/utils/contactPage";
import { saveModel } from "@/views/ContactPageView/persistence";
import type { PageContext } from "@/views/ContactPageView/context";

export function renderNameSection(ctx: PageContext, container: HTMLElement) {
	const nameSection = container.createDiv({
		cls: "contact-name-section",
	});

	const nameDisplay = nameSection.createDiv({
		cls: "contact-name-display",
	});

	const editContainer = nameDisplay.createDiv({
		cls: "contact-name-row",
	});

	const nameText = editContainer.createEl("h1", {
		text:
			ctx.model.data.displayName ||
			ctx.model.data.name ||
			"Unnamed Contact",
	});

	// Plans: the name is edited through "Edit details" instead of an
	// inline pencil, and long trip names wrap rather than overflow
	if (ctx.model.kind === "plan") {
		nameText.addClass("contact-name-wrap");
		return;
	}

	const nameInput = editContainer.createEl("input", {
		type: "text",
		value: ctx.model.data.name || "",
		placeholder: "Contact name",
		cls: "contact-name-input",
	});

	const editButton = editContainer.createEl("button", {
		cls: "callander-button button-icon contact-name-edit",
	});
	setIcon(editButton, "pencil");

	// Add birthday-derived details, at whatever precision is recorded
	const birthdayValue = ctx.model.data.birthday ?? "";
	const birthdayFlex = parseFlexDate(birthdayValue);
	if (birthdayFlex && birthdayFlex.month) {
		const { year, month, day } = birthdayFlex;

		// Age is only known when the year is
		if (year !== null) {
			const ageText =
				ctx.plugin.contactOperations.calculateDetailedAge(
					birthdayValue
				);
			if (ageText) {
				nameDisplay.createSpan({
					text: ageText,
					cls: "contact-age-display",
				});
			}
		}

		// Birthday, at whatever precision is recorded (en-AU: day month year).
		// When the exact day is known, a relative countdown joins the same line.
		const birthdayText =
			day !== null && year !== null
				? `${day} ${monthName(month)} ${year}`
				: day !== null
				? `${day} ${monthName(month)}`
				: year !== null
				? `${monthName(month)} ${year}`
				: monthName(month);

		let relativeText: string | null = null;
		if (day !== null) {
			const daysUntil =
				ctx.plugin.contactOperations.calculateDaysUntilBirthday(
					birthdayValue
				);
			const daysSince =
				ctx.plugin.contactOperations.calculateDaysSinceBirthday(
					birthdayValue
				);

			if (daysUntil === 0) {
				relativeText = "today 🎂";
			} else if (
				daysSince !== null &&
				daysSince > 0 &&
				daysSince <= 30
			) {
				relativeText =
					`${formatCount(daysSince, "day")} ago`;
			} else if (daysUntil !== null) {
				relativeText =
					`in ${formatCount(daysUntil, "day")}`;
			}
		}

		nameDisplay.createSpan({
			text: relativeText
				? `Birthday: ${birthdayText} • ${relativeText}`
				: `Birthday: ${birthdayText}`,
			cls: "contact-age-display",
		});

		// Day unknown: keep a lightweight month-level countdown, only when near
		if (day === null) {
			const countdownContainer = nameDisplay.createDiv({
				cls: "contact-birthday-countdown",
			});
			const nowMonth = new Date().getMonth() + 1;
			const monthsAway = (month - nowMonth + 12) % 12;
			if (monthsAway > 3) {
				countdownContainer.remove();
			} else {
				countdownContainer.createSpan({
					text:
						month === nowMonth
							? "🎂 Birthday this month"
							: `Birthday in ${formatFlexDate({
									year: null,
									month,
									day: null,
							  })}`,
				});
			}
		}

		// Optional birthday trivia, each behind a setting
		const s = ctx.plugin.settings;
		if (day !== null && s.showStarSign) {
			nameDisplay.createSpan({
				text: `Star sign: ${zodiacSign(month, day)}`,
				cls: "contact-age-display",
			});
		}
		if (year !== null && s.showChineseZodiac) {
			nameDisplay.createSpan({
				text: `Zodiac: ${chineseZodiac(year, month, day)}`,
				cls: "contact-age-display",
			});
		}
		if (s.showBirthstone) {
			nameDisplay.createSpan({
				text: `Birthstone: ${birthstone(month)}`,
				cls: "contact-age-display",
			});
		}
		if (s.showBirthFlower) {
			nameDisplay.createSpan({
				text: `Birth flower: ${birthFlower(month)}`,
				cls: "contact-age-display",
			});
		}
	}

	// When a display name is in use, show the real name quietly
	if (
		ctx.model.data.displayName &&
		ctx.model.data.displayName !== ctx.model.data.name
	) {
		nameDisplay.createSpan({
			text: `Full name: ${ctx.model.data.name}`,
			cls: "contact-age-display",
		});
	}

	// Last updated — from the file itself, so edits made anywhere count
	if (ctx.model.file) {
		const label = lastUpdatedLabel(
			new Date(ctx.model.file.stat.mtime),
			new Date()
		);
		nameDisplay.createSpan({
			cls: "contact-age-display contact-last-updated",
			text: `Last updated: ${label}`,
		});
	}

	editButton.addEventListener("click", () => {
		if (!nameInput.classList.contains("editing")) {
			nameText.classList.add("editing");
			nameInput.classList.add("editing");
			setIcon(editButton, "checkmark");
			nameInput.focus();
		} else {
			void saveNameChange();
		}
	});

	// One save per edit. Typing and then clicking the tick fires the
	// input's change (on blur) and then the click, and each used to run the
	// save and the rename.
	let saving = false;
	const saveNameChange = async () => {
		if (saving || !nameInput.classList.contains("editing")) return;
		// The note being renamed, kept across the awaits below.
		const model = ctx.model;
		const file = model.file;
		if (!file) return;
		saving = true;
		try {
			const newName = nameInput.value.trim();
			if (newName && newName !== model.data.name) {
				model.data.name = newName;
				await saveModel(ctx, model);

				// Rename the file. All friends hears the rename itself.
				if (file.parent) {
					try {
						await ctx.plugin.contactOperations.renamePerson(
							file,
							newName
						);
						new Notice(`Updated contact name`);
					} catch (error) {
						new Notice(
							`Error updating file name: ${String(error)}`
						);
					}
				}
			}
		} finally {
			saving = false;
		}
		// What's stored, not what was typed: an emptied box saves nothing,
		// so it mustn't leave "Unnamed Contact" over a name that's still
		// there — and a display name, when there is one, still leads.
		nameInput.value = model.data.name || "";
		nameText.textContent =
			model.data.displayName || model.data.name || "Unnamed Contact";
		nameText.classList.remove("editing");
		nameInput.classList.remove("editing");
		setIcon(editButton, "pencil");
	};

	nameInput.addEventListener("change", () => void saveNameChange());
}
