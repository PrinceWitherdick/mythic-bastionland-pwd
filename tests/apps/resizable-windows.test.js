import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const sources = readdirSync(join(root, "module"), { recursive: true })
	.filter((path) => path.endsWith(".js"))
	.map((path) => join(root, "module", path));

/** The window options of each place the system opens a dialog or declares a window. */
function windowOptions(pattern) {
	const found = [];
	for (const path of sources) {
		const text = readFileSync(path, "utf8");
		for (const match of text.matchAll(pattern)) {
			const after = text.slice(match.index, match.index + 600);
			const window = after.match(/\bwindow: (\{[^}]*\})/);
			found.push({ where: `${relative(root, path)} @${match.index}`, window: window?.[1] ?? "" });
		}
	}
	return found;
}

describe("every window can be resized from its corner", () => {
	it("holds for each dialog the system opens and keeps hold of", () => {
		const dialogs = windowOptions(/new foundry\.applications\.api\.DialogV2\(\{/g);
		expect(dialogs.length).toBeGreaterThan(1);
		for (const { where, window } of dialogs) expect(window, where).toMatch(/resizable: true/);
	});

	it("opens every other dialog through apps/ui.js, whose parchment options make it resizable", () => {
		const direct = windowOptions(/DialogV2\.(?:confirm|prompt|input|wait)\(/g).map(({ where }) => where.replace(/ @\d+$/, ""));
		expect(new Set(direct)).toEqual(new Set([join("module", "apps", "ui.js")]));
		const ui = readFileSync(join(root, "module", "apps", "ui.js"), "utf8");
		const calls = ui.match(/DialogV2\.(?:confirm|prompt|input|wait)\(/g);
		expect(calls.length).toBeGreaterThan(3);
		expect(ui.match(/DialogV2\.(?:confirm|prompt|input|wait)\(parchment\(/g)).toHaveLength(calls.length);
		expect(ui).toMatch(/const parchment = [^;]*window: \{ resizable: true, \.\.\.frame \}/);
	});

	it("holds for each window of the system's own, but frameless panels and those that inherit it", () => {
		for (const { where, window } of windowOptions(/static DEFAULT_OPTIONS = \{/g)) {
			if (!window || /frame: false/.test(window)) continue;
			const inherits = /(KnightChooser|MythChooser|SeerChooser|ArtPopout)\.js/.test(where);
			if (!inherits) expect(window, where).toMatch(/resizable: true/);
		}
	});
});
