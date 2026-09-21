import { useEffect, useRef, useState, type ReactNode } from "react";
import { Keymap, Platform } from "obsidian";
import { Icon } from "@/ui/components/Icon";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";
import { normalizeNotes } from "@/utils/notesMarkdown";
import { linkSplice, toggleWrap, type TextSplice } from "@/utils/textFormat";

/** "⌘B" on a Mac, "Ctrl+B" elsewhere — what the tooltips say to press. */
function shortcut(key: string, shift = false): string {
	return Platform.isMacOS
		? `${shift ? "⇧" : ""}⌘${key}`
		: `Ctrl+${shift ? "Shift+" : ""}${key}`;
}

/**
 * The free-text notes on a person, group or plan — read as rendered
 * markdown, written three ways:
 *
 * - in place, with a textarea for anything quick;
 * - with a toolbar and the usual shortcuts for bold, italic, highlight and
 *   links, which a plain textarea doesn't give you on its own;
 * - in Obsidian's own editor, through "Edit markdown", for anything longer —
 *   where every shortcut, live preview and other plugins' syntax already
 *   works. Notes are ordinary markdown in the note's body, so what's written
 *   there renders here, spoilers and callouts included.
 *
 * Reading is the default rather than editing: the rendered notes are the
 * thing worth looking at on most visits, and a textarea would show them as
 * raw asterisks. Editing starts from the button or, with nothing written
 * yet, from the invitation to write.
 */
