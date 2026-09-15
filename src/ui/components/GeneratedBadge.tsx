import styles from "@/components/GeneratedBadge.module.css";
import { GENERATED_LABEL, GENERATED_TITLE } from "@/utils/generated";

/** Marks an entry Claude added. Renders nothing for hand-typed ones. */
export function GeneratedBadge({ generated }: { generated?: boolean }) {
	if (!generated || !GENERATED_LABEL) return null;
	return (
		<span className={styles.badge} title={GENERATED_TITLE}>
			{GENERATED_LABEL}
		</span>
	);
}
