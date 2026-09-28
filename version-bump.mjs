import { readFileSync, writeFileSync } from "fs";

// Run by `npm version <x.y.z>`, which sets npm_package_version. Run any
// other way it has no version to write, and used to drop `version` from
// manifest.json and add an "undefined" key to versions.json.
const version = process.env.npm_package_version;
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
	console.error("version-bump: run through `npm version <x.y.z>`");
	process.exit(1);
}

const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const write = (file, data) =>
	writeFileSync(file, JSON.stringify(data, null, "\t") + "\n");

const manifest = read("manifest.json");
if (!manifest.minAppVersion) {
	console.error("version-bump: manifest.json has no minAppVersion");
	process.exit(1);
}
// Spread, so both files keep their key order.
write("manifest.json", { ...manifest, version });
write("versions.json", { ...read("versions.json"), [version]: manifest.minAppVersion });
