import { createSuite } from "./harness.mjs";
import { fieldLabel, fieldHelp } from "./.build/callander.mjs";

/**
 * Frontmatter keys are camelCase; labels are sentence case. This used to be
 * CSS `text-transform: capitalize`, which treats camelCase as a single word
 * and so rendered "legalName" as "LegalName".
 */
export function run() {
	const { eq, result } = createSuite("field label");

	// ---------- the camelCase split ----------
	eq("camelCase splits", fieldLabel("legalName"), "Legal name");
	eq("...and lowercases the tail", fieldLabel("relatedFiles"), "Related files");
	eq("a single word is just capitalised", fieldLabel("hometown"), "Hometown");
	eq("an already-capital word stays sane", fieldLabel("Email"), "Email");
	eq("three words", fieldLabel("someLongFieldName"), "Some long field name");
	// Sentence case, not Title Case — only the first word is capitalised.
	eq("second word stays lowercase", fieldLabel("jobTitle"), "Job title");
	// A run of capitals is a word boundary before the next capitalised word,
	// so an acronym doesn't get split letter by letter.
	eq("acronyms don't shatter", fieldLabel("URLSlug"), "Url slug");
	eq("underscores become spaces", fieldLabel("favourite_tea"), "Favourite tea");
	eq("hyphens become spaces", fieldLabel("favourite-tea"), "Favourite tea");
	eq("digits don't split a word", fieldLabel("address2"), "Address2");

	// ---------- overrides ----------
	// Where the rule would read badly or the key is terse.
	eq("met reads as a phrase", fieldLabel("met"), "When we met");
	eq("displayName falls out of the rule", fieldLabel("displayName"), "Display name");
	eq("an override beats the rule", fieldLabel("shortName"), "Shortened name");

	// ---------- degenerate input ----------
	eq("empty key falls back to itself", fieldLabel(""), "");
	eq("a custom field still gets a label", fieldLabel("favouriteTea"), "Favourite tea");

	// ---------- help ----------
	eq("a known field has help", typeof fieldHelp("relatedFiles")?.text, "string");
	eq("...and an example where one helps", !!fieldHelp("relatedFiles")?.example, true);
	eq("a field with no example says so", fieldHelp("email")?.example, undefined);
	// Custom fields have none, and the caller renders no button for them.
	eq("an unknown field has no help", fieldHelp("favouriteTea"), null);

	// Every helped field must also be labelled sensibly — a help panel under
	// a raw camelCase label would be the exact bug this replaces.
	const helped = ["displayName", "legalName", "relatedFiles", "jobTitle", "met"];
	eq(
		"helped fields never render a raw camelCase label",
		helped.filter((k) => /[a-z][A-Z]/.test(fieldLabel(k))),
		[]
	);

	return result();
}
