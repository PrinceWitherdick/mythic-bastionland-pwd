import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");

/** @returns {string[]} Every file under `dir` with the given extension. */
function walk(dir, extension) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return walk(path, extension);
		return extname(entry.name) === extension ? [path] : [];
	});
}

/**
 * Every `DialogV2.something({ ... })` in a script, as the source of its
 * options object. Brace counting is enough here: the options are object
 * literals, and none of them holds a brace inside a string.
 * @param {string} source
 * @returns {string[]}
 */
function dialogOptions(source) {
	const calls = [];
	for (const match of source.matchAll(/DialogV2\.\w+\(\s*\{/g)) {
		let depth = 0;
		let index = match.index + match[0].length - 1;
		do {
			if (source[index] === "{") depth += 1;
			else if (source[index] === "}") depth -= 1;
			index += 1;
		} while (depth > 0 && index < source.length);
		calls.push(source.slice(match.index, index));
	}
	return calls;
}

const scripts = walk(join(root, "module"), ".js");
const dialogs = scripts.flatMap((file) => dialogOptions(readFileSync(file, "utf8")).map((call) => [relative(root, file), call]));

describe("dialogs", () => {
	it("opens some", () => {
		expect(dialogs.length).toBeGreaterThan(0);
	});

	// Without it a dialog arrives in Foundry's own colours, beside sheets and
	// cards that paint their own parchment.
	it.each(dialogs)("%s asks for the system's own look", (_file, call) => {
		expect(call).toContain("\"bastionland-dialog\"");
	});

	it("has a skin for that class", () => {
		const styles = ["styles/mythic-bastionland.css", "styles/chat.css"]
			.map((name) => readFileSync(join(root, name), "utf8"))
			.join("\n");
		expect(styles).toContain(".bastionland-dialog .window-content");
		expect(styles).toContain(".bastionland-dialog .dialog-form");
	});
});

describe("dialog templates", () => {
	const bodies = walk(join(root, "templates", "dialogs"), ".hbs");

	it.each(bodies.map((file) => [relative(root, file), file]))("%s opens with the dialog body", (_name, file) => {
		expect(readFileSync(file, "utf8").trimStart()).toMatch(/^<div class="bastionland-dialog__body\b/);
	});
});
