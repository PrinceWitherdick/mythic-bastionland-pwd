import { describe, expect, it } from "vitest";
import { FESS_POINT, IMAGE_SCALE, TINCTURES, placementBox } from "../../module/rules/heraldry.js";
import {
	CHARGES,
	CHARGE_GROUPS,
	CHARGE_LICENCE,
	CHARGE_SCALE,
	HERALDIC_ART,
	HERALDIC_ART_COPYRIGHT,
	HERALDIC_ART_ILLUSTRATOR,
	chargeCredits,
	chargeLineColor,
	chargeNotice,
	chargePlacement,
	tintCharge
} from "../../module/rules/heraldry-charges.js";
import { contrast } from "../../module/rules/colour.js";

const color = (key) => TINCTURES.find((tincture) => tincture.key === key).color;

/**
 * Every source a charge may be drawn after, with the artists allowed for it:
 * books, rolls and armorials whose copyright has long ended. Check a new
 * source's date and illustrator before adding it. Drawings from modern
 * collections, museum photographs and 20th-century books don't belong here.
 */
const PUBLIC_DOMAIN = {
	"A Complete Guide to Heraldry": ["Graham Johnston"],
	"A Cyclopedia of Costume": ["Unknown Illustrator"],
	"A Display of Heraldry": ["Unknown Illustrator"],
	"A Glossary of Terms Used in Heraldry": ["James or Irene Parker"],
	"A Handbook of Ornament": ["Unknown Illustrator"],
	"A Treatise on Heraldry British and Foreign": ["Unknown Illustrator"],
	"Aegidius Tschudi's Armorial": ["Unknown Illustrator"],
	"Album Amicorum des Élèves de Morel": ["Unknown Illustrator"],
	"Anton Tirol's Wappenbuch": ["Anton Tirol"],
	"Arma Regni Poloniae": ["Unknown Illustrator"],
	"Armorial de Berry": ["Gilles le Bouvier"],
	"Armorial de Gelre": ["Claes Heinenzoon"],
	"Armorial Général, d'Origine Vraisemblablement Lorraine": ["Unknown Illustrator"],
	"Armorial Le Breton": ["Unknown Illustrator"],
	"Banners, Standards, and Badges": ["Thomas Willement"],
	"Bergshammar Armorial": ["Unknown Illustrator"],
	"Beyeren Armorial": ["Claes Heinenzoon"],
	"BnF MS Allemand 304": ["Unknown Illustrator"],
	"Catalogue des Nobles Admiraulx de France": ["Unknown Illustrator"],
	"Dering Roll": ["Unknown Illustrator"],
	"Devises Heroiques et Emblemes": ["Unknown Illustrator"],
	"Encyclopædia Heraldica": ["Unknown Illustrator"],
	"English Arms A": ["Unknown Illustrator"],
	"Fenwick Roll": ["Unknown Illustrator"],
	"Fictitious & Symbolic Creatures in Art": ["John Vinycomb"],
	"Funeral Arms and Commissions for Visitations": ["Unknown Illustrator"],
	"Glover's Roll in St. George's Book": ["Unknown Illustrator"],
	"Guillim’s Display of Heraldry": ["Unknown Illustrator"],
	"Harley MS 709": ["Unknown Illustrator"],
	"Heraldic Badges": ["Unknown Illustrator"],
	"Heraldry of Fish": ["Unknown Illustrator"],
	"Heraldry, Ancient and Modern": ["Unknown Illustrator"],
	"Insignia Florentinorum": ["Unknown Illustrator"],
	"Insignia Nobilium Patavinorum": ["Unknown Illustrator"],
	"Insignia Nobilium Veronensium, Vicentinorum": ["Unknown Illustrator"],
	"Insignia Urbium Italiae Septentrionalis": ["Unknown Illustrator"],
	"Insignia Venetorum Nobilium III": ["Unknown Illustrator"],
	"Jacques Prévert Ms. 57": ["Unknown Illustrator"],
	"L'Ancienne France": ["Unknown Illustrator"],
	"Lambeth MS774": ["Unknown Illustrator"],
	"Le Blason Des Armoiries": ["Jérôme de Bara"],
	"Lewis Armorial": ["Unknown Illustrator"],
	"Libro II Della Natione Normanda": ["Unknown Illustrator"],
	"Livro de Nobreza": ["António Godinho"],
	"Livro do Armeiro-Mor": ["Jean Du Cros"],
	"Manesse Codex": ["Unknown Illustrator"],
	"Ortenburger Wappenbuch": ["Unknown Illustrator"],
	"Ortus Sanitatis": ["Unknown Illustrator"],
	"Prince Arthur's Book": ["Thomas Wriothesley", "Unknown Illustrator"],
	"Sammelband Mehrerer Wappenbücher": ["Unknown Illustrator"],
	"Sammlung von Wappen aus Verschiedenen": ["Unknown Illustrator"],
	"Scheibler Armorial": ["Unknown Illustrator"],
	"Scottish Nobility E2": ["Unknown Illustrator"],
	"Siebmacher’s Wappenbuch of 1605": ["Johann Siebmacher"],
	"Some Feudal Lords and Their Seals": ["Unknown Illustrator"],
	"St. Gallen Armorial": ["Unknown Illustrator"],
	"Stemmario Trivulziano": ["Gian Antonio da Tradate"],
	"The Accedence of Armorie": ["Unknown Illustrator"],
	"The Art of Heraldry": ["Unknown Illustrator"],
	"The Elements of Armories": ["Unknown Illustrator"],
	"The Trade Signs of Essex": ["Unknown Illustrator"],
	"Thomas Jenyn's Book": ["Unknown Illustrator"],
	"Two Tudor Books of Arms": ["Robert Cooke", "Joseph Foster"],
	"Vocabulaire-Atlas Héraldique": ["Unknown Illustrator"],
	"Walter Roll": ["Unknown Illustrator"],
	"Wappenbuch der Arlberg-Bruderschaft": ["Vigil Raber"],
	"Wernigerode Armorial": ["Unknown Illustrator"],
	"Workes of Armorie": ["John Bossewell"]
};

