import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OMEN_COUNT } from "../../module/rules/realm.js";
import { TABLE_COLUMNS, TABLE_ROWS, VERSE_LINES, normaliseOwnMyth } from "../../module/rules/own-myths.js";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const sheet = read("module/apps/OwnMythSheet.js");
const template = read("templates/apps/own-myth.hbs");
const actions = read("module/actions/own-myths.js");
const artIndex = read("module/book-art/art-index.js");
const boot = read("mythic-bastionland.js");
const toolkit = read("module/sheets/GmToolkitSheet.js");
const toolkitTemplate = read("templates/actor/gm-toolkit/myths.hbs");
const strings = JSON.parse(read("languages/en.json")).bastionland;

describe("the sheet a written Myth opens with", () => {
	it("writes every field the form names under the Myth, and the picture apart from the form", () => {
		// The form's fields are numbered as the Myth's lists are, so expandObject gives back what normaliseOwnMyth reads.
		expect(sheet).toContain("const data = foundry.utils.expandObject(formData.object);");
		// The picture and the linked Scenes aren't fields, so a keystroke must keep them.
		expect(sheet).toContain("return this.#write((myth) => ({ ...myth, ...data }), update);");
		const form = {
			verse: Object.fromEntries(Array.from({ length: VERSE_LINES }, (_, index) => [index, `Line ${index}`])),
			omens: Object.fromEntries(Array.from({ length: OMEN_COUNT }, (_, index) => [index, `Omen ${index}`])),
			table: { name: "T", columns: { 0: "A", 1: "B" }, rows: Object.fromEntries(Array.from({ length: TABLE_ROWS }, (_, row) => [row, Object.fromEntries(Array.from({ length: TABLE_COLUMNS }, (_, column) => [column, `${row}${column}`]))])) },
			castNote: "Note"
		};
		const myth = normaliseOwnMyth(form);
		expect(myth.verse).toEqual(["Line 0", "Line 1"]);
		expect(myth.omens.at(-1)).toBe(`Omen ${OMEN_COUNT - 1}`);
		expect(myth.table.rows[5]).toEqual(["50", "51"]);
		for (const name of ["name=\"name\"", "name=\"{{name}}\"", "name=\"table.name\"", "name=\"castNote\""]) expect(template).toContain(name);
		expect(sheet).toContain("name: `table.rows.${index}.${column}`");
		expect(sheet).toContain("name: `table.columns.${index}`");
	});

	it("chooses the picture with Foundry's file picker, and can take it away", () => {
		expect(template).toContain('data-action="pickPicture"');
		expect(template).toContain('data-action="clearPicture"');
		expect(sheet).toContain("new (filePicker())({");
	});

	it("writes only what changed, one change after another", () => {
		expect(sheet).toContain("ownMythChanged(before, after) ? { [FLAG_PATH]: after } : {}");
		expect(sheet).toContain("return ownMythWrites(this.document.id);");
	});

	it("keeps what's typed in the next field while the last change saves, and the table's fold as left", () => {
		// Each change saves and so draws the sheet again, which would put back the saved value.
		expect(sheet).toContain("export class OwnMythSheet extends KeepDraftMixin(HandlebarsApplicationMixin(DocumentSheetV2)) {");
		const [fold] = template.match(/<details class="[^"]*__table-fold"[^>]*>/);
		expect(fold).toContain('data-sync="table"');
	});

	it("leaves no empty entry behind when New Myth is closed untouched", () => {
		expect(actions).toContain("entry.sheet.discardIfBlank = true;");
		expect(sheet).toContain("if (game.journal.has(entry.id) && isUntouchedOwnMyth(entry) && !heldByARealm(entry.id)) return entry.delete();");
	});

	it("is the Referee's: made by GMs only, and read-only to anyone else who can open it", () => {
		expect(actions).toMatch(/export async function newOwnMyth\(\) \{\s*if \(!game\.user\.isGM\) return null;/);
		expect(actions).toMatch(/export function addNewMythButton\(element\) \{\s*if \(!game\.user\.isGM\) return;/);
		expect(template).toContain("{{#unless editable}}disabled{{/unless}}");
		expect(sheet).toMatch(/static #onSubmit\(_event, _form, formData\) \{\s*if \(!this\.isEditable\) return;/);
	});

	it("says Referee, never GM, to the people reading it", () => {
		for (const text of Object.values(strings.ownMyth)) expect(text).not.toMatch(/\bGM\b/);
		for (const key of ["yours", "yoursTooltip", "write", "ownReference"]) expect(strings.mythChooser[key]).not.toMatch(/\bGM\b/);
	});
});

describe("Scenes linked to a written Myth's Omens", () => {
	it("takes a Scene dropped on an Omen, and shows each with a way to view it and to unlink it", () => {
		expect(template).toContain('<li data-omen="{{number}}" data-omen-drop>');
		expect(template).toContain('{{> "bastionland.omen-scenes" editable=@root.editable}}');
		expect(sheet).toMatch(/viewOmenScene: OwnMythSheet\.#onViewScene,\s*unlinkOmenScene: OwnMythSheet\.#onUnlinkScene/);
		expect(sheet).toContain('this.element.querySelectorAll("[data-omen-drop]")');
		// The Omen is read before the drop is awaited, while the event still has its target.
		expect(sheet).toMatch(/const omen = Number\(event\.currentTarget\.dataset\.omen\);\s*const scene = await droppedScene\(event\);/);
		expect(sheet).toContain("scenes: omenSceneChips(myth.scenes[index])");
	});

	it("writes only the Scenes when the Toolkit links one, leaving whatever is being typed alone", () => {
		expect(actions).toContain("await entry.update({ [`flags.${SYSTEM_ID}.${OWN_MYTH_FLAG}.scenes`]: after });");
	});

	it("says Referee, never GM", () => {
		for (const text of Object.values(strings.omenScenes)) expect(text).not.toMatch(/\bGM\b/);
	});
});

describe("a written Myth wherever a Myth is read", () => {
	it("is looked up in the one place every Myth is, from its Journal entry", () => {
		expect(artIndex).toContain("if (isOwnMyth(myth)) return ownMythLookup(myth);");
		expect(artIndex).toContain("if (!isTableRoll(myth) && !isOwnMyth(myth))");
	});

	it("is opened from the Journal directory's New Myth and from its card in the Referee Toolkit", () => {
		expect(boot).toContain("addNewMythButton(element);");
		expect(boot).toContain('label: "bastionland.ownMyth.sheet"');
		expect(toolkitTemplate).toContain('data-action="editOwnMyth"');
		expect(toolkit).toContain("editOwnMyth: GmToolkitSheet.#onEditOwnMyth");
		expect(toolkit).toContain("own: isOwnMyth(myth) && entry ? myth.own : null,");
		// Renamed, repictured or rewritten, it's drawn again wherever the Realm's Myths are, and only when the Realm holds it.
		expect(toolkit).toContain("if (isOwnMythEntry(entry) && scene && mythWithOwn(getRealm(scene)?.realm.myths ?? [], entry.id)) this.#redraw(...REALM_TABS, \"time\");");
	});

	it("is named without a page, which it hasn't got, on the cards and in the windows", () => {
		expect(read("templates/chat/realm-key.hbs")).toContain('{{#if page}}{{localize "bastionland.realm.key.page" page=page}}, {{/if}}');
		expect(read("templates/chat/wilderness.hbs")).toContain('{{#if myth.page}} <span class="bastionland-card__hint">');
		// One helper names a thing with its page, or alone where it has none.
		expect(artIndex).toContain('export const withPage = (name, page) => (page ? t("realm.panel.reference", { name, page }) : name);');
		expect(artIndex).toContain('export const pageNote = (page) => (page ? t("realm.key.page", { page }) : null);');
		expect(read("module/actions/hex-lore.js")).toContain("withPage(name, page)");
		expect(read("module/actions/starts.js")).toContain('tagline: page ? t("company.starts.courtier.newsTagline", { name, page }) : name,');
		expect(read("module/actions/people.js")).toContain('t(known.page ? "people.heardOfPage" : "people.heardOf",');
		expect(read("module/apps/hex-edit.js")).toContain("reference: withPage(name, page),");
		expect(toolkit).toContain('tagline: page ? t("gmToolkit.myths.tableTagline", { name, page }) : t("gmToolkit.myths.ownTableTagline", { name }),');
	});
});
