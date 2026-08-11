import type { App } from "obsidian";
import type { ContactWithCountdown } from "@/types";
import { compareByFirstName } from "@/utils/nameFormat";

export interface ContactPickerHandle {
	/** The picked people: "[[Basename]]" for contacts, bare names for guests. */
	wikilinks(): string[];
}

export interface ContactPickerOptions {
	/**
	 * Allow naming someone who has no contact file. Off by default: callers
	 * that only ever deal in real contacts keep dropping entries that no
	 * longer resolve, rather than silently turning a renamed file into a
	 * guest with the old name.
	 */
	allowGuests?: boolean;
	/** Fired after any add or remove, for callers that render off the list. */
	onChange?: () => void;
	/**
	 * People who can't be taken off, as the same "[[Wikilink]]" or bare
	 * name they're passed in as. Their pill loses its ✕ — for the case
	 * where removing them would contradict where you are, like the person
	 * whose page you're adding an event from.
	 */
	locked?: string[];
}

/** A picked person — a real contact, or just a name when `allowGuests`. */
interface Picked {
	name: string;
	contact?: ContactWithCountdown;
}

/**
 * A people picker backed by real contacts — a dropdown that adds removable
 * pills, stored as wikilinks so other pages can resolve the same people
 * later. Initial links that no longer resolve (renamed or deleted files)
 * are silently dropped rather than shown as dead entries, unless
 * `allowGuests` is set, in which case anything unresolved is kept as a
 * plain name.
 */
export function appendContactPicker(
	container: HTMLElement,
	app: App,
	contacts: ContactWithCountdown[],
	initial: string[],
	sourcePath: string,
	options: ContactPickerOptions = {}
): ContactPickerHandle {
	const { allowGuests = false, onChange, locked = [] } = options;
	// Compared as the same string wikilinks() emits, so a locked entry
	// matches whether it arrived as a link or a bare name.
	const lockedKeys = new Set(locked.map((l) => l.trim()));
	const keyOf = (p: Picked) =>
		p.contact ? `[[${p.contact.file.basename}]]` : p.name;
	const picker = container.createDiv({ cls: "people-field" });
	const select = picker.createEl("select", {
		cls: "quick-idea-input people-select",
	});
	const pills = picker.createDiv({ cls: "people-pills" });

	const selected: Picked[] = [];
	const has = (p: Picked) =>
		selected.some((s) =>
			p.contact
				? s.contact?.file.path === p.contact.file.path
				: !s.contact && s.name.toLowerCase() === p.name.toLowerCase()
		);

	for (const raw of initial) {
		const linktext = raw
			.replace(/^\[\[|\]\]$/g, "")
			.split("|")[0]
			.trim();
		if (!linktext) continue;
		const dest = app.metadataCache.getFirstLinkpathDest(
			linktext,
			sourcePath
		);
		const match = dest
			? contacts.find((c) => c.file.path === dest.path)
			: undefined;
		if (match) {
			const p: Picked = { name: match.displayName, contact: match };
			if (!has(p)) selected.push(p);
		} else if (allowGuests) {
			const p: Picked = { name: linktext };
			if (!has(p)) selected.push(p);
		}
	}

	const changed = () => {
		renderPills();
		renderSelect();
		onChange?.();
	};

	const renderSelect = () => {
		select.empty();
		select.createEl("option", { value: "", text: "Add a person…" });
		// Alphabetical by first name — the vault hands them over in folder
		// order, which is no order at all once you have more than a few.
		const available = contacts
			.filter(
				(c) =>
					!selected.some((p) => p.contact?.file.path === c.file.path)
			)
			.sort((a, b) => compareByFirstName(a.displayName, b.displayName));
		for (const c of available) {
			select.createEl("option", {
				value: c.file.path,
				text: c.displayName,
			});
		}
		select.value = "";
	};
	const renderPills = () => {
		pills.empty();
		selected.forEach((p, i) => {
			const isLocked = lockedKeys.has(keyOf(p));
			const pill = pills.createSpan({
				cls: [
					"people-pill",
					p.contact ? "" : "is-guest",
					isLocked ? "is-locked" : "",
				]
					.filter(Boolean)
					.join(" "),
			});
			pill.createSpan({ text: p.name });
			// No ✕ at all rather than a disabled one — there's nothing to
			// press, so offering the affordance would only invite a click.
			if (isLocked) return;
			const x = pill.createEl("button", {
				cls: "people-pill-x",
				attr: {
					type: "button",
					"aria-label": `Remove ${p.name}`,
				},
			});
			x.setText("✕");
			x.addEventListener("click", (e) => {
				e.preventDefault();
				selected.splice(i, 1);
				changed();
			});
		});
	};
	select.addEventListener("change", () => {
		const path = select.value;
		if (!path) return;
		const match = contacts.find((c) => c.file.path === path);
		if (match) selected.push({ name: match.displayName, contact: match });
		changed();
	});

	// Anyone without a contact file — split the bill with them without
	// having to add them to your people first.
	if (allowGuests) {
		const guestRow = picker.createDiv({ cls: "people-guest-row" });
		const guestInput = guestRow.createEl("input", {
			cls: "quick-idea-input people-guest-input",
			attr: {
				type: "text",
				placeholder: "Or type a name…",
			},
		});
		const addGuest = () => {
			const name = guestInput.value.trim();
			if (!name) return;
			// A typed name that matches a real contact should pick the
			// contact — otherwise the same person splits as two people.
			const match = contacts.find(
				(c) => c.displayName.toLowerCase() === name.toLowerCase()
			);
			const p: Picked = match
				? { name: match.displayName, contact: match }
				: { name };
			if (!has(p)) selected.push(p);
			guestInput.value = "";
			changed();
		};
		const guestAdd = guestRow.createEl("button", {
			cls: "callander-button",
			attr: { type: "button" },
		});
		guestAdd.setText("Add");
		guestAdd.addEventListener("click", (e) => {
			e.preventDefault();
			addGuest();
		});
		guestInput.addEventListener("keydown", (e) => {
			if (e.key !== "Enter") return;
			// Enter in a name field would otherwise submit the whole form
			// before the person has been added to the list.
			e.preventDefault();
			addGuest();
		});
	}

	renderSelect();
	renderPills();

	return {
		wikilinks: () =>
			selected.map((p) =>
				p.contact ? `[[${p.contact.file.basename}]]` : p.name
			),
	};
}
