import { createSuite } from "./harness.mjs";
import { linkpathOf } from "./.build/callander.mjs";

/** The lenient unwrap every "does this entry point at that note" check uses. */
export function run() {
	const { eq, result } = createSuite("link path");

	eq("a link", linkpathOf("[[Ann Lee]]"), "Ann Lee");
	eq("an aliased link keeps the note, not the label", linkpathOf("[[Ann Lee|Annie]]"), "Ann Lee");
	eq("plain text passes through for the resolver", linkpathOf("Ann Lee"), "Ann Lee");
	eq("a name with a bracket in it", linkpathOf("[[Sci-Fi [Book Club]]]"), "Sci-Fi [Book Club]");
	eq("inner space is trimmed", linkpathOf("[[ Ann | A ]]"), "Ann");
	eq("empty stays empty", linkpathOf(""), "");

	return result();
}