/** A shipped charge in miniature: a lined root, a group of lines, charge parts, and a stroked line with no fill. */
const CHARGE = [
	'<svg xmlns="http://www.w3.org/2000/svg" width="279" height="332" fill="#000" viewBox="45 67 279 332">',
	'<g fill="#000"><path fill="#f3f3f3" d="M50 70h5v5z"/><rect width="5" height="5" fill="#f3f3f3"/></g>',
	'<path fill="none" stroke="#000" d="M60 80h2"/>',
	"</svg>"
].join("");

describe("tintCharge", () => {
	it("paints the charge in the tincture and its lines in sable", () => {
		const tinted = tintCharge(CHARGE, color("gules"));
		expect(tinted.match(/fill="#b0261e"/g)).toHaveLength(2);
		expect(tinted.match(/(fill|stroke)="#1d1a17"/g)).toHaveLength(3);
		expect(tinted).toContain('fill="none"');
		expect(tinted).not.toMatch(/#f3f3f3|"#000"/);
	});

	it("takes a colour in capitals", () => {
		expect(tintCharge(CHARGE, "#B0261E")).toContain('fill="#b0261e"');
	});

	it("sizes only the drawing itself, its longest side to the size asked", () => {
		expect(tintCharge(CHARGE, color("or"))).toMatch(/^<svg[^>]* width="861" height="1024"/);
		expect(tintCharge(CHARGE, color("or"), 332)).toMatch(/^<svg[^>]* width="279" height="332"/);
		expect(tintCharge(CHARGE, color("or"))).toContain('<rect width="5" height="5"');
	});

	it.each(["red", "#000", "", "#b0261"])("refuses %j as a colour", (bad) => {
		expect(() => tintCharge(CHARGE, bad)).toThrow(TypeError);
	});

	it("refuses a drawing without a viewBox", () => {
		expect(() => tintCharge('<svg width="10" height="10"><path fill="#f3f3f3"/></svg>', color("or"))).toThrow();
	});
});

describe("chargeLineColor", () => {
	it.each(TINCTURES.filter(({ key }) => key !== "sable"))("gives $key charges sable lines", ({ color: tincture }) => {
		expect(chargeLineColor(tincture)).toBe(color("sable"));
	});

	it("lightens a sable charge's lines enough to show its detail, short of argent", () => {
		const line = chargeLineColor(color("sable"));
		expect(contrast(line, color("sable"))).toBeGreaterThan(2);
		expect(contrast(line, color("argent"))).toBeGreaterThan(3);
	});

	it("lightens the lines of other near-blacks", () => {
		expect(chargeLineColor("#000000")).not.toBe(color("sable"));
		expect(chargeLineColor("#555555")).toBe(color("sable"));
	});
});

describe("chargePlacement", () => {
	const painting = { width: 420, height: 498 };

	it("puts a charge in the middle of the shield, on its fess point", () => {
		expect(chargePlacement(painting)).toEqual({ x: 210, y: 498 * FESS_POINT, scale: CHARGE_SCALE });
	});

	it("keeps a tall charge clear of the shield's top and point", () => {
		const box = placementBox({ width: 279, height: 332 }, painting, chargePlacement(painting));
		expect(box.y).toBeGreaterThan(0);
		expect(box.y + box.height).toBeLessThan(painting.height * 0.85);
	});

	it("arrives at a size the slider can reach", () => {
		expect(CHARGE_SCALE).toBeGreaterThanOrEqual(IMAGE_SCALE.min);
		expect(CHARGE_SCALE).toBeLessThanOrEqual(IMAGE_SCALE.max);
	});
});

describe("CHARGES", () => {
	it("names each drawing once, whatever the case, since Windows ignores it in file names", () => {
		const keys = CHARGES.map(({ key }) => key.toLowerCase());
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("offers some charges in every group", () => {
		for (const group of CHARGE_GROUPS) expect(CHARGES.some((charge) => charge.group === group)).toBe(true);
	});

	it("lists each charge's drawings together, in one group", () => {
		const runs = CHARGES.map(({ key }) => key.split("-")[0]).filter((charge, index, all) => charge !== all[index - 1]);
		expect(new Set(runs).size).toBe(runs.length);
		const groups = new Map(CHARGES.map(({ key, group }) => [key.split("-")[0], group]));
		for (const { key, group } of CHARGES) expect(groups.get(key.split("-")[0])).toBe(group);
	});

	it.each(CHARGES)("$key is a well-formed entry from the Book of Traceable Heraldic Art", (charge) => {
		expect(charge.key).toMatch(/^[a-z][a-zA-Z]*-[a-z]$/);
		expect(CHARGE_GROUPS).toContain(charge.group);
		expect(charge.name.trim()).not.toBe("");
		expect(charge.svg).toMatch(/^[\w-]+\/[\w-]+\.svg$/);
		expect(charge.href).toMatch(/^[\w-]+\/#[\w-]+$/);
		expect(charge.sources.length).toBeGreaterThan(0);
		expect(charge.artists.length).toBeGreaterThan(0);
	});

	it.each(CHARGES)("$key is drawn after a public-domain source", ({ sources, artists }) => {
		for (const source of sources) {
			expect(Object.keys(PUBLIC_DOMAIN)).toContain(source);
			for (const artist of artists) {
				// An artist may come from any of a drawing's sources.
				expect(sources.some((each) => PUBLIC_DOMAIN[each]?.includes(artist))).toBe(true);
			}
		}
	});
});

/** What the licence asks an attribution to keep: the creator, the copyright notice, the licence and its disclaimer, and a link to the work. */
const LICENCE_NOTICES = [HERALDIC_ART_ILLUSTRATOR, HERALDIC_ART_COPYRIGHT, CHARGE_LICENCE.short, CHARGE_LICENCE.url];

describe("chargeCredits", () => {
	const credits = chargeCredits();

	it("keeps the Book's creator, copyright notice and licence", () => {
		for (const notice of LICENCE_NOTICES) expect(credits).toContain(notice);
		expect(credits).toContain(`[Book of Traceable Heraldic Art](${HERALDIC_ART})`);
		expect(credits).toContain("without warranties");
	});

	it("says what was changed, and that the licence covers only the drawings", () => {
		expect(credits).toMatch(/Changes made/);
		expect(credits).toMatch(/covers only the drawings/);
	});

	it.each(CHARGES)("credits $key", ({ key, href, sources, artists, adaptedBy }) => {
		const row = credits.split("\n").find((line) => line.startsWith(`| ${key}.svg |`));
		expect(row).toBeDefined();
		expect(row).toContain(`${HERALDIC_ART}${href}`);
		for (const text of [...sources, ...artists]) expect(row).toContain(text);
		if (adaptedBy) expect(row).toMatch(new RegExp(`\\| ${adaptedBy} \\|$`));
	});

	it("keeps a pipe in a name from breaking the table", () => {
		const [row] = chargeCredits([{ key: "x-a", name: "A | B", href: "x/#a", sources: ["S"], artists: ["A"] }]).split("\n").slice(-2);
		expect(row).toContain("A \\| B");
	});
});

describe("chargeNotice", () => {
	it.each(CHARGES)("credits $key in its own file", (charge) => {
		const notice = chargeNotice(charge);
		for (const text of [charge.name, ...charge.sources, ...charge.artists, `${HERALDIC_ART}${charge.href}`, ...LICENCE_NOTICES]) {
			expect(notice).toContain(text);
		}
		if (charge.adaptedBy) expect(notice).toContain(`Adapted by ${charge.adaptedBy}.`);
		else expect(notice).not.toContain("Adapted by");
	});
});
