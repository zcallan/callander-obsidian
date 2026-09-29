/**
 * Wrap a method on a shared object — a prototype other plugins may patch
 * too — so that removing the wrap is always safe.
 *
 * Removal puts the original back only while this wrap is still the
 * outermost. If something else wrapped it afterwards, the method is left
 * alone and this wrap just stops doing anything: it passes every call
 * straight through, so the other patch keeps working and this one can't
 * act for a plugin that has unloaded.
 */
export function patchMethod<T extends object, K extends keyof T>(
	target: T,
	name: K,
	wrap: (original: T[K]) => T[K]
): () => void {
	const original = target[name];
	let live = true;
	const wrapped = wrap(original) as unknown as (...args: unknown[]) => unknown;
	const guarded = function (this: unknown, ...args: unknown[]) {
		const call = live
			? wrapped
			: (original as unknown as (...a: unknown[]) => unknown);
		return call.apply(this, args);
	} as unknown as T[K];
	target[name] = guarded;
	return () => {
		live = false;
		if (target[name] === guarded) target[name] = original;
	};
}
