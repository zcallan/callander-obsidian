import { AbstractInputSuggest, App, TFile } from "obsidian";
import { asWikilink, replaceEntryAt } from "@/utils/linkField";

/**
 * Note-name autocomplete for the linkable fields (parents, siblings,
 * friends, related files).
 *
 * Not Obsidian's own `[[` suggester — that one is an `EditorSuggest`, bound
 * to a CodeMirror editor, and can't attach to a plain `<input>`.
 * `AbstractInputSuggest` is the public API that can, and it brings the same
 * popover chrome, keyboard handling and theming; only the matching and the
 * insertion are ours.
 *
 * It suggests on whatever is being typed rather than waiting for `[[`, since
 * these fields hold note names by definition and asking for brackets first
 * would be ceremony. Picking a note wraps it in brackets; typing and moving
 * on leaves plain text exactly as written, so raw names are never silently
 * promoted to links.
 */
export class NoteSuggest extends AbstractInputSuggest<TFile> {
	constructor(app: App, private inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	/** The entry the caret is inside — the only one being edited. */
	private currentQuery(): string {
		const caret = this.inputEl.selectionStart ?? this.inputEl.value.length;
		const before = this.inputEl.value.slice(0, caret);
		const segment = before.slice(before.lastIndexOf(",") + 1);
		// Brackets are stripped so a half-typed "[[Ali" still matches, and so
		// re-opening a completed entry offers its own note rather than nothing.
		return segment.replace(/\[\[|\]\]/g, "").trim();
	}

	getSuggestions(): TFile[] {
		const query = this.currentQuery().toLowerCase();
		const files = this.app.vault.getMarkdownFiles();
		const matches = query
			? files.filter((f) => f.basename.toLowerCase().includes(query))
			: files;
		// Shortest first: an exact-ish name beats a longer one that merely
		// contains the query, which is what people mean by "Alex" when both
		// "Alex" and "Alex Thompson's birthday" exist.
		return matches
			.sort((a, b) => a.basename.length - b.basename.length)
			.slice(0, 20);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.createDiv({ text: file.basename });
		// The folder disambiguates two notes of the same name, which is
		// exactly when the basename alone isn't enough to choose.
		if (file.parent && file.parent.path !== "/") {
			el.createDiv({
				cls: "suggestion-note",
				text: file.parent.path,
			});
		}
	}

	selectSuggestion(file: TFile): void {
		const caret =
			this.inputEl.selectionStart ?? this.inputEl.value.length;
		this.inputEl.value = replaceEntryAt(
			this.inputEl.value,
			caret,
			asWikilink(file.basename)
		);
		// `change` is what the field listens on to save; `input` keeps any
		// other listener (and the FormModal dirty guard) in step.
		this.inputEl.trigger("input");
		this.inputEl.dispatchEvent(new Event("change", { bubbles: true }));
		this.close();
	}
}
