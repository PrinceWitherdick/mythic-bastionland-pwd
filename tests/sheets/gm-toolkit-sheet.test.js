import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const templateDir = join(root, "templates/actor/gm-toolkit");
const templates = Object.fromEntries(readdirSync(templateDir).map((file) => [file, readFileSync(join(templateDir, file), "utf8")]));

/** @returns {string[]} Every opening tag in a template. */
const tags = (source) => [...source.matchAll(/<([a-z-]+)\b[^>]*>/g)].map((match) => match[0]);

let GmToolkitSheet;

beforeAll(async () => {
	// Just enough of Foundry for the sheet and what it imports to load.
	globalThis.foundry = {
		applications: {
			api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (Base) => class extends Base {}, DialogV2: {} },
			sheets: { ActorSheetV2: class {} }
		}
	};
	({ GmToolkitSheet } = await import("../../module/sheets/GmToolkitSheet.js"));
});

describe("GM Toolkit templates", () => {
	it("send no field on a Realm's pages to the Actor: they carry no name, only a toolkit field", () => {
		for (const [file, source] of Object.entries(templates)) {
			for (const tag of tags(source).filter((candidate) => /^<(input|textarea|select)\b/.test(candidate))) {
				expect(tag, file).not.toMatch(/\sname=/);
				expect(tag, file).toMatch(/\sdata-toolkit-field="\w+"/);
			}
		}
	});

	it("leave the GM's notes as the only thing the sheet's own form saves", () => {
		const named = Object.values(templates).flatMap((source) => tags(source).filter((tag) => /\sname=/.test(tag)));
		expect(named).toEqual([expect.stringMatching(/^<prose-mirror name="system\.notes"/)]);
	});

	it("only ask for actions the sheet has", () => {
		const actions = new Set(Object.values(templates).flatMap((source) => [...source.matchAll(/data-action="(\w+)"/g)].map((match) => match[1])));
		// Foundry's own document sheets pick a new picture this way.
		actions.delete("editImage");
		for (const action of actions) expect(Object.keys(GmToolkitSheet.DEFAULT_OPTIONS.actions), action).toContain(action);
	});

	it("give each page a root that is its tab, in the toolkit's tab group", () => {
		for (const [id, part] of Object.entries(GmToolkitSheet.PARTS)) {
			if (id === "tabs" || id === "header") continue;
			const source = templates[part.template.split("/").at(-1)];
			const [rootTag] = tags(source.replace(/\{\{!--[\s\S]*?--\}\}/g, ""));
			expect(rootTag, id).toMatch(new RegExp(`class="tab [^"]*"`));
			expect(rootTag, id).toContain(`data-tab="${id}"`);
			expect(rootTag, id).toContain('data-group="primary"');
		}
	});
});
