/**
 * `.module.css` imports, compiled by esbuild's built-in `local-css` loader.
 *
 * The default export maps the class names written in the stylesheet to the
 * scoped names esbuild generates (`row` → `ExpenseRow_row`), which is what
 * makes a collision with another file's `.row` impossible.
 *
 * Typed loosely on purpose: esbuild doesn't emit per-file declarations, so a
 * mistyped key can't be caught here. It shows up immediately as an
 * unstyled element rather than as the wrong style, which is the failure
 * mode worth having.
 */
declare module "*.module.css" {
	const classes: Record<string, string>;
	export default classes;
}
