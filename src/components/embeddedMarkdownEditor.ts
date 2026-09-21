import type { App, Component, Editor, MarkdownFileInfo, TFile } from "obsidian";

/**
 * Obsidian's own markdown editor, mounted inside one of this plugin's pages.
 *
 * **This leans on non-public Obsidian internals**, and is only ever reached
 * through the "Native editor for Notes" experimental setting. Obsidian has
 * no public way to embed its editor: the class behind it isn't exported, and
 * the one public editor view (MarkdownEditView) needs a whole MarkdownView
 * to live in. So the class is recovered the way the community does it —
 * build a throwaway markdown embed, switch it into editing, and take the
 * constructor from the prototype chain of the editor it made.
 *
 * Any of that can change in an Obsidian update without notice. Every
 * internal is checked before it's used, and anything missing throws — the
 * caller catches that and falls back to the plain Notes section, so a
 * broken internal costs the native feel, never the notes.
 *
 * Everything internal is confined to this file.
 */

/** The live CodeMirror view, as far as it's used here. */
interface InternalCodeMirror {
	contentDOM: HTMLElement;
	hasFocus: boolean;
	focus(): void;
	state: { doc: { toString(): string } };
}

/** The editor instance, as far as it's used here. */
interface InternalEditor extends Component {
	editor: Editor & { cm: InternalCodeMirror };
	containerEl: HTMLElement;
	/** Replace the whole document; `clear` drops the undo history. */
	set(value: string, clear: boolean): void;
	/** Called by the editor on every CodeMirror update. */
	onUpdate(update: unknown, changed: boolean): void;
	destroy(): void;
}

type InternalEditorClass = new (
	app: App,
	container: HTMLElement,
	owner: object
) => InternalEditor;

/** A markdown embed — only what's needed to get an editor out of one. */
interface InternalEmbed {
	editable: boolean;
	showEditor(): void;
	editMode?: object;
	unload(): void;
}

type EmbedFactory = (
	context: { app: App; containerEl: HTMLElement },
	file: TFile | null,
	subpath: string
) => InternalEmbed;

let editorClass: InternalEditorClass | null = null;

/** Recover the editor's class, once. Throws when the internals moved. */
function resolveEditorClass(app: App): InternalEditorClass {
	if (editorClass) return editorClass;
	const registry = (
		app as unknown as {
			embedRegistry?: { embedByExtension?: Record<string, unknown> };
		}
	).embedRegistry;
	const makeEmbed = registry?.embedByExtension?.md;
	if (typeof makeEmbed !== "function") {
		throw new Error("Obsidian's markdown embed factory isn't available");
	}
	const embed = (makeEmbed as EmbedFactory)(
		{ app, containerEl: createDiv() },
		null,
		""
	);
	try {
		embed.editable = true;
		embed.showEditor();
		const editMode = embed.editMode;
		if (!editMode) throw new Error("The markdown embed made no editor");
		const proto: unknown = Object.getPrototypeOf(
			Object.getPrototypeOf(editMode)
		);
		const ctor = (proto as { constructor?: unknown } | null)?.constructor;
		const methods = proto as Partial<Record<string, unknown>> | null;
		if (
			typeof ctor !== "function" ||
			typeof methods?.set !== "function" ||
			typeof methods?.onUpdate !== "function" ||
			typeof methods?.destroy !== "function"
		) {
			throw new Error("Obsidian's editor class isn't where it was");
		}
		editorClass = ctor as InternalEditorClass;
		return editorClass;
	} finally {
		embed.unload();
	}
}

export interface EmbeddedEditor {
	getValue(): string;
	/** Replace the text without it counting as an edit (no onChange). */
	setValue(text: string): void;
	hasFocus(): boolean;
	/** Focus with the cursor after the last character. */
	focusEnd(): void;
	destroy(): void;
}

/**
 * Mount an editor into `host`. Throws if Obsidian's internals aren't what
 * this expects — see the file comment.
 */
export function mountEmbeddedEditor(
	app: App,
	host: HTMLElement,
	options: {
		value: string;
		/** The note the text belongs to, for link suggestions and for editor
		 * commands that ask which file they're in. Read live, as the page
		 * can be re-pointed at another note. */
		file: () => TFile | null;
		onChange: (text: string) => void;
		onBlur: () => void;
	}
): EmbeddedEditor {
	const Base = resolveEditorClass(app);
	let silent = false;

	// What the editor expects to live inside: normally a MarkdownView. This
	// stands in for the parts it calls, and doubles as the "active editor"
	// Obsidian's editor commands act on — so a formatting hotkey reaches it.
	const owner: MarkdownFileInfo & Record<string, unknown> = {
		app,
		get file() {
			return options.file();
		},
		onMarkdownScroll: () => {},
		getMode: () => "source",
		hoverPopover: null,
	};

	class NotesEditor extends Base {
		onUpdate(update: unknown, changed: boolean): void {
			super.onUpdate(update, changed);
			if (changed && !silent) options.onChange(this.getText());
		}

		getText(): string {
			return this.editor.cm.state.doc.toString();
		}
	}

	const editor = new NotesEditor(app, host, owner);
	owner.editMode = editor;
	owner.editor = editor.editor;
	editor.load();
	silent = true;
	try {
		editor.set(options.value, true);
	} finally {
		silent = false;
	}

	const content = editor.editor.cm.contentDOM;
	const onFocus = () => {
		app.workspace.activeEditor = owner;
	};
	content.addEventListener("focusin", onFocus);
	content.addEventListener("blur", options.onBlur);

	let destroyed = false;
	return {
		getValue: () => editor.getText(),
		setValue(text: string) {
			silent = true;
			try {
				editor.set(text, true);
			} finally {
				silent = false;
			}
		},
		hasFocus: () => editor.editor.cm.hasFocus,
		focusEnd() {
			const doc = editor.editor;
			const last = doc.lastLine();
			doc.focus();
			doc.setCursor(last, doc.getLine(last).length);
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			content.removeEventListener("focusin", onFocus);
			content.removeEventListener("blur", options.onBlur);
			if (app.workspace.activeEditor === owner) {
				app.workspace.activeEditor = null;
			}
			editor.unload();
			// Unloading may already have torn the editor down; a second
			// destroy on an internal class isn't worth failing over.
			try {
				editor.destroy();
			} catch {
				// Already gone.
			}
			host.empty();
		},
	};
}
