import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fitCards } from "../../module/apps/ui.js";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const app = read("module/apps/MythChooser.js");
const template = read("templates/apps/myth-chooser.hbs");
const keepApp = read("module/apps/keep-realm.js");
const keepTemplate = read("templates/dialogs/keep-realm.hbs");
const realm = read("module/actions/realm.js");
const hooks = read("module/canvas/realm-hooks.js");
const styles = read("styles/mythic-bastionland.css");
const panel = read("module/apps/RealmPanel.js");
const panelTemplate = read("templates/apps/realm-panel.hbs");
const toolkit = read("module/sheets/GmToolkitSheet.js");
const toolkitTemplate = read("templates/actor/gm-toolkit/myths.hbs");

describe("the window for a Realm's Myths", () => {
	it("shows the Realm's own beside the book's whole table", () => {
		expect(template).toContain('data-action="chooseMyth"');
		expect(template).toContain('data-action="showGroup"');
		expect(template).toContain('data-action="pick"');
		expect(app).toContain("inGroup: roll.d6 === this.group");
		expect(template).toContain("{{#unless inGroup}}hidden{{/unless}}");
	});

	it("searches the whole table by name or roll, without drawing the window again", () => {
		expect(template).toContain('<input type="search" name="search"');
		expect(template).toContain('data-search="{{searchText}}"');
		// Every d6 result's Myths are drawn, and the search only hides the ones it doesn't find.
		expect(app).toContain("cards: mythRolls().map((roll) => {");
		expect(app).toContain("card.dataset.search.includes(term)");
		expect(app).not.toMatch(/addEventListener\("input"[^}]*this\.render\(/);
		// Choosing a d6 result lets the search go.
		expect(app).toContain('querySelector(".bastionland-chooser__groups")?.addEventListener("click"');
		expect(template).toContain("bastionland-myth-chooser__none");
	});

	it("offers one Myth rolled again, all of them rolled again, and one chosen by hand", () => {
		for (const action of ["rollMyth", "rollAll", "useRoll"]) {
			expect(template, action).toContain(`data-action="${action}"`);
			expect(app, action).toContain(`${action}:`);
		}
	});

	it("changes only which Myth it is: the number and the hex stay as they were", () => {
		// Every change goes through the one place, which puts the Myth back in its own hex under its own number.
		expect(app).toContain('const placeMyth = (realm, g, { number, hex, d6, d12 }) => placeFeature(realm, g, hex, { kind: "myth", number, d6, d12, omen: 0 });');
		expect(app).toContain("placeMyth(realm, g, { ...myth, d6: roll.d6, d12: roll.d12 })");
		expect(app).toContain("rolled.reduce((next, myth) => placeMyth(next, g, myth), realm)");
	});

	it("never lets a Realm hold the same Myth twice", () => {
		// The roller only ever offers a Myth the Realm hasn't got...
		expect(app).toContain("rollFreeMyth(freshRandom(), myths)");
		// ...and one already in the Realm can be looked at, but not taken.
		expect(app).toContain("free: !held");
		expect(template).toContain("{{#unless picked.free}}disabled{{/unless}}");
	});

	it("rolls with the Realm's own dice, not the table's, since it's the Realm being made", () => {
		expect(app).toContain("createRandom(randomSeed())");
		expect(app).not.toContain("new Roll(");
	});

	it("is the GM's, and draws itself again as the Realm changes under it", () => {
		expect(app).toContain("if (!game.user.isGM || !scene) return null;");
		expect(hooks).toContain("refreshMythChooser(sceneId);");
	});

	it("lays the Realm's Myths out down one side and the table down the other", () => {
		expect(styles).toMatch(/\.bastionland-chooser__layout--myths \{[^}]*grid-template-columns:/);
		expect(template).toContain("bastionland-chooser__layout--myths");
	});
});

describe("settling the Myths while a rolled Realm is looked over", () => {
	it("is offered from Keep this Realm, beside rolling the whole Realm again", () => {
		expect(keepTemplate).toContain("data-keep-myths");
		expect(keepTemplate.indexOf("data-keep-again")).toBeLessThan(keepTemplate.indexOf("data-keep-myths"));
		expect(keepApp).toContain('element?.querySelector("[data-keep-myths]")');
	});

	it("is left out of a Realm set up without Myths", () => {
		expect(keepApp).toContain("myths: Boolean(myths) && realm.myths.length > 0");
		expect(keepApp).toContain("if (myths) myths.hidden = !realm.myths.length;");
	});

	it("opens on the Scene being made, and is put away once the Realm is kept", () => {
		const creating = realm.slice(realm.indexOf("export async function createRealmScene"), realm.indexOf("async function refreshThumbnail"));
		expect(creating).toContain("openMythChooser({ scene })");
		expect(creating).toContain("await closeMyths?.();");
	});
});

describe("settling the Myths of a Realm already made", () => {
	it("is offered on the Hex panel beside the Myth's own roll", () => {
		expect(panelTemplate).toContain('data-action="chooseMyth"');
		expect(panelTemplate.indexOf('data-action="rollMyth"')).toBeLessThan(panelTemplate.indexOf('data-action="chooseMyth"'));
		expect(panel).toContain("chooseMyth: RealmPanel.#onChooseMyth");
		// Opened from a hex, the window opens on the Myth lying in it.
		expect(panel).toContain("openMythChooser({ scene, number: myth.number })");
	});

	it("is offered on the GM Toolkit's Myths page, where the Realm's Myths are read", () => {
		expect(toolkitTemplate).toContain('data-action="settleMyths"');
		expect(toolkit).toContain("settleMyths: GmToolkitSheet.#onSettleMyths");
		expect(toolkit).toContain("openMythChooser({ scene, number: myth?.number ?? null })");
		// Loaded when one is asked for, so the Toolkit doesn't carry a window it may never show.
		expect(toolkit).toContain('await import("../apps/MythChooser.js")');
	});

	it("turns the table to the page of the Myth it was opened on", () => {
		expect(app).toContain("if (myth) chooser.group = myth.d6;");
	});
});

describe("the Myths table filling the window", () => {
	// Twelve Myths, 8px apart, pictured anywhere from 5:2 to 3:2, 12px narrower than their card and 55px shorter.
	const space = { count: 12, gap: 8, widest: 2.5, tallest: 1.5, inset: 12, extra: 55, min: 144, max: 384 };
	const used = ({ columns, size, art }) => {
		const rows = Math.ceil(12 / columns);
		return { width: columns * size + (columns - 1) * 8, height: rows * (art + 55) + (rows - 1) * 8 };
	};

	it("draws the pictures larger as the window grows, in as many columns as that takes", () => {
		const small = fitCards({ ...space, width: 740, height: 520 });
		const large = fitCards({ ...space, width: 1200, height: 900 });
		expect(small).not.toBeNull();
		expect(large.size).toBeGreaterThan(small.size);
		expect(large.art).toBeGreaterThan(small.art);
	});

	it("keeps every card in sight, and every picture between its widest and tallest shapes", () => {
		for (const [width, height] of [[740, 520], [729, 670], [1200, 900], [600, 1400], [1600, 500]]) {
			const fit = fitCards({ ...space, width, height });
			const drawn = used(fit);
			expect(drawn.width, `${width}x${height}`).toBeLessThanOrEqual(width);
			expect(drawn.height, `${width}x${height}`).toBeLessThanOrEqual(height);
			const shape = (fit.size - 12) / fit.art;
			expect(shape, `${width}x${height}`).toBeGreaterThanOrEqual(1.5);
			expect(shape, `${width}x${height}`).toBeLessThanOrEqual(2.5 + 0.05);
		}
	});

	it("takes the height where a 2:1 picture would leave a third of it: the window the GM saw", () => {
		// 729 by 670: at 2:1 only four columns fit, three rows, leaving 250px below them.
		const fit = fitCards({ ...space, width: 729, height: 670 });
		expect(fit.columns).toBe(3);
		expect(670 - used(fit).height).toBeLessThan(40);
	});

	it("keeps the footer one height, so picking a Myth doesn't set the table moving", () => {
		const footer = template.slice(template.indexOf("bastionland-myth-chooser__footer"));
		// The button and the note's line are drawn whether or not a Myth is picked, the button unseen until one is.
		expect(footer.indexOf('data-action="useRoll"')).toBeGreaterThan(footer.indexOf("{{/with}}"));
		expect(footer).toContain("{{#unless offer}} is-held{{/unless}}");
		expect(footer).toContain("{{else}}&nbsp;{{/if}}</p>");
		expect(styles).toMatch(/\.bastionland-myth-chooser__footer \.bastionland-button\.is-held \{\s*visibility: hidden;/);
	});

	it("reflows rather than keeping a set number of columns: a tall window takes fewer", () => {
		expect(fitCards({ ...space, width: 800, height: 1600 }).columns).toBeLessThan(fitCards({ ...space, width: 1600, height: 500 }).columns);
	});

	it("sizes in whole pixels, no card wider than the largest", () => {
		const fit = fitCards({ ...space, count: 1, width: 1000, height: 1000 });
		expect(fit).toEqual({ columns: 1, size: 384, art: 248 });
		const odd = fitCards({ ...space, width: 999, height: 777 });
		expect(Number.isInteger(odd.size) && Number.isInteger(odd.art)).toBe(true);
	});

	it("leaves the table to scroll when even the smallest cards won't all fit", () => {
		expect(fitCards({ ...space, width: 400, height: 200 })).toBeNull();
	});

	it("is fitted again as the window is resized and as a search finds more or fewer", () => {
		expect(app).toContain("new ResizeObserver(() => this.#fitTable())");
		expect(app).toContain("this.#resizing?.disconnect();");
		expect(app.slice(app.indexOf("#applySearch() {"))).toContain("this.#fitTable();");
		expect(styles).toContain("grid-template-columns: repeat(var(--myth-columns), var(--myth-card));");
		expect(styles).toContain("height: var(--myth-art);");
	});

	it("grows the Realm's own rows with their column, and lines up their numbers", () => {
		expect(styles).toMatch(/\.bastionland-myth-chooser__realm \{[^}]*container-type: inline-size;/);
		expect(styles).toMatch(/\.bastionland-myth-chooser__thumb \{[^}]*width: clamp\(/);
		expect(styles).toMatch(/\.bastionland-myth-chooser__pick \{[^}]*justify-content: flex-start;/);
	});
});
