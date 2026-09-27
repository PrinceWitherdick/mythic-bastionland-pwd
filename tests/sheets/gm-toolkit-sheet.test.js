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
			apps: { ImagePopout: class {} },
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
		// A <details> name only groups folds so one opens at a time; forms never send it.
		const named = Object.values(templates).flatMap((source) => tags(source).filter((tag) => /\sname=/.test(tag) && !tag.startsWith("<details")));
		expect(named).toEqual([expect.stringMatching(/^<prose-mirror name="system\.notes"/)]);
	});

	it("fold the Myths as one group, so opening one folds the one open before", () => {
		const [card] = tags(templates["myths.hbs"]).filter((tag) => tag.includes("data-myth-card"));
		expect(card).toMatch(/^<details\b/);
		expect(card).toContain('name="{{@root.mythGroup}}"');
	});

	it("mark an Omen by clicking its row, rather than stepping a count", () => {
		const source = templates["myths.hbs"];
		// The row itself, and the numbered disc in it, which is the keyboard's target.
		const marks = tags(source).filter((tag) => tag.includes('data-action="markOmen"'));
		expect(marks).toHaveLength(2);
		for (const mark of marks) expect(mark).toContain('data-omen="{{number}}"');
		expect(source).not.toContain("omenStep");
		expect(source).not.toContain("nextOmen");
	});

	it("offer a Myth as resolved at any Omen, until it is", () => {
		const source = templates["myths.hbs"];
		const before = source.slice(0, source.indexOf('data-action="mythResolved"'));
		// The block the button sits in: anything not resolved already.
		const blocks = [...before.matchAll(/\{\{(?:#if|else if|else|\/if)[^}]*\}\}/g)];
		expect(blocks.at(-1)[0]).toBe("{{else}}");
		expect(blocks.at(-2)[0]).toBe("{{#if resolved}}");
		expect(source).not.toContain("awaitOmens");
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
