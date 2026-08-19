import { useEffect, useRef } from "react";
import { setIcon } from "obsidian";

/**
 * An Obsidian icon, which React can't render directly.
 *
 * `setIcon` writes an `<svg>` into an element by hand — imperative DOM
 * mutation inside a tree React believes it owns. Confining that to one
 * component keeps the escape hatch in a single place, and means a rename of
 * a Lucide id is one search rather than one per button.
 *
 * The effect re-runs on `name` so a chevron that flips with state actually
 * changes; without it the first icon would be painted and then frozen.
 */
export function Icon({ name, className }: { name: string; className?: string }) {
	const ref = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		setIcon(el, name);
		// React didn't create this SVG, so it won't remove it either — clear
		// it before the next paint or a changed name leaves both behind.
		return () => el.empty();
	}, [name]);

	return <span ref={ref} className={className} />;
}
