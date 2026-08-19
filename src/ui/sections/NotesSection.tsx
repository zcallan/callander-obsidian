import { useEffect, useRef } from "react";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/**
 * The free-text notes on a person, group or plan.
 *
 * The textarea is uncontrolled on purpose. It is the one field on this page
 * edited in place rather than through a modal, and a controlled value would
 * re-render — and reset the caret — on every keystroke. React only sets its
 * value when the stored text actually differs from what's on screen, which
 * is what lets an edit from another device land without stealing the caret
 * from someone typing.
 *
 * Saving is on `change` (blur), matching the imperative version: this text
 * runs long, and writing the file on every pause would churn the vault.
 */
export function NotesSection({
	store,
	value,
	placeholder,
	onSave,
}: {
	store: ViewStore;
	value: () => string;
	/** A function, not a value: an island is created once and kept, so a
	 * plain prop would freeze at whatever it was when the view first
	 * rendered — and this page can be re-pointed at a different file. */
	placeholder: () => string;
	onSave: (text: string) => void;
}) {
	useViewRevision(store);
	const stored = value();
	const ref = useRef<HTMLTextAreaElement>(null);

	// Grows to fit rather than scrolling in a fixed box — the same trick the
	// imperative version used, driven off the element's own scrollHeight.
	const fit = () => {
		const el = ref.current;
		if (!el) return;
		el.classList.add("measuring");
		el.style.setProperty("--scroll-height", `${el.scrollHeight}px`);
		el.classList.remove("measuring");
	};

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		// Only when it genuinely differs: assigning unconditionally would
		// reset the caret to the end mid-sentence on every re-render.
		if (el.value !== stored) el.value = stored;
		fit();
	}, [stored]);

	return (
		<div className="contact-notes-section">
			<textarea
				ref={ref}
				className="contact-notes-input"
				placeholder={placeholder()}
				defaultValue={stored}
				onInput={fit}
				onChange={(e) => onSave(e.currentTarget.value)}
			/>
		</div>
	);
}
