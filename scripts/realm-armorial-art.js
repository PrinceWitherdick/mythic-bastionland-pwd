/**
 * Builds the drawings the Armorial Realm skin is drawn with, from the Book of
 * Traceable Heraldic Art: each drawing ARMORIAL_ART lists is fetched, cleaned
 * down to the two colours a skin tints, and written with its credit to
 * scripts/data/realm-armorial-art.json for lib/realm-drawings.js. Drawings are
 * cached with the heraldry charges under node_modules/.cache, so running it
 * again works offline. Run after changing ARMORIAL_ART, then run
 * realm-placeholders.js:
 *
 *   node scripts/realm-armorial-art.js              (use the cache)
 *   node scripts/realm-armorial-art.js --refresh    (fetch every drawing again)
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanChargeSvg, fetchDrawing } from "./lib/charge-svg.js";

const out = join(import.meta.dirname, "data", "realm-armorial-art.json");
const refresh = process.argv.includes("--refresh");

/**
 * The drawings, keyed by their entry on the Book's page. Like the heraldry
 * charges, each is drawn after a public-domain book, roll or armorial.
 */
const ARMORIAL_ART = [
	{ key: "castle-of-three-towers-4", name: "Castle of Three Towers", svg: "castle/castle-of-three-towers-4.svg", href: "castle/#castle-of-three-towers-4", sources: ["Sammelband Mehrerer Wappenbücher"], artists: ["Unknown Illustrator"] },
	{ key: "house-3", name: "House", svg: "house/house-3.svg", href: "house/#house-3", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "castle-of-one-tower", name: "Castle of One Tower", svg: "castle/castle-of-one-tower.svg", href: "castle/#castle-of-one-tower", sources: ["Stemmario Trivulziano"], artists: ["Gian Antonio da Tradate"] },
	{ key: "tower-16", name: "Tower", svg: "tower/tower-16.svg", href: "tower/#tower-16", sources: ["Livro do Armeiro-Mor"], artists: ["Jean Du Cros"] },
	{ key: "eastern-crown-3", name: "Eastern Crown", svg: "crown/crown-eastern-3.svg", href: "crown/#eastern-crown-3", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "church-2", name: "Church", svg: "church/church-2.svg", href: "church/#church-2", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "beacon", name: "Beacon", svg: "beacon/beacon-1.svg", href: "beacon/#beacon", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "flame-5", name: "Flame", svg: "flame/flame-5.svg", href: "flame/#flame-5", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"], adaptedBy: "Mathghamhain Ua Ruadháin" },
	{ key: "skull-6", name: "Skull", svg: "skull/skull-6.svg", href: "skull/#skull-6", sources: ["Wernigerode Armorial"], artists: ["Unknown Illustrator"] },
	{ key: "arch", name: "Arch", svg: "arch/arch-1.svg", href: "arch/#arch", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "cattail", name: "Cattail", svg: "cattail/cattail.svg", href: "cattail/#cattail", sources: ["Wappenbuch der Arlberg-Bruderschaft"], artists: ["Vigil Raber"] },
	{ key: "broom-sprig-fructed-2", name: "Broom Sprig Fructed", svg: "broom/broom-sprig-fructed-2.svg", href: "broom/#broom-sprig-fructed-2", sources: ["Some Feudal Lords and Their Seals"], artists: ["Unknown Illustrator"] },
	{ key: "stone-4", name: "Stone", svg: "stone/stone-4.svg", href: "stone/#stone-4", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "mount-of-six-hillocks-couped", name: "Mount of Six Hillocks Couped", svg: "mount/mount-of-six-hillocks-couped-1.svg", href: "mount/#mount-of-six-hillocks-couped", sources: ["Stemmario Trivulziano"], artists: ["Gian Antonio da Tradate"] },
	{ key: "hurst-of-trees-issuant-from-a-mount", name: "Hurst of Trees Issuant from a Mount", svg: "tree/trees-hurst-of-issuant-from-a-mount.svg", href: "mount/#hurst-of-trees-issuant-from-a-mount", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "trimount-couped-4", name: "Trimount Couped", svg: "mount/trimount-couped-4.svg", href: "mount/#trimount-couped-4", sources: ["Libro II Della Natione Normanda"], artists: ["Unknown Illustrator"], adaptedBy: "Mathghamhain Ua Ruadháin" },
	{ key: "sheep-statant", name: "Sheep Statant", svg: "sheep/sheep-statant-1.svg", href: "sheep/#sheep-statant", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"], adaptedBy: "Owen Tegg" },
	{ key: "tree-stump-eradicated", name: "Tree Stump Eradicated", svg: "tree/tree-stump-eradicated-1.svg", href: "tree/#tree-stump-eradicated", sources: ["Banners, Standards, and Badges"], artists: ["Thomas Willement"] },
	{ key: "roundel-barry-wavy-or-fountain", name: "Roundel Barry Wavy, or Fountain", svg: "roundel/roundel-barry-wavy-or-fountain.svg", href: "fountain/#roundel-barry-wavy-or-fountain", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "tree-fructed", name: "Tree Fructed", svg: "tree/tree-fructed.svg", href: "tree/#tree-fructed", sources: ["Vocabulaire-Atlas Héraldique"], artists: ["Unknown Illustrator"] },
	{ key: "stalk-of-wheat-3", name: "Stalk of Wheat", svg: "wheat/wheat-stalk-of-3.svg", href: "wheat/#stalk-of-wheat-3", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] }
];

/**
 * Coordinates are rounded to whole units of each drawing's own box, a fraction
 * of a pixel on a hex, which makes them a third of the size. Every drawing is
 * written into each of the seven colour sets, so that counts.
 */
const PRECISION = 0;

const drawings = {};
const failures = [];
// One at a time, to go easy on the site.
for (const { key, svg, ...credit } of ARMORIAL_ART) {
	try {
		const { svg: cleaned, notes } = cleanChargeSvg(await fetchDrawing(svg, { agent: "realm-armorial-art", refresh }), { precision: PRECISION });
		drawings[key] = { ...credit, svg: cleaned };
		console.log(`${key.padEnd(36)} ${(Buffer.byteLength(cleaned) / 1024).toFixed(1).padStart(5)} KB${notes.length ? `  (${notes.join(", ")})` : ""}`);
	} catch (error) {
		failures.push(`${key}: ${svg}: ${error.message}`);
	}
}

if (failures.length) {
	console.error(`\n${failures.length} drawings failed, and nothing was written:\n${failures.join("\n")}`);
	process.exit(1);
}

writeFileSync(out, `${JSON.stringify(drawings, null, "\t")}\n`);
console.log(`\nWrote ${ARMORIAL_ART.length} drawings to ${out}. Run node scripts/realm-placeholders.js to draw them.`);
