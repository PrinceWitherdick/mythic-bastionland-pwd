import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
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
 * Every `DialogV2.something({ ... })` and `new DialogV2({ ... })` in a script,
 * as the source of its options object. Brace counting is enough here: the
 * options are object literals, and none of them holds a brace inside a string.
 * @param {string} source
 * @returns {string[]}
 */
function dialogOptions(source) {
	const calls = [];
	for (const match of source.matchAll(/DialogV2(?:\.\w+)?\(\s*\{/g)) {
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

	// A window that writes its own dialog markup has no standard-form to make
	// its body a column, so without this its rows sit with no gap between them.
	it("lays a hand-written dialog body out as a column", () => {
		const chat = readFileSync(join(root, "styles/chat.css"), "utf8").replace(/\s+/g, " ");
		expect(chat).toContain(".bastionland-dialog :is(.dialog-form, .dialog-content) { display: flex; flex-direction: column; }");
	});

	// Nor a footer laid out as a row: its Done button (Fog of War, Visited marks) would sit at the
	// left at its own width, not fill the row as a Foundry dialog's buttons do.
	it("lays a hand-written dialog footer out as a row", () => {
		const chat = readFileSync(join(root, "styles/chat.css"), "utf8").replace(/\s+/g, " ");
		expect(chat).toMatch(/\.bastionland-dialog \.form-footer \{ display: flex; flex-wrap: wrap; align-items: center;/);
	});

	// The body scrolls, and scrolling clips at its edge: with nothing below it, the bottom
	// border of a button that ends the body (Fog of War's brush) was cut off at some sizes.
	it("leaves room below a scrolling dialog body's last row", () => {
		const chat = readFileSync(join(root, "styles/chat.css"), "utf8").replace(/\s+/g, " ");
		const rule = chat.match(/\.bastionland-dialog \.dialog-content \{([^}]*)\}/)?.[1] ?? "";
		expect(rule).toContain("overflow-y: auto");
		expect(rule).toMatch(/padding-bottom: [1-9]/);
	});
});

describe("dialog templates", () => {
	// A dialog's own template, not the partials under parts/, which are pieces of one.
	const bodies = walk(join(root, "templates", "dialogs"), ".hbs").filter((file) => !file.includes(`${sep}parts${sep}`));

	it.each(bodies.map((file) => [relative(root, file), file]))("%s opens with the dialog body", (_name, file) => {
		expect(readFileSync(file, "utf8").trimStart()).toMatch(/^<div class="bastionland-dialog__body\b/);
	});
});
