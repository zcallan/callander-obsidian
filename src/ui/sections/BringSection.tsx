import { useRef } from "react";
import type { PlanBringItem } from "@/types";
import { Icon } from "@/ui/components/Icon";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/**
 * What to bring — a checklist with an inline add row.
 *
 * The add box is deliberately uncontrolled: its value is read on submit and
 * cleared by hand. A controlled input would re-render this list on every
 * keystroke, and there is nothing on screen that depends on what's half
 * typed.
 */
export function BringSection({
	store,
	items,
	onToggle,
	onRemove,
	onAdd,
}: {
	store: ViewStore;
	items: () => PlanBringItem[];
	onToggle: (index: number, done: boolean) => void;
	onRemove: (index: number) => void;
	onAdd: (text: string) => void;
}) {
	useViewRevision(store);
	const rows = items();
	const input = useRef<HTMLInputElement>(null);

	const submit = () => {
		const text = input.current?.value.trim() ?? "";
		if (!text) return;
		onAdd(text);
		if (input.current) input.current.value = "";
	};

	return (
		<div className="contact-ideas-section plan-items-section">
			{rows.length === 0 && (
				<div className="section-helper-text">
					Trip-specific stuff — swimwear, speakers, meat for the BBQ.
					Toothbrushes can look after themselves.
				</div>
			)}

			{rows.map((item, index) => (
				// Index as key: the list is rebuilt wholesale from
				// frontmatter and has no reorder, so there is no identity for
				// a stable key to preserve.
				<div
					key={index}
					className={`contact-idea-item ${item.done ? "done" : ""}`}
				>
					<input
						type="checkbox"
						aria-label="Sorted / packed"
						checked={item.done}
						onChange={(e) =>
							onToggle(index, e.currentTarget.checked)
						}
					/>
					<div className="contact-idea-text">{item.text}</div>
					<button
						className="callander-button button-icon button-danger"
						aria-label="Remove item"
						onClick={() => onRemove(index)}
					>
						<Icon name="trash-2" />
					</button>
				</div>
			))}

			<div className="contact-ideas-add-row plan-bring-add-row">
				<input
					ref={input}
					className="contact-field-input"
					type="text"
					placeholder="Add something to bring..."
					onKeyDown={(e) => {
						if (e.key !== "Enter") return;
						// Otherwise Enter would submit any form this ends up
						// inside, with the text still sitting in the box.
						e.preventDefault();
						submit();
					}}
				/>
				<button className="callander-button" onClick={submit}>
					<Icon name="plus" />
					<span>Add</span>
				</button>
			</div>
		</div>
	);
}
