import { readFileSync } from "node:fs";
import { join } from "node:path";
import Handlebars from "handlebars";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const template = read("templates/apps/realm-drawing.hbs");
const app = read("module/apps/RealmDrawing.js");
const layer = read("module/canvas/RealmLayer.js");
const palette = read("templates/apps/realm-panel.hbs");
const swatch = read("templates/apps/parts/realm-swatch.hbs");
const count = read("templates/apps/parts/realm-count.hbs");

describe("Creating a Realm", () => {
	it("has no Paint the Realm button and no page link at its head, and Undo and Redo at the rail's foot", () => {
		const head = /<header class="bastionland-rail-dialog__banner">([\s\S]*?)<\/header>/.exec(template)[1];
		expect(head).not.toContain('data-tool="');
		expect(head).not.toContain("openPage");
		expect(head).not.toContain("bastionland-travel-rules__page");
		expect(head).not.toContain("data-action=");
		const history = /<div class="bastionland-realm-drawing__history">([\s\S]*?)<\/div>/.exec(template)[1];
		expect([...history.matchAll(/data-action="(\w+)"/g)].map((match) => match[1])).toEqual(["undo", "redo"]);
		expect(app).not.toContain("pageContext");
	});

	it("lays each step's part of the palette beside it, from the palette's own swatches", () => {
		expect(template).toContain('{{#each palette.swatches}}{{> "bastionland.realm-swatch" this}}{{/each}}');
		expect(palette).toContain('{{#each swatches.terrain}}{{> "bastionland.realm-swatch" this}}{{/each}}');
		expect(app).toContain("swatches: swatches[step.brush]");
		for (const action of ["pickBrush", "toggleSeat", "clearRiver", "undo", "redo"]) expect(app).toContain(`${action}: RealmDrawing.#on`);
	});

	it("tells the GM of an imported map to paint every hex, at the head of the first page and on the Pictures page", () => {
		// The steps' pages alone, which need no Foundry helpers or partials.
		const pages = /\{\{#each groups\}\}[\s\S]*?\n\t\t\t\{\{\/each\}\}/.exec(template)[0];
		const render = (context) => Handlebars.compile(pages)(context);
		const groups = [{ key: "wilderness", active: true, sections: [] }, { key: "holdings", sections: [] }];
		const paintEveryHex = { heading: "Paint every hex", text: "Your map is only a picture.", done: false };
		const html = render({ groups, paintEveryHex, company: { picture: {} }, picture: null });
		expect(html.match(/bastionland-realm-drawing__paint-all/g)).toHaveLength(1);
		expect(html).toMatch(/data-rail-page="wilderness"[^>]*>\s*(?:<!--[\s\S]*?-->\s*)?<div class="bastionland-realm-drawing__paint-all" role="note">/);
		expect(html).toContain("fa-paintbrush");
		const done = render({ groups, paintEveryHex: { ...paintEveryHex, done: true }, company: { picture: {} } });
		expect(done).toContain("bastionland-realm-drawing__paint-all is-done");
		// A Realm drawn in the system's own ink has no picture, so no such notice.
		expect(render({ groups, paintEveryHex: null, company: { picture: {} } })).not.toContain("paint-all");
		expect(app).toContain("paintEveryHex: picture ? {");
		expect(app).toContain('paintNext: text("paintNext")');
		expect(template).toContain("{{picture.paintNext}}");
	});

	it("ends on the Company's page: their picture, and a button that takes them up to place", () => {
		const newRealm = read("templates/dialogs/new-realm.hbs");
		const realmActions = read("module/actions/realm.js");
		expect(app).toMatch(/\.\.\.groups\.map\([^\n]*\),\s*\{ key: "company", icon: "fa-flag"/);
		expect(template).toContain('data-rail-page="company"');
		expect(template).toContain('{{> "bastionland.company-picture" company.picture}}');
		expect(template).toContain('data-action="placeCompany"');
		expect(app).toContain("placeCompany: RealmDrawing.#onPlaceCompany");
		// So New Realm doesn't ask about the Company for a Realm drawn by hand or imported.
		expect(newRealm).toMatch(/\{\{#unless draw\}\}\s*<section class="bastionland-rail-dialog__page" data-rail-page="company"/);
		expect(realmActions).toContain('...(draw ? [] : [{ key: "company", icon: "fa-flag"');
		// Closed early, the button over the map takes the Company up instead.
		expect(app).toMatch(/_onClose\(options\) \{[\s\S]*?showCompanyButton\(\);\s*\}/);
	});

	it("leaves the palette's window shut while a Realm is drawn by hand", () => {
		expect(layer).toMatch(/name === "terrain" && isRealmScene\(canvas\.scene\) && !isDrawingRealm\(canvas\.scene\)\) openRealmPanel/);
		expect(app).toMatch(/showFinish\(\);\s*\/\/[^\n]*\n\s*closeRealmPalette\(\);/);
	});
});

describe("a palette swatch", () => {
	const render = (context) => {
		const handlebars = Handlebars.create();
		handlebars.registerPartial("bastionland.realm-count", count);
		return handlebars.compile(swatch)(context);
	};

	it("takes up its brush, marked while it's in hand", () => {
		const html = render({ brush: 5, label: "5. Forest", src: "forest.webp", active: true });
		expect(html).toContain('data-action="pickBrush" data-brush="5"');
		expect(html).toContain('aria-pressed="true"');
		expect(html).toMatch(/class="bastionland-realm-panel__swatch is-active"/);
		expect(html).toContain('<img src="forest.webp"');
		expect(html).toContain("<span>5. Forest</span>");
	});

	it("draws an icon where it has no picture, a row of its own when wide, and a count when it has one", () => {
		const barrier = render({ brush: "barrier", label: "Lay Barriers", icon: "fa-solid fa-road-barrier", wide: true, active: false });
		expect(barrier).toContain('<i class="fa-solid fa-road-barrier" inert></i>');
		expect(barrier).toContain("bastionland-realm-panel__swatch--wide");
		expect(barrier).toContain('aria-pressed="false"');
		expect(barrier).not.toContain("bastionland-realm-panel__tally");
		const tower = render({ brush: "tower", label: "Tower", src: "tower.webp", tally: { count: 0, met: false, over: false }, active: false });
		expect(tower).toMatch(/<em class="bastionland-realm-panel__tally is-none\s*">0<\/em>/);
	});

	it("ticks the Seat of Power rather than taking up a brush", () => {
		const html = render({ action: "toggleSeat", label: "Seat of Power", src: "seat.webp", wide: true, tooltip: "The next Holding", active: true });
		expect(html).toContain('data-action="toggleSeat"');
		expect(html).not.toContain("data-brush");
		expect(html).toContain('data-tooltip="The next Holding"');
	});
});
