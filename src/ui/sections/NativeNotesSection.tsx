import { useEffect, useRef, useState, type ReactNode } from "react";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";
import { normalizeNotes } from "@/utils/notesMarkdown";
import type { EmbeddedEditor } from "@/components/embeddedMarkdownEditor";
import { Icon } from "@/ui/components/Icon";

/**
 * Notes in whichever form the settings ask for: Obsidian's own editor when
 * the experimental "Native editor for Notes" is on, the plain section
 * otherwise. Re-read on every store bump, which a settings change causes —
 * so flipping the toggle swaps the page over without a reopen.
 */
export function NotesChooser({
	store,
	native,
	nativeSection,
	plainSection,
}: {
	store: ViewStore;
	native: () => boolean;
	nativeSection: ReactNode;
	plainSection: ReactNode;
}) {
	useViewRevision(store);
	return <>{native() ? nativeSection : plainSection}</>;
}

/**
 * The notes, always editable, in Obsidian's own editor: live preview, the
 * user's hotkeys, and every other plugin's editor extensions, as in any
 * note. Only reachable through the experimental setting — the editor is
 * mounted through non-public internals (see embeddedMarkdownEditor), and if
 * those have moved, this renders `fallback`, the plain Notes section.
 *
 * Edits go to the view as they happen, and it decides when to write; blur
 * asks it to write now.
 */
export function NativeNotesSection({
	store,
	value,
	placeholder,
	mount,
	onChange,
	onFlush,
	onOpenEditor,
	fallback,
}: {
	store: ViewStore;
	/** The notes as markdown, read live — see NotesSection. */
	value: () => string;
	placeholder: () => string;
	/** Mount the editor into `host`. Throws when it can't. */
	mount: (
		host: HTMLElement,
		initial: string,
		events: { onChange: (text: string) => void; onBlur: () => void }
	) => EmbeddedEditor;
	onChange: (text: string) => void;
	/** Write any pending edit now. */
	onFlush: () => Promise<void>;
	onOpenEditor: () => void;
	fallback: ReactNode;
}) {
	useViewRevision(store);
	const stored = value();
	const hostRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<EmbeddedEditor | null>(null);
	const [failed, setFailed] = useState(false);
	const [empty, setEmpty] = useState(stored.trim() === "");

	// Mounted once and kept, like the island around it: the same editor
	// follows the page from note to note, swapping its text below.
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		try {
			const editor = mount(host, value(), {
				onChange: (text) => {
					setEmpty(text.trim() === "");
					onChange(text);
				},
				onBlur: () => void onFlush(),
			});
			editorRef.current = editor;
			return () => {
				editorRef.current = null;
				editor.destroy();
			};
		} catch (error) {
			console.error(
				"Callander: the native Notes editor couldn't start, so the standard Notes are shown instead. Obsidian's internals may have changed.",
				error
			);
			setFailed(true);
		}
		// Once only — value and the callbacks are read live.
	}, []);

	// The notes changed underneath: another note opened, or the file was
	// edited elsewhere. Not while typing here, where the editor is the
	// newer copy and replacing it would throw away keystrokes.
	useEffect(() => {
		const editor = editorRef.current;
		if (!editor || editor.hasFocus()) return;
		if (normalizeNotes(editor.getValue()) === stored) return;
		editor.setValue(stored);
		setEmpty(stored.trim() === "");
	}, [stored]);

	if (failed) return <>{fallback}</>;

	return (
		<div className="contact-notes-section contact-notes-native">
			{/* The editor's own lines only fill as much of the box as there
			    is text, so a click on the rest of it — the empty space below,
			    the padding — focuses it here, at the end of the notes.
			    Clicks on the text itself are left to the editor. */}
			<div
				className="contact-notes-native-body"
				onMouseDown={(e) => {
					const target = e.target as HTMLElement | null;
					if (target?.closest(".cm-content")) return;
					e.preventDefault();
					editorRef.current?.focusEnd();
				}}
			>
				<div className="contact-notes-native-editor" ref={hostRef} />
				{empty && (
					<div className="contact-notes-native-placeholder">
						{placeholder()}
					</div>
				)}
			</div>
			<div className="contact-section-footer contact-notes-footer">
				<button
					type="button"
					className="callander-button"
					onClick={() => void onFlush().then(onOpenEditor)}
				>
					<Icon name="document" />
					<span>Edit markdown</span>
				</button>
			</div>
		</div>
	);
}