export function NotesSection({
	store,
	value,
	placeholder,
	onSave,
	renderMarkdown,
	onOpenEditor,
}: {
	store: ViewStore;
	/** The notes as markdown. A function because the island is created once
	 * and kept: a plain prop would freeze at the first render, and this
	 * page can be re-pointed at a different file. */
	value: () => string;
	placeholder: () => string;
	/** Resolves once the note is written, so opening the real editor can
	 * wait for it. */
	onSave: (text: string) => Promise<void>;
	/** Render markdown into `el`, returning what undoes it. The view owns
	 * this rather than React, because rendering needs the app and a
	 * component to hang other plugins' post-processors from. */
	renderMarkdown: (text: string, el: HTMLElement) => () => void;
	/** Open the note in Obsidian's own editor. */
	onOpenEditor: () => void;
}) {
	useViewRevision(store);
	const stored = value();
	const hasNotes = stored.trim().length > 0;
	const [editing, setEditing] = useState(false);
	const previewRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<HTMLTextAreaElement>(null);

	// Redrawn whenever the notes change underneath — an edit made in the
	// real editor lands here without a reopen.
	useEffect(() => {
		const el = previewRef.current;
		if (editing || !hasNotes || !el) return;
		return renderMarkdown(stored, el);
	}, [stored, editing, hasNotes, renderMarkdown]);

	// Grows to fit rather than scrolling in a fixed box, driven off the
	// element's own scrollHeight.
	const fit = () => {
		const el = textRef.current;
		if (!el) return;
		el.classList.add("measuring");
		el.style.setProperty("--scroll-height", `${el.scrollHeight}px`);
		el.classList.remove("measuring");
	};

	useEffect(() => {
		if (!editing) return;
		const el = textRef.current;
		if (!el) return;
		fit();
		el.focus();
		el.setSelectionRange(el.value.length, el.value.length);
	}, [editing]);

	/** Write it if it changed — leaving without editing isn't an edit, and
	 * shouldn't rewrite the file or bump the last-updated stamp. */
	const save = async () => {
		const el = textRef.current;
		if (el && normalizeNotes(el.value) !== stored) await onSave(el.value);
	};

	const finish = () => {
		void save();
		setEditing(false);
	};

	/**
	 * Mid-edit, the real editor opens only once what's typed here is
	 * written — otherwise it opens on the old text and the save lands under
	 * it a moment later.
	 */
	const openEditor = async () => {
		if (editing) {
			await save();
			setEditing(false);
		}
		onOpenEditor();
	};

	/**
	 * Losing focus saves, and closes the editor only when focus went
	 * somewhere else on the page. Switching to another app to copy
	 * something shouldn't snap you out of what you were writing.
	 */
	const onBlur = () => {
		void save();
		if (textRef.current?.ownerDocument.hasFocus()) setEditing(false);
	};

	/**
	 * As one native edit, so Cmd+Z undoes it like typing. Assigning a new
	 * value to the textarea would wipe its whole undo history instead.
	 */
	const apply = (splice: TextSplice) => {
		const el = textRef.current;
		if (!el) return;
		el.focus();
		el.setSelectionRange(splice.from, splice.to);
		const doc = el.ownerDocument;
		// execCommand is flagged as deprecated, and the review config won't
		// let that be silenced — but nothing has replaced it for this: it's
		// the only way to edit a textarea that joins its native undo stack.
		// setRangeText, the fallback below, makes the edit un-undoable, which
		// is exactly the broken-editor feel this section exists to fix.
		const done =
			splice.insert === ""
				? splice.from === splice.to || doc.execCommand("delete")
				: doc.execCommand("insertText", false, splice.insert);
		// Some environments refuse execCommand; the edit still has to
		// happen, even if it can't be undone.
		if (!done) el.setRangeText(splice.insert, splice.from, splice.to, "end");
		el.setSelectionRange(splice.selectFrom, splice.selectTo);
		fit();
	};

	const format = (kind: "bold" | "italic" | "highlight" | "link") => {
		const el = textRef.current;
		if (!el) return;
		const { value: text, selectionStart: a, selectionEnd: b } = el;
		if (kind === "link") apply(linkSplice(text, a, b));
		else {
			const marker = { bold: "**", italic: "*", highlight: "==" }[kind];
			apply(toggleWrap(text, a, b, marker));
		}
	};

	/**
	 * The shortcuts Obsidian's editor uses for the same things, so neither
	 * place asks for different habits. Highlight has no default there; ⇧⌘H
	 * is the binding people most often give it.
	 */
	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			e.preventDefault();
			finish();
			return;
		}
		// Preact hands over the native event (react is aliased to
		// preact/compat), so it goes to Keymap as is.
		if (!Keymap.isModifier(e, "Mod") || e.altKey) return;
		const key = e.key.toLowerCase();
		const action =
			key === "enter"
				? "done"
				: e.shiftKey
				? key === "h"
					? "highlight"
					: null
				: key === "b"
				? "bold"
				: key === "i"
				? "italic"
				: key === "k"
				? "link"
				: null;
		if (!action) return;
		e.preventDefault();
		if (action === "done") finish();
		else format(action);
	};

	/** A toolbar button that acts without stealing focus from the text —
	 * a click would otherwise blur the textarea, which saves and closes it
	 * before the formatting ever lands. */
	const tool = (
		label: string,
		hint: string,
		kind: "bold" | "italic" | "highlight" | "link",
		content: ReactNode
	) => (
		<button
			type="button"
			className={`contact-notes-tool contact-notes-tool-${kind}`}
			aria-label={label}
			title={`${label} (${hint})`}
			onMouseDown={(e) => e.preventDefault()}
			onClick={() => format(kind)}
		>
			{content}
		</button>
	);

	return (
		<div className={`contact-notes-section${editing ? " is-editing" : ""}`}>
			{editing ? (
				<>
					<div
						className="contact-notes-toolbar"
						role="toolbar"
						aria-label="Formatting"
					>
						{/* Letters rather than Lucide's bold/italic icons:
						    setIcon draws nothing for a name Obsidian doesn't
						    ship, and those two aren't verified. */}
						{tool("Bold", shortcut("B"), "bold", "B")}
						{tool("Italic", shortcut("I"), "italic", "I")}
						{tool(
							"Highlight",
							shortcut("H", true),
							"highlight",
							<span className="contact-notes-tool-swatch">H</span>
						)}
						{tool("Link", shortcut("K"), "link", <Icon name="link" />)}
					</div>
					<textarea
						ref={textRef}
						className="contact-notes-input"
						placeholder={placeholder()}
						defaultValue={stored}
						onInput={fit}
						onKeyDown={onKeyDown}
						onBlur={onBlur}
					/>
				</>
			) : hasNotes ? (
				<div ref={previewRef} className="contact-notes-preview" />
			) : (
				<button
					type="button"
					className="contact-notes-empty"
					onClick={() => setEditing(true)}
				>
					{placeholder()}
				</button>
			)}

			<div className="contact-section-footer contact-notes-footer">
				{editing ? (
					<button
						type="button"
						className="callander-button"
						onMouseDown={(e) => e.preventDefault()}
						onClick={finish}
					>
						<Icon name="check" />
						<span>Done</span>
					</button>
				) : (
					hasNotes && (
						<button
							type="button"
							className="callander-button"
							onClick={() => setEditing(true)}
						>
							<Icon name="pencil" />
							<span>Edit</span>
						</button>
					)
				)}
				{/* Kept whatever else changes: for anything longer than a
				    line or two, Obsidian's own editor is the better place to
				    write — and what's written there renders here. */}
				<button
					type="button"
					className="callander-button"
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => void openEditor()}
				>
					<Icon name="document" />
					<span>Edit markdown</span>
				</button>
			</div>
		</div>
	);
}
