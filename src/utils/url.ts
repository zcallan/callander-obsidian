/**
 * A link field is stored however it was typed — "example.com", not
 * necessarily "https://example.com" — so anything that opens or shares it
 * needs the full form first, or "example.com" resolves relative to the
 * vault instead of the web.
 */
export function normalizeUrl(raw: string): string {
	// mailto:, tel: and sms: have no "//". Named rather than any `word:`,
	// which would take "localhost:3000" for a scheme too.
	return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || /^(mailto|tel|sms):/i.test(raw)
		? raw
		: `https://${raw}`;
}
