import styles from "@/components/GeneratedBadge.module.css";
import { GENERATED_LABEL, GENERATED_TITLE } from "@/utils/generated";

/**
 * Imperative twin of `<GeneratedBadge>` — same class, same words.
 *
 * `onRemove`, when given, turns the badge interactive: a small × that clears
 * the flag. Only ever passed from somewhere already editing the entry — the
 * badge on a plain read-only list stays a label, not a control, so a tap
 * meant for the row underneath it can't accidentally strip the provenance.
 */
export function appendGeneratedBadge(
	parent: HTMLElement,
	generated: boolean | undefined,
	onRemove?: () => void
): void {
	if (!generated || !GENERATED_LABEL) return;
	const badge = parent.createSpan({
		cls: onRemove ? `${styles.badge} ${styles.removable}` : styles.badge,
		attr: { title: GENERATED_TITLE },
	});
	badge.createSpan({ text: GENERATED_LABEL });
	if (onRemove) {
		const remove = badge.createEl("button", {
			cls: styles.remove,
			text: "\u00d7",
			attr: { type: "button", "aria-label": "Remove AI tag" },
		});
		remove.addEventListener("click", (e) => {
			// The badge itself carries no click handler today, but stopping
			// this from bubbling costs nothing and keeps the two independent
			// if that ever changes.
			e.stopPropagation();
			onRemove();
		});
	}
}
