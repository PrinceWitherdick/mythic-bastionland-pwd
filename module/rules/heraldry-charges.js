/**
 * Charges a Knight can add to their heraldry: drawings after public-domain
 * heraldry books, taken from the Book of Traceable Heraldic Art and shipped
 * under assets/heraldry/charges by scripts/heraldry-charges.js. Each is drawn
 * in two colours, which the painter swaps for the tincture in hand and a line
 * colour that shows on it. Pure, so it can be tested without Foundry.
 */
import { FESS_POINT, tinctureColor } from "./heraldry.js";
import { contrast, HEX_COLOR, mix } from "./colour.js";
import { SYSTEM_PATH } from "../system-id.js";

/** Where the shipped charges live. */
export const CHARGE_ROOT = `${SYSTEM_PATH}/assets/heraldry/charges`;

/** The file beside them crediting each drawing. */
export const CHARGE_CREDITS_FILE = "CREDITS.md";

/**
 * @param {string} key
 * @returns {string} The charge's file.
 */
export const chargePath = (key) => `${CHARGE_ROOT}/${key}.svg`;

/** The Book of Traceable Heraldic Art, which each charge's `svg` and `href` are relative to. */
export const HERALDIC_ART = "https://heraldicart.org/";

/** Who drew the Book's digital illustrations, as it credits them. */
export const HERALDIC_ART_ILLUSTRATOR = "Mathghamhain Ua Ruadháin";

/** The Book's copyright notice, which its licence asks to be kept with the drawings. */
export const HERALDIC_ART_COPYRIGHT = "© 2016–2023 Matthew Simon Ryan Cavalletto";

/** The licence the Book shares its drawings under, and the charges are shared under in turn. */
export const CHARGE_LICENCE = Object.freeze({
	name: "Creative Commons Attribution-ShareAlike 4.0 International",
	short: "CC BY-SA 4.0",
	url: "https://creativecommons.org/licenses/by-sa/4.0/"
});

/** Names under `bastionland.heraldry.charges.groups`, in the order the painter lists them. */
export const CHARGE_GROUPS = Object.freeze(["beasts", "birds", "monsters", "arms", "castles", "heavens", "plants", "symbols"]);

/** The colour a shipped charge is drawn in where it takes its tincture. */
export const CHARGE_FILL = "#f3f3f3";

/** The colour a shipped charge's lines are drawn in. */
export const CHARGE_LINE = "#000";

/** The longest side of a tinted charge, in pixels, so it's drawn sharp at any size it's placed at. */
const CHARGE_RASTER = 1024;

/** How large a charge arrives, as a multiple of the size that fits all of it inside the painting. */
export const CHARGE_SCALE = 0.7;

/** A charge whose tincture is this close to sable can't show sable lines, so its lines are lightened. */
const LINE_CONTRAST_MIN = 1.5;

/**
 * How far a dark charge's lines are lightened towards argent. Enough to show
 * the detail, but short of argent: finely engraved drawings are mostly line,
 * and argent lines turn them into a photographic negative.
 */
const LINE_LIFT = 0.32;

const SABLE = tinctureColor("sable");
const ARGENT = tinctureColor("argent");

/**
 * A drawing of a charge. Several drawings of one charge, such as three lions
 * rampant from different books, share the key before the dash.
 * @typedef {object} Charge
 * @property {string} key Its file's name.
 * @property {string} group One of CHARGE_GROUPS.
 * @property {string} name The drawing's name in the Book of Traceable Heraldic Art.
 * @property {string} svg The drawing's file there, relative to HERALDIC_ART.
 * @property {string} href Its entry there, relative to HERALDIC_ART.
 * @property {string[]} sources The public-domain books or rolls it was drawn after.
 * @property {string[]} artists Their original artists.
 * @property {string} [adaptedBy] Who adapted the drawing for the Book, when it credits someone.
 */

/** @type {readonly Charge[]} */
export const CHARGES = Object.freeze([
	{ key: "lionRampant-a", group: "beasts", name: "Lion", svg: "lion/lion-7.svg", href: "lion/#lion-7", sources: ["Glover's Roll in St. George's Book"], artists: ["Unknown Illustrator"] },
	{ key: "lionRampant-b", group: "beasts", name: "Lion", svg: "lion/lion-5.svg", href: "lion/#lion-5", sources: ["Armorial de Berry"], artists: ["Gilles le Bouvier"] },
	{ key: "lionRampant-c", group: "beasts", name: "Lion", svg: "lion/lion-12.svg", href: "lion/#lion-12", sources: ["Armorial Général, d'Origine Vraisemblablement Lorraine"], artists: ["Unknown Illustrator"] },
	{ key: "lionPassant-a", group: "beasts", name: "Lion Passant", svg: "lion/lion-passant-1.svg", href: "lion/#lion-passant", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "lionPassant-b", group: "beasts", name: "Lion Passant", svg: "lion/lion-passant-3.svg", href: "lion/#lion-passant-3", sources: ["Prince Arthur's Book"], artists: ["Thomas Wriothesley"] },
	{ key: "lionPassant-c", group: "beasts", name: "Lion Passant Guardant", svg: "lion/lion-passant-guardant-4.svg", href: "lion/#lion-passant-guardant-4", sources: ["The Elements of Armories"], artists: ["Unknown Illustrator"] },
	{ key: "bear-a", group: "beasts", name: "Bear Statant", svg: "bear/bear-statant-3.svg", href: "bear/#bear-statant-3", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "bear-b", group: "beasts", name: "Bear Passant", svg: "bear/bear-passant-5.svg", href: "bear/#bear-passant-5", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "bear-c", group: "beasts", name: "Bear Statant", svg: "bear/bear-statant-6.svg", href: "bear/#bear-statant-6", sources: ["Ortenburger Wappenbuch"], artists: ["Unknown Illustrator"] },
	{ key: "boar-a", group: "beasts", name: "Boar Rampant", svg: "boar/boar-rampant-1.svg", href: "boar/#boar-rampant", sources: ["Banners, Standards, and Badges"], artists: ["Thomas Willement"] },
	{ key: "boar-b", group: "beasts", name: "Boar Rampant", svg: "boar/boar-rampant-6.svg", href: "boar/#boar-rampant-6", sources: ["Insignia Florentinorum"], artists: ["Unknown Illustrator"] },
	{ key: "boar-c", group: "beasts", name: "Boar Passant", svg: "boar/boar-passant-6.svg", href: "boar/#boar-passant-6", sources: ["Arma Regni Poloniae"], artists: ["Unknown Illustrator"] },
	{ key: "wolf-a", group: "beasts", name: "Wolf Statant", svg: "wolf/wolf-statant-1.svg", href: "wolf/#wolf-statant", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "wolf-b", group: "beasts", name: "Wolf Statant", svg: "wolf/wolf-statant-2.svg", href: "wolf/#wolf-statant-2", sources: ["Banners, Standards, and Badges"], artists: ["Thomas Willement"] },
	{ key: "wolf-c", group: "beasts", name: "Wolf Rampant", svg: "wolf/wolf-rampant-8.svg", href: "wolf/#wolf-rampant-8", sources: ["Vocabulaire-Atlas Héraldique"], artists: ["Unknown Illustrator"] },
	{ key: "stag-a", group: "beasts", name: "Stag Lodged Collared and Chained", svg: "stag/stag-lodged-collared-and-chained.svg", href: "stag/#stag-lodged-collared-and-chained", sources: ["Banners, Standards, and Badges"], artists: ["Thomas Willement"] },
	{ key: "stag-b", group: "beasts", name: "Stag Courant", svg: "stag/stag-courant.svg", href: "stag/#stag-courant", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "stag-c", group: "beasts", name: "Stag Statant", svg: "stag/stag-statant-1.svg", href: "stag/#stag-statant", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "horse-a", group: "beasts", name: "Horse Passant", svg: "horse/horse-passant-1.svg", href: "horse/#horse-passant", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "horse-b", group: "beasts", name: "Horse Passant Caparisoned and Saddled", svg: "horse/horse-passant-caparisoned-and-saddled-1.svg", href: "horse/#horse-passant-caparisoned-and-saddled", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "horse-c", group: "beasts", name: "Horse Passant", svg: "horse/horse-passant-7.svg", href: "horse/#horse-passant-7", sources: ["Beyeren Armorial"], artists: ["Claes Heinenzoon"] },
	{ key: "bull-a", group: "beasts", name: "Bull Passant", svg: "bull/bull-passant-4.svg", href: "bull/#bull-passant-4", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "hound-a", group: "beasts", name: "Dog Statant Collared", svg: "dog/dog-statant-collared.svg", href: "dog/#dog-statant-collared", sources: ["Banners, Standards, and Badges"], artists: ["Thomas Willement"] },
	{ key: "hound-b", group: "beasts", name: "Dog Rampant Collared", svg: "dog/dog-rampant-collared-1.svg", href: "dog/#dog-rampant-collared", sources: ["Heraldic Badges", "Prince Arthur's Book"], artists: ["Unknown Illustrator"] },
	{ key: "hound-c", group: "beasts", name: "Dog Passant", svg: "dog/dog-passant-4.svg", href: "dog/#dog-passant-4", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "hare-a", group: "beasts", name: "Rabbit Salient", svg: "rabbit/rabbit-salient-2.svg", href: "rabbit/#rabbit-salient-2", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "hare-b", group: "beasts", name: "Rabbit", svg: "rabbit/rabbit-2.svg", href: "rabbit/#rabbit-2", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "hare-c", group: "beasts", name: "Rabbit Salient", svg: "rabbit/rabbit-salient-4.svg", href: "rabbit/#rabbit-salient-4", sources: ["Two Tudor Books of Arms"], artists: ["Robert Cooke"] },
	{ key: "elephant-a", group: "beasts", name: "Elephant Maintaining On Its Back A Tower", svg: "elephant/elephant-maintaining-on-its-back-a-tower-2.svg", href: "elephant/#elephant-maintaining-on-its-back-a-tower-2", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "elephant-b", group: "beasts", name: "Elephant", svg: "elephant/elephant-6.svg", href: "elephant/#elephant-6", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "elephant-c", group: "beasts", name: "Elephant Passant", svg: "elephant/elephant-passant-2.svg", href: "elephant/#elephant-passant-2", sources: ["St. Gallen Armorial"], artists: ["Unknown Illustrator"] },
	{ key: "dolphin-a", group: "beasts", name: "Dolphin Haurient", svg: "dolphin/dolphin-haurient-9.svg", href: "dolphin/#dolphin-haurient-9", sources: ["Heraldry of Fish"], artists: ["Unknown Illustrator"] },
	{ key: "dolphin-b", group: "beasts", name: "Dolphin Haurient", svg: "dolphin/dolphin-haurient-2.svg", href: "dolphin/#dolphin-haurient-2", sources: ["Two Tudor Books of Arms"], artists: ["Joseph Foster"] },
	{ key: "dolphin-c", group: "beasts", name: "Dolphin", svg: "dolphin/dolphin-1.svg", href: "dolphin/#dolphin", sources: ["Banners, Standards, and Badges"], artists: ["Thomas Willement"] },
	{ key: "eagle-a", group: "birds", name: "Eagle", svg: "eagle/eagle-1.svg", href: "eagle/#eagle", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "eagle-b", group: "birds", name: "Eagle", svg: "eagle/eagle-13.svg", href: "eagle/#eagle-13", sources: ["Sammelband Mehrerer Wappenbücher"], artists: ["Unknown Illustrator"] },
	{ key: "eagle-c", group: "birds", name: "Eagle", svg: "eagle/eagle-25.svg", href: "eagle/#eagle-25", sources: ["The Art of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "doubleEagle-a", group: "birds", name: "Double-headed Eagle", svg: "eagle/eagle-double-headed-2.svg", href: "eagle/#double-headed-eagle-2", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "doubleEagle-b", group: "birds", name: "Double-Headed Eagle", svg: "eagle/eagle-double-headed-8.svg", href: "eagle/#double-headed-eagle-8", sources: ["Armorial de Berry"], artists: ["Gilles le Bouvier"] },
	{ key: "doubleEagle-c", group: "birds", name: "Double-Headed Eagle", svg: "eagle/eagle-double-headed-9.svg", href: "eagle/#double-headed-eagle-9", sources: ["Jacques Prévert Ms. 57"], artists: ["Unknown Illustrator"] },
	{ key: "falcon-a", group: "birds", name: "Hawk", svg: "hawk/hawk-1.svg", href: "hawk/#hawk", sources: ["The Art of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "falcon-b", group: "birds", name: "Falcon", svg: "falcon/falcon-2.svg", href: "falcon/#falcon-2", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "falcon-c", group: "birds", name: "Falcon Belled", svg: "falcon/falcon-belled.svg", href: "falcon/#falcon-belled", sources: ["Two Tudor Books of Arms"], artists: ["Robert Cooke"] },
	{ key: "raven-a", group: "birds", name: "Crow", svg: "crow/crow-3.svg", href: "crow/#crow-3", sources: ["Banners, Standards, and Badges"], artists: ["Thomas Willement"] },
	{ key: "raven-b", group: "birds", name: "Crow", svg: "crow/crow-5.svg", href: "crow/#crow-5", sources: ["Stemmario Trivulziano"], artists: ["Gian Antonio da Tradate"] },
	{ key: "swan-a", group: "birds", name: "Swan", svg: "swan/swan-3.svg", href: "swan/#swan-3", sources: ["Some Feudal Lords and Their Seals"], artists: ["Unknown Illustrator"] },
	{ key: "owl-a", group: "birds", name: "Owl", svg: "owl/owl-8.svg", href: "owl/#owl-8", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "owl-b", group: "birds", name: "Owl", svg: "owl/owl-10.svg", href: "owl/#owl-10", sources: ["Sammlung von Wappen aus Verschiedenen"], artists: ["Unknown Illustrator"] },
	{ key: "owl-c", group: "birds", name: "Owl", svg: "owl/owl-11.svg", href: "owl/#owl-11", sources: ["Two Tudor Books of Arms"], artists: ["Robert Cooke"] },
	{ key: "pelican-a", group: "birds", name: "Pelican In Its Piety", svg: "pelican/pelican-in-its-piety-2.svg", href: "pelican/#pelican-in-its-piety-2", sources: ["Fictitious & Symbolic Creatures in Art"], artists: ["John Vinycomb"] },
	{ key: "pelican-b", group: "birds", name: "Pelican Vulning Itself", svg: "pelican/pelican-vulning-itself-3.svg", href: "pelican/#pelican-vulning-itself-3", sources: ["Two Tudor Books of Arms"], artists: ["Robert Cooke"] },
	{ key: "pelican-c", group: "birds", name: "Pelican In Its Piety", svg: "pelican/pelican-in-its-piety-5.svg", href: "pelican/#pelican-in-its-piety-5", sources: ["Harley MS 709"], artists: ["Unknown Illustrator"] },
	{ key: "martlet-a", group: "birds", name: "Martlet", svg: "martlet/martlet-4.svg", href: "martlet/#martlet-4", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "martlet-b", group: "birds", name: "Martlet", svg: "martlet/martlet-6.svg", href: "martlet/#martlet-6", sources: ["Two Tudor Books of Arms"], artists: ["Robert Cooke"] },
	{ key: "martlet-c", group: "birds", name: "Merlette", svg: "merlette/merlette.svg", href: "merlette/#merlette", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "dragon-a", group: "monsters", name: "Dragon", svg: "dragon/dragon-4.svg", href: "dragon/#dragon-4", sources: ["Heraldic Badges", "Prince Arthur's Book"], artists: ["Unknown Illustrator"] },
	{ key: "dragon-b", group: "monsters", name: "Dragon Passant", svg: "dragon/dragon-passant-4.svg", href: "dragon/#dragon-passant-4", sources: ["Banners, Standards, and Badges"], artists: ["Thomas Willement"] },
	{ key: "wyvern-a", group: "monsters", name: "Wyvern Wings Displayed", svg: "wyvern/wyvern-wings-displayed-2.svg", href: "wyvern/#wyvern-wings-displayed-2", sources: ["Two Tudor Books of Arms"], artists: ["Robert Cooke"] },
	{ key: "wyvern-b", group: "monsters", name: "Wyvern Tail Nowed", svg: "wyvern/wyvern-tail-nowed.svg", href: "wyvern/#wyvern-tail-nowed", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "griffin-a", group: "monsters", name: "Griffin", svg: "griffin/griffin-1.svg", href: "griffin/#griffin", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "griffin-b", group: "monsters", name: "Griffin", svg: "griffin/griffin-13.svg", href: "griffin/#griffin-13", sources: ["Funeral Arms and Commissions for Visitations"], artists: ["Unknown Illustrator"] },
	{ key: "griffin-c", group: "monsters", name: "Griffin", svg: "griffin/griffin-3.svg", href: "griffin/#griffin-3", sources: ["Fictitious & Symbolic Creatures in Art"], artists: ["John Vinycomb"] },
	{ key: "unicorn-a", group: "monsters", name: "Unicorn Statant", svg: "unicorn/unicorn-statant.svg", href: "unicorn/#unicorn-statant", sources: ["Banners, Standards, and Badges"], artists: ["Thomas Willement"] },
	{ key: "unicorn-b", group: "monsters", name: "Unicorn Passant", svg: "unicorn/unicorn-passant-3.svg", href: "unicorn/#unicorn-passant-3", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "unicorn-c", group: "monsters", name: "Unicorn", svg: "unicorn/unicorn-1.svg", href: "unicorn/#unicorn", sources: ["Fictitious & Symbolic Creatures in Art"], artists: ["John Vinycomb"] },
	{ key: "pegasus-a", group: "monsters", name: "Pegasus Segreant", svg: "pegasus/pegasus-segreant-1.svg", href: "pegasus/#pegasus-segreant", sources: ["Fictitious & Symbolic Creatures in Art"], artists: ["John Vinycomb"] },
	{ key: "pegasus-b", group: "monsters", name: "Pegasus Courant", svg: "pegasus/pegasus-courant-2.svg", href: "pegasus/#pegasus-courant-2", sources: ["Fictitious & Symbolic Creatures in Art"], artists: ["John Vinycomb"] },
	{ key: "cockatrice-a", group: "monsters", name: "Basilisk Wings Displayed", svg: "basilisk/basilisk-wings-displayed.svg", href: "basilisk/#basilisk-wings-displayed", sources: ["Banners, Standards, and Badges"], artists: ["Thomas Willement"] },
	{ key: "cockatrice-b", group: "monsters", name: "Cockatrice Displayed", svg: "cockatrice/cockatrice-displayed-1.svg", href: "cockatrice/#cockatrice-displayed", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "cockatrice-c", group: "monsters", name: "Cockatrice Displayed", svg: "cockatrice/cockatrice-displayed-2.svg", href: "cockatrice/#cockatrice-displayed-2", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "serpent-a", group: "monsters", name: "Serpent Entwined About A Pillar", svg: "serpent/serpent-entwined-about-a-pillar.svg", href: "serpent/#serpent-entwined-about-a-pillar", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "serpent-b", group: "monsters", name: "Serpent Glissant", svg: "serpent/serpent-glissant-6.svg", href: "serpent/#serpent-glissant-6", sources: ["The Elements of Armories"], artists: ["Unknown Illustrator"] },
	{ key: "serpent-c", group: "monsters", name: "Serpent Erect", svg: "serpent/serpent-erect-6.svg", href: "serpent/#serpent-erect-6", sources: ["Sammelband Mehrerer Wappenbücher"], artists: ["Unknown Illustrator"] },
	{ key: "hydra-a", group: "monsters", name: "Hydra Passant", svg: "hydra/hydra-passant-1.svg", href: "hydra/#hydra-passant", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "hydra-b", group: "monsters", name: "Hydra Statant", svg: "hydra/hydra-statant.svg", href: "hydra/#hydra-statant", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "hydra-c", group: "monsters", name: "Hydra Passant", svg: "hydra/hydra-passant-3.svg", href: "hydra/#hydra-passant-3", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "seaMonster-a", group: "monsters", name: "Sea-Lion", svg: "sea-monster/sea-lion-4.svg", href: "sea-monster/#sea-lion-4", sources: ["Two Tudor Books of Arms"], artists: ["Robert Cooke"] },
	{ key: "seaMonster-b", group: "monsters", name: "Sea-Horse", svg: "sea-monster/sea-horse-3.svg", href: "sea-monster/#sea-horse-3", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "seaMonster-c", group: "monsters", name: "Sea-Dragon", svg: "sea-monster/sea-dragon-2.svg", href: "sea-monster/#sea-dragon-2", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "manticore-a", group: "monsters", name: "Manticore Passant Guardant", svg: "manticore/manticore-passant-guardant.svg", href: "manticore/#manticore-passant-guardant", sources: ["Fictitious & Symbolic Creatures in Art"], artists: ["John Vinycomb"] },
	{ key: "manticore-b", group: "monsters", name: "Manticore Statant Collared and Chained", svg: "manticore/manticore-statant-collared-and-chained.svg", href: "manticore/#manticore-statant-collared-and-chained", sources: ["Banners, Standards, and Badges"], artists: ["Thomas Willement"] },
	{ key: "centaur-a", group: "monsters", name: "Centaur Passant", svg: "centaur/centaur-passant-1.svg", href: "centaur/#centaur-passant", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "centaur-b", group: "monsters", name: "Centaur Passant Guardant Armed", svg: "centaur/centaur-passant-guardant-armed-1.svg", href: "centaur/#centaur-passant-guardant-armed", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "centaur-c", group: "monsters", name: "Centaur Passant", svg: "centaur/centaur-passant-4.svg", href: "centaur/#centaur-passant-4", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "mermaid-a", group: "monsters", name: "Mermaid Maintaining a Harp", svg: "mermaid/mermaid-maintaining-a-harp.svg", href: "mermaid/#mermaid-maintaining-a-harp", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "mermaid-b", group: "monsters", name: "Melusine", svg: "melusine/melusine-2.svg", href: "melusine/#melusine-2", sources: ["Insignia Nobilium Veronensium, Vicentinorum"], artists: ["Unknown Illustrator"] },
	{ key: "sword-a", group: "arms", name: "Sword", svg: "sword/sword-14.svg", href: "sword/#sword-14", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "sword-b", group: "arms", name: "Sword", svg: "sword/sword-16.svg", href: "sword/#sword-16", sources: ["English Arms A"], artists: ["Unknown Illustrator"] },
	{ key: "sword-c", group: "arms", name: "Claymore", svg: "sword/claymore.svg", href: "sword/#claymore", sources: ["Vocabulaire-Atlas Héraldique"], artists: ["Unknown Illustrator"] },
	{ key: "axe-a", group: "arms", name: "Battle-Axe", svg: "axe/battle-axe-1.svg", href: "axe/#battle-axe", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "axe-b", group: "arms", name: "Battle-Axe", svg: "axe/battle-axe-2.svg", href: "axe/#battle-axe-2", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "axe-c", group: "arms", name: "Axe", svg: "axe/axe-5.svg", href: "axe/#axe-5", sources: ["Livro de Nobreza"], artists: ["António Godinho"] },
	{ key: "lance-a", group: "arms", name: "Spear", svg: "spear/spear-1.svg", href: "spear/#spear", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "lance-b", group: "arms", name: "Lance", svg: "lance/lance-2.svg", href: "lance/#lance-2", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "lance-c", group: "arms", name: "Spear", svg: "spear/spear-4.svg", href: "spear/#spear-4", sources: ["Wappenbuch der Arlberg-Bruderschaft"], artists: ["Vigil Raber"] },
	{ key: "bow-a", group: "arms", name: "Bow", svg: "bow/bow-1.svg", href: "bow/#bow", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "bow-b", group: "arms", name: "Bow", svg: "bow/bow-5.svg", href: "bow/#bow-5", sources: ["Insignia Urbium Italiae Septentrionalis"], artists: ["Unknown Illustrator"] },
	{ key: "bow-c", group: "arms", name: "Bow", svg: "bow/bow-7.svg", href: "bow/#bow-7", sources: ["Wappenbuch der Arlberg-Bruderschaft"], artists: ["Vigil Raber"] },
	{ key: "crossbow-a", group: "arms", name: "Crossbow", svg: "crossbow/crossbow-1.svg", href: "crossbow/#crossbow", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "arrow-a", group: "arms", name: "Pheon", svg: "pheon/pheon-1.svg", href: "pheon/#pheon", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "arrow-b", group: "arms", name: "Arrow", svg: "arrow/arrow-8.svg", href: "arrow/#arrow-8", sources: ["Wappenbuch der Arlberg-Bruderschaft"], artists: ["Vigil Raber"] },
	{ key: "arrow-c", group: "arms", name: "Broad-arrow", svg: "broad-arrow/broad-arrow-1.svg", href: "broad-arrow/#broad-arrow", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "helm-a", group: "arms", name: "Morion Helm", svg: "helm/helm-morion.svg", href: "helm/#morion-helm", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "helm-b", group: "arms", name: "Great Helm", svg: "helm/helm-great-2.svg", href: "helm/#great-helm-2", sources: ["The Accedence of Armorie"], artists: ["Unknown Illustrator"] },
	{ key: "helm-c", group: "arms", name: "Helm Affronty", svg: "helm/helm-affronty.svg", href: "helm/#helm-affronty", sources: ["Two Tudor Books of Arms"], artists: ["Robert Cooke"] },
	{ key: "gauntlet-a", group: "arms", name: "Gauntlet", svg: "gauntlet/gauntlet.svg", href: "gauntlet/#gauntlet", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "gauntlet-b", group: "arms", name: "Gauntlet Aversed", svg: "gauntlet/gauntlet-aversed-3.svg", href: "gauntlet/#gauntlet-aversed-3", sources: ["Encyclopædia Heraldica"], artists: ["Unknown Illustrator"] },
	{ key: "mace-a", group: "arms", name: "Flanged Mace", svg: "mace/mace-flanged-3.svg", href: "mace/#flanged-mace-3", sources: ["A Cyclopedia of Costume"], artists: ["Unknown Illustrator"] },
	{ key: "mace-b", group: "arms", name: "Spiked Mace", svg: "mace/mace-spiked-4.svg", href: "mace/#spiked-mace-4", sources: ["Album Amicorum des Élèves de Morel"], artists: ["Unknown Illustrator"] },
	{ key: "mace-c", group: "arms", name: "Flanged Mace", svg: "mace/mace-flanged-2.svg", href: "mace/#flanged-mace-2", sources: ["Insignia Florentinorum"], artists: ["Unknown Illustrator"], adaptedBy: "Mathghamhain Ua Ruadháin" },
	{ key: "tower-a", group: "castles", name: "Tower", svg: "tower/tower-1.svg", href: "tower/#tower", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "tower-b", group: "castles", name: "Tower", svg: "tower/tower-13.svg", href: "tower/#tower-13", sources: ["Two Tudor Books of Arms"], artists: ["Robert Cooke"] },
	{ key: "tower-c", group: "castles", name: "Tower", svg: "tower/tower-6.svg", href: "tower/#tower-6", sources: ["Scheibler Armorial"], artists: ["Unknown Illustrator"] },
	{ key: "castle-a", group: "castles", name: "Castle", svg: "castle/castle-6.svg", href: "castle/#castle-6", sources: ["Catalogue des Nobles Admiraulx de France"], artists: ["Unknown Illustrator"] },
	{ key: "castle-b", group: "castles", name: "Castle", svg: "castle/castle-4.svg", href: "castle/#castle-4", sources: ["Aegidius Tschudi's Armorial"], artists: ["Unknown Illustrator"] },
	{ key: "castle-c", group: "castles", name: "Castle", svg: "castle/castle-11.svg", href: "castle/#castle-11", sources: ["Anton Tirol's Wappenbuch"], artists: ["Anton Tirol"] },
	{ key: "portcullis-a", group: "castles", name: "Portcullis", svg: "portcullis/portcullis-3.svg", href: "portcullis/#portcullis-3", sources: ["A Glossary of Terms Used in Heraldry"], artists: ["James or Irene Parker"] },
	{ key: "portcullis-b", group: "castles", name: "Portcullis", svg: "portcullis/portcullis-1.svg", href: "portcullis/#portcullis", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "portcullis-c", group: "castles", name: "Portcullis", svg: "portcullis/portcullis-2.svg", href: "portcullis/#portcullis-2", sources: ["Banners, Standards, and Badges"], artists: ["Thomas Willement"] },
	{ key: "bridge-a", group: "castles", name: "Twin-Towered Bridge Of A Single Arch", svg: "bridge/bridge-twin-towered-of-a-single-arch.svg", href: "bridge/#twin-towered-bridge-of-a-single-arch", sources: ["Two Tudor Books of Arms"], artists: ["Robert Cooke"] },
	{ key: "bridge-b", group: "castles", name: "Footbridge", svg: "bridge/footbridge.svg", href: "bridge/#footbridge", sources: ["Insignia Venetorum Nobilium III"], artists: ["Unknown Illustrator"], adaptedBy: "Mathghamhain Ua Ruadháin" },
	{ key: "gate-a", group: "castles", name: "Gate", svg: "gate/gate-3.svg", href: "gate/#gate-3", sources: ["A Glossary of Terms Used in Heraldry"], artists: ["James or Irene Parker"] },
	{ key: "gate-b", group: "castles", name: "Gate", svg: "gate/gate-2.svg", href: "gate/#gate-2", sources: ["Wappenbuch der Arlberg-Bruderschaft"], artists: ["Vigil Raber"] },
	{ key: "crown-a", group: "castles", name: "Eastern Crown", svg: "crown/crown-eastern-3.svg", href: "crown/#eastern-crown-3", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "crown-b", group: "castles", name: "Eastern Crown", svg: "crown/crown-eastern-1.svg", href: "crown/#eastern-crown", sources: ["A Treatise on Heraldry British and Foreign"], artists: ["Unknown Illustrator"], adaptedBy: "Mathghamhain Ua Ruadháin" },
	{ key: "crown-c", group: "castles", name: "Saxon Crown", svg: "crown/crown-saxon-1.svg", href: "crown/#saxon-crown", sources: ["St. Gallen Armorial"], artists: ["Unknown Illustrator"] },
	{ key: "key-a", group: "castles", name: "Double-Key", svg: "key/key-double-1.svg", href: "key/#double-key", sources: ["Siebmacher’s Wappenbuch of 1605"], artists: ["Johann Siebmacher"] },
	{ key: "key-b", group: "castles", name: "Key", svg: "key/key-7.svg", href: "key/#key-7", sources: ["Manesse Codex"], artists: ["Unknown Illustrator"] },
	{ key: "key-c", group: "castles", name: "Key", svg: "key/key-2.svg", href: "key/#key-2", sources: ["Armorial Le Breton"], artists: ["Unknown Illustrator"], adaptedBy: "Mathghamhain Ua Ruadháin" },
	{ key: "lymphad-a", group: "castles", name: "Lymphad with Oars Shipped", svg: "lymphad/lymphad-with-oars-shipped-1.svg", href: "lymphad/#lymphad-with-oars-shipped", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "lymphad-b", group: "castles", name: "Lymphad with Oars Shipped", svg: "lymphad/lymphad-with-oars-shipped-3.svg", href: "lymphad/#lymphad-with-oars-shipped-3", sources: ["Scottish Nobility E2"], artists: ["Unknown Illustrator"], adaptedBy: "Mathghamhain Ua Ruadháin" },
	{ key: "lymphad-c", group: "castles", name: "Lymphad with Oars Shipped", svg: "lymphad/lymphad-with-oars-shipped-2.svg", href: "lymphad/#lymphad-with-oars-shipped-2", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "anchor-a", group: "castles", name: "Anchor", svg: "anchor/anchor-2.svg", href: "anchor/#anchor-2", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "anchor-b", group: "castles", name: "Anchor", svg: "anchor/anchor-1.svg", href: "anchor/#anchor", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "anchor-c", group: "castles", name: "Anchor", svg: "anchor/anchor-7.svg", href: "anchor/#anchor-7", sources: ["Thomas Jenyn's Book"], artists: ["Unknown Illustrator"] },
	{ key: "chessRook-a", group: "castles", name: "Chess Rook", svg: "chess-piece/chess-rook-1.svg", href: "chess-piece/#chess-rook", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "chessRook-b", group: "castles", name: "Chess Rook", svg: "chess-piece/chess-rook-4.svg", href: "chess-piece/#chess-rook-4", sources: ["Livro do Armeiro-Mor"], artists: ["Jean Du Cros"] },
	{ key: "sun-a", group: "heavens", name: "Sun In His Splendor", svg: "sun/sun-in-his-splendor-1.svg", href: "sun/#sun-in-his-splendor", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "sun-b", group: "heavens", name: "Sun", svg: "sun/sun-11.svg", href: "sun/#sun-11", sources: ["Thomas Jenyn's Book"], artists: ["Unknown Illustrator"] },
	{ key: "sun-c", group: "heavens", name: "Sun In His Splendor", svg: "sun/sun-in-his-splendor-4.svg", href: "sun/#sun-in-his-splendor-4", sources: ["Armorial de Gelre"], artists: ["Claes Heinenzoon"] },
	{ key: "crescent-a", group: "heavens", name: "Crescent", svg: "crescent/crescent-9.svg", href: "crescent/#crescent-9", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "crescent-b", group: "heavens", name: "Crescent", svg: "crescent/crescent-18.svg", href: "crescent/#crescent-18", sources: ["BnF MS Allemand 304"], artists: ["Unknown Illustrator"] },
	{ key: "crescent-c", group: "heavens", name: "Crescent", svg: "crescent/crescent-6.svg", href: "crescent/#crescent-6", sources: ["Banners, Standards, and Badges"], artists: ["Thomas Willement"] },
	{ key: "moon-a", group: "heavens", name: "Moon In Her Plenitude", svg: "moon/moon-in-her-plenitude-2.svg", href: "moon/#moon-in-her-plenitude-2", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "moon-b", group: "heavens", name: "Increscent Moon", svg: "moon/moon-increscent-5.svg", href: "moon/#increscent-moon-5", sources: ["Vocabulaire-Atlas Héraldique"], artists: ["Unknown Illustrator"] },
	{ key: "moon-c", group: "heavens", name: "Increscent Moon", svg: "moon/moon-increscent-7.svg", href: "moon/#increscent-moon-7", sources: ["A Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "mullet-a", group: "heavens", name: "Mullet of 6 Points Pometty", svg: "mullet/mullet-of-6-points-pometty-2.svg", href: "mullet/#mullet-of-6-points-pometty-2", sources: ["Insignia Nobilium Patavinorum"], artists: ["Unknown Illustrator"] },
	{ key: "mullet-b", group: "heavens", name: "Mullet of 8 Points", svg: "mullet/mullet-of-8-points-3.svg", href: "mullet/#mullet-of-8-points-3", sources: ["Lewis Armorial"], artists: ["Unknown Illustrator"] },
	{ key: "mullet-c", group: "heavens", name: "Mullet of 6 Points", svg: "mullet/mullet-of-6-points-4.svg", href: "mullet/#mullet-of-6-points-4", sources: ["BnF MS Allemand 304"], artists: ["Unknown Illustrator"] },
	{ key: "estoile-a", group: "heavens", name: "Estoile of 16 Points", svg: "estoile/estoile-of-16-points.svg", href: "estoile/#estoile-of-16-points", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "estoile-b", group: "heavens", name: "Estoile", svg: "estoile/estoile-3.svg", href: "estoile/#estoile-3", sources: ["The Accedence of Armorie"], artists: ["Unknown Illustrator"] },
	{ key: "flame-a", group: "heavens", name: "Flame", svg: "flame/flame-5.svg", href: "flame/#flame-5", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"], adaptedBy: "Mathghamhain Ua Ruadháin" },
	{ key: "flame-b", group: "heavens", name: "Flame", svg: "flame/flame-12.svg", href: "flame/#flame-12", sources: ["St. Gallen Armorial"], artists: ["Unknown Illustrator"] },
	{ key: "tree-a", group: "plants", name: "Oak Tree Fructed and Eradicated", svg: "oak/oak-tree-fructed-and-eradicated-5.svg", href: "oak/#oak-tree-fructed-and-eradicated-5", sources: ["Ortus Sanitatis"], artists: ["Unknown Illustrator"] },
	{ key: "tree-b", group: "plants", name: "Tree", svg: "tree/tree-7.svg", href: "tree/#tree-7", sources: ["Vocabulaire-Atlas Héraldique"], artists: ["Unknown Illustrator"], adaptedBy: "Mathghamhain Ua Ruadháin" },
	{ key: "tree-c", group: "plants", name: "Linden Tree Eradicated", svg: "linden/linden-tree-eradicated-4.svg", href: "linden/#linden-tree-eradicated-4", sources: ["A Handbook of Ornament"], artists: ["Unknown Illustrator"] },
	{ key: "rose-a", group: "plants", name: "Rose", svg: "rose/rose-1.svg", href: "rose/#rose", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "rose-b", group: "plants", name: "Rose", svg: "rose/rose-17.svg", href: "rose/#rose-17", sources: ["Lambeth MS774"], artists: ["Unknown Illustrator"] },
	{ key: "rose-c", group: "plants", name: "Rose", svg: "rose/rose-5.svg", href: "rose/#rose-5", sources: ["Banners, Standards, and Badges"], artists: ["Thomas Willement"] },
	{ key: "fleurDeLys-a", group: "plants", name: "Fleur de Lys", svg: "fleur-de-lys/fleur-de-lys-3.svg", href: "fleur-de-lys/#fleur-de-lys-3", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "fleurDeLys-b", group: "plants", name: "Fleur de Lys", svg: "fleur-de-lys/fleur-de-lys-25.svg", href: "fleur-de-lys/#fleur-de-lys-25", sources: ["The Trade Signs of Essex"], artists: ["Unknown Illustrator"] },
	{ key: "fleurDeLys-c", group: "plants", name: "Fleur de Lys", svg: "fleur-de-lys/fleur-de-lys-12.svg", href: "fleur-de-lys/#fleur-de-lys-12", sources: ["Scheibler Armorial"], artists: ["Unknown Illustrator"] },
	{ key: "thistle-a", group: "plants", name: "Thistle", svg: "thistle/thistle-1.svg", href: "thistle/#thistle", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "garb-a", group: "plants", name: "Garb of Wheat", svg: "wheat/wheat-garb-of-2.svg", href: "wheat/#garb-of-wheat-2", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "garb-b", group: "plants", name: "Garb of Wheat", svg: "wheat/wheat-garb-of-1.svg", href: "wheat/#garb-of-wheat", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "garb-c", group: "plants", name: "Sheaf of Wheat", svg: "wheat/wheat-sheaf-of-3.svg", href: "wheat/#sheaf-of-wheat-3", sources: ["Heraldry, Ancient and Modern"], artists: ["Unknown Illustrator"] },
	{ key: "acorn-a", group: "plants", name: "Acorn Slipped & Leaved", svg: "acorn/acorn-slipped-and-leaved-1.svg", href: "acorn/#acorn-slipped-and-leaved", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "acorn-b", group: "plants", name: "Acorn", svg: "acorn/acorn-6.svg", href: "acorn/#acorn-6", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "acorn-c", group: "plants", name: "Acorn", svg: "acorn/acorn-2.svg", href: "acorn/#acorn-2", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "cinquefoil-a", group: "plants", name: "Cinquefoil", svg: "cinquefoil/cinquefoil-1.svg", href: "cinquefoil/#cinquefoil", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "cinquefoil-b", group: "plants", name: "Cinquefoil", svg: "cinquefoil/cinquefoil-2.svg", href: "cinquefoil/#cinquefoil-2", sources: ["Workes of Armorie"], artists: ["John Bossewell"], adaptedBy: "Mathghamhain Ua Ruadháin" },
	{ key: "cinquefoil-c", group: "plants", name: "Cinquefoil", svg: "cinquefoil/cinquefoil-7.svg", href: "cinquefoil/#cinquefoil-7", sources: ["Thomas Jenyn's Book"], artists: ["Unknown Illustrator"] },
	{ key: "crossMoline-a", group: "symbols", name: "Cross Floretty", svg: "cross-charge/cross-floretty-2.svg", href: "cross-charge/#cross-floretty-2", sources: ["Vocabulaire-Atlas Héraldique"], artists: ["Unknown Illustrator"] },
	{ key: "crossMoline-b", group: "symbols", name: "Cross Moline", svg: "cross-charge/cross-moline-8.svg", href: "cross-charge/#cross-moline-8", sources: ["Fenwick Roll"], artists: ["Unknown Illustrator"], adaptedBy: "Mathghamhain Ua Ruadháin" },
	{ key: "crossMoline-c", group: "symbols", name: "Cross Moline", svg: "cross-charge/cross-moline-6.svg", href: "cross-charge/#cross-moline-6", sources: ["Two Tudor Books of Arms"], artists: ["Robert Cooke"] },
	{ key: "crossCrosslet-a", group: "symbols", name: "Cross Bottony Fitchy", svg: "cross-charge/cross-bottony-fitchy-1.svg", href: "cross-charge/#cross-bottony-fitchy", sources: ["Funeral Arms and Commissions for Visitations"], artists: ["Unknown Illustrator"] },
	{ key: "crossCrosslet-b", group: "symbols", name: "Cross Bottony Fitchy", svg: "cross-charge/cross-bottony-fitchy-2.svg", href: "cross-charge/#cross-bottony-fitchy-2", sources: ["English Arms A"], artists: ["Unknown Illustrator"] },
	{ key: "crossCrosslet-c", group: "symbols", name: "Cross Bottony", svg: "cross-charge/cross-bottony-4.svg", href: "cross-charge/#cross-bottony-4", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "crossFormy-a", group: "symbols", name: "Cross Pomelly", svg: "cross-charge/cross-pomelly-3.svg", href: "cross-charge/#cross-pomelly-3", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "crossFormy-b", group: "symbols", name: "Cross Pomelly", svg: "cross-charge/cross-pomelly-4.svg", href: "cross-charge/#cross-pomelly-4", sources: ["Le Blason Des Armoiries"], artists: ["Jérôme de Bara"] },
	{ key: "crossFormy-c", group: "symbols", name: "Cross Potent", svg: "cross-charge/cross-potent-4.svg", href: "cross-charge/#cross-potent-4", sources: ["The Art of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "knot-a", group: "symbols", name: "Heneage Knot", svg: "knot/knot-heneage-2.svg", href: "knot/#heneage-knot-2", sources: ["Heraldry, Ancient and Modern"], artists: ["Unknown Illustrator"] },
	{ key: "knot-b", group: "symbols", name: "Suffolk Knot", svg: "knot/knot-suffolk.svg", href: "knot/#suffolk-knot", sources: ["Heraldic Badges"], artists: ["Unknown Illustrator"] },
	{ key: "knot-c", group: "symbols", name: "Stafford Knot", svg: "knot/knot-stafford-1.svg", href: "knot/#stafford-knot", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "heart-a", group: "symbols", name: "Winged Heart", svg: "heart/heart-winged-1.svg", href: "heart/#winged-heart", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "heart-b", group: "symbols", name: "Heart", svg: "heart/heart-9.svg", href: "heart/#heart-9", sources: ["Stemmario Trivulziano"], artists: ["Gian Antonio da Tradate"] },
	{ key: "heart-c", group: "symbols", name: "Heart", svg: "heart/heart-11.svg", href: "heart/#heart-11", sources: ["Insignia Urbium Italiae Septentrionalis"], artists: ["Unknown Illustrator"] },
	{ key: "hand-a", group: "symbols", name: "Hand Couped Maintaining a Quill Pen", svg: "hand/hand-couped-maintaining-a-quill-pen.svg", href: "hand/#hand-couped-maintaining-a-quill-pen", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "hand-b", group: "symbols", name: "Hand of Benediction", svg: "hand/hand-of-benediction.svg", href: "hand/#hand-of-benediction", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "hand-c", group: "symbols", name: "Hand Issuant from a Cloud", svg: "hand/hand-issuant-from-a-cloud.svg", href: "hand/#hand-issuant-from-a-cloud", sources: ["Devises Heroiques et Emblemes"], artists: ["Unknown Illustrator"] },
	{ key: "escallop-a", group: "symbols", name: "Escallop", svg: "escallop/escallop-1.svg", href: "escallop/#escallop", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "escallop-b", group: "symbols", name: "Escallop", svg: "escallop/escallop-4.svg", href: "escallop/#escallop-4", sources: ["Dering Roll"], artists: ["Unknown Illustrator"], adaptedBy: "Mathghamhain Ua Ruadháin" },
	{ key: "escallop-c", group: "symbols", name: "Escallop", svg: "escallop/escallop-9.svg", href: "escallop/#escallop-9", sources: ["Some Feudal Lords and Their Seals"], artists: ["Unknown Illustrator"] },
	{ key: "horseshoe-a", group: "symbols", name: "Horseshoe", svg: "horseshoe/horseshoe-4.svg", href: "horseshoe/#horseshoe-4", sources: ["Some Feudal Lords and Their Seals"], artists: ["Unknown Illustrator"] },
	{ key: "horseshoe-b", group: "symbols", name: "Horseshoe", svg: "horseshoe/horseshoe-3.svg", href: "horseshoe/#horseshoe-3", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"], adaptedBy: "Mathghamhain Ua Ruadháin" },
	{ key: "bell-a", group: "symbols", name: "Bell", svg: "bell/bell-1.svg", href: "bell/#bell", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "bell-b", group: "symbols", name: "Bell", svg: "bell/bell-7.svg", href: "bell/#bell-7", sources: ["Libro II Della Natione Normanda"], artists: ["Unknown Illustrator"] },
	{ key: "bell-c", group: "symbols", name: "Bell", svg: "bell/bell-8.svg", href: "bell/#bell-8", sources: ["Two Tudor Books of Arms"], artists: ["Robert Cooke"] },
	{ key: "huntingHorn-a", group: "symbols", name: "Hunting Horn", svg: "hunting-horn/hunting-horn-1.svg", href: "hunting-horn/#hunting-horn", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "huntingHorn-b", group: "symbols", name: "Hunting Horn", svg: "hunting-horn/hunting-horn-2.svg", href: "hunting-horn/#hunting-horn-2", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "wheel-a", group: "symbols", name: "Catherine Wheel", svg: "catherine-wheel/wheel-catherine-1.svg", href: "catherine-wheel/#catherine-wheel", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "wheel-b", group: "symbols", name: "Wheel", svg: "wheel/wheel-2.svg", href: "wheel/#wheel-2", sources: ["Bergshammar Armorial"], artists: ["Unknown Illustrator"], adaptedBy: "Mathghamhain Ua Ruadháin" },
	{ key: "wheel-c", group: "symbols", name: "Wheel", svg: "wheel/wheel-3.svg", href: "wheel/#wheel-3", sources: ["Insignia Florentinorum"], artists: ["Unknown Illustrator"], adaptedBy: "Mathghamhain Ua Ruadháin" },
	{ key: "cup-a", group: "symbols", name: "Covered Cup", svg: "cup/cup-covered-1.svg", href: "cup/#covered-cup", sources: ["Funeral Arms and Commissions for Visitations"], artists: ["Unknown Illustrator"] },
	{ key: "cup-b", group: "symbols", name: "Double Cup", svg: "cup/cup-double-1.svg", href: "cup/#double-cup", sources: ["Wappenbuch der Arlberg-Bruderschaft"], artists: ["Vigil Raber"] },
	{ key: "skull-a", group: "symbols", name: "Skull", svg: "skull/skull-6.svg", href: "skull/#skull-6", sources: ["Wernigerode Armorial"], artists: ["Unknown Illustrator"] },
	{ key: "hourglass-a", group: "symbols", name: "Hourglass", svg: "hourglass/hourglass-3.svg", href: "hourglass/#hourglass-3", sources: ["L'Ancienne France"], artists: ["Unknown Illustrator"] },
	{ key: "waterBouget-a", group: "symbols", name: "Water-Bouget", svg: "water-bouget/water-bouget-2.svg", href: "water-bouget/#water-bouget-2", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "waterBouget-c", group: "symbols", name: "Water-Bouget", svg: "water-bouget/water-bouget-1.svg", href: "water-bouget/#water-bouget", sources: ["A Glossary of Terms Used in Heraldry"], artists: ["James or Irene Parker"] },
	{ key: "maunch-a", group: "symbols", name: "Maunch", svg: "maunch/maunch-4.svg", href: "maunch/#maunch-4", sources: ["Guillim’s Display of Heraldry"], artists: ["Unknown Illustrator"] },
	{ key: "maunch-b", group: "symbols", name: "Maunch", svg: "maunch/maunch-15.svg", href: "maunch/#maunch-15", sources: ["Vocabulaire-Atlas Héraldique"], artists: ["Unknown Illustrator"] },
	{ key: "maunch-c", group: "symbols", name: "Maunch", svg: "maunch/maunch-2.svg", href: "maunch/#maunch-2", sources: ["Workes of Armorie"], artists: ["John Bossewell"] },
	{ key: "beacon-a", group: "symbols", name: "Beacon", svg: "beacon/beacon-1.svg", href: "beacon/#beacon", sources: ["A Complete Guide to Heraldry"], artists: ["Graham Johnston"] },
	{ key: "beacon-b", group: "symbols", name: "Beacon", svg: "beacon/beacon-2.svg", href: "beacon/#beacon-2", sources: ["Banners, Standards, and Badges"], artists: ["Thomas Willement"] },
	{ key: "beacon-c", group: "symbols", name: "Cresset", svg: "cresset/cresset-3.svg", href: "cresset/#cresset-3", sources: ["Walter Roll"], artists: ["Unknown Illustrator"] }
].map((charge) => Object.freeze({ ...charge, sources: Object.freeze(charge.sources), artists: Object.freeze(charge.artists) })));

/**
 * @param {string} color "#rrggbb"
 * @returns {string} Sable, or the tincture lightened when the charge is too dark for sable lines to show.
 */
export function chargeLineColor(color) {
	return contrast(color, SABLE) < LINE_CONTRAST_MIN ? mix(color, ARGENT, LINE_LIFT) : SABLE;
}

/**
 * A shipped charge in a tincture, sized to draw sharp.
 * @param {string} svg The charge's file, as shipped.
 * @param {string} color "#rrggbb"
 * @param {number} [size] The longest side, in pixels.
 * @returns {string}
 */
export function tintCharge(svg, color, size = CHARGE_RASTER) {
	const fill = String(color).toLowerCase();
	if (!HEX_COLOR.test(fill)) throw new TypeError(`Not a colour: ${color}`);
	const root = /^<svg\b[^>]*>/.exec(svg)?.[0];
	const box = root && /\sviewBox="([^"]+)"/.exec(root)?.[1].trim().split(/[\s,]+/).map(Number);
	if (!box || box.length !== 4 || !(box[2] > 0 && box[3] > 0)) throw new Error("A charge needs a viewBox");
	const scale = size / Math.max(box[2], box[3]);
	const sized = root
		.replace(/\swidth="[^"]*"/, ` width="${Math.round(box[2] * scale)}"`)
		.replace(/\sheight="[^"]*"/, ` height="${Math.round(box[3] * scale)}"`);
	const line = chargeLineColor(fill);
	return (sized + svg.slice(root.length))
		.replaceAll(`="${CHARGE_FILL}"`, `="${fill}"`)
		.replace(new RegExp(`(\\s(?:fill|stroke))="${CHARGE_LINE}"`, "g"), `$1="${line}"`);
}

/**
 * @param {{width: number, height: number}} box The painting.
 * @returns {import("./heraldry.js").Placement} Where a charge arrives: in the middle of the shield, clear of its point.
 */
export function chargePlacement(box) {
	return { x: box.width / 2, y: box.height * FESS_POINT, scale: CHARGE_SCALE };
}

/**
 * The credit a charge's own file carries, so it goes with the drawing wherever the file is copied.
 * @param {Charge} charge
 * @returns {string}
 */
export function chargeNotice({ name, href, sources, artists, adaptedBy }) {
	return [
		`${name}.`,
		`Source: ${sources.join("; ")}.`,
		`Artist: ${artists.join("; ")}.`,
		...(adaptedBy ? [`Adapted by ${adaptedBy}.`] : []),
		`Digital illustration by ${HERALDIC_ART_ILLUSTRATOR} for the Book of Traceable Heraldic Art, ${HERALDIC_ART}${href}.`,
		`${HERALDIC_ART_COPYRIGHT}.`,
		`Licence: ${CHARGE_LICENCE.short}, ${CHARGE_LICENCE.url}.`,
		"Simplified to two colours for recolouring."
	].join(" ");
}

/**
 * @param {readonly Charge[]} [charges]
 * @returns {string} The credits shipped beside the charges.
 */
export function chargeCredits(charges = CHARGES) {
	const cell = (text) => String(text).replaceAll("|", "\\|");
	const rows = charges.map(({ key, name, href, sources, artists, adaptedBy }) =>
		`| ${key}.svg | [${cell(name)}](${HERALDIC_ART}${href}) | ${cell(sources.join("; "))} | ${cell(artists.join("; "))} | ${cell(adaptedBy ?? "")} |`);
	return [
		"# Heraldic charges",
		"",
		`The drawings in this folder are adapted from the [Book of Traceable Heraldic Art](${HERALDIC_ART}). Digital illustration by ${HERALDIC_ART_ILLUSTRATOR}. ${HERALDIC_ART_COPYRIGHT}. They are shared under the [${CHARGE_LICENCE.name}](${CHARGE_LICENCE.url}) licence (${CHARGE_LICENCE.short}), and provided as is, without warranties of any kind, as that licence sets out.`,
		"",
		"Each drawing was made after a public-domain book, roll or armorial. The table below lists its entry in the Book of Traceable Heraldic Art, the source it was drawn after, that source's original artist, and anyone the Book credits with adapting it. Each file also carries this credit in its own description.",
		"",
		"Changes made for this system: unused parts removed, shading reduced to one colour for the charge and one for its lines so they can be recoloured, coordinates rounded, and the credit added to each file.",
		"",
		`These adapted drawings are shared under the same ${CHARGE_LICENCE.short} licence. It covers only the drawings in this folder, not the rest of the system.`,
		"",
		"| File | Drawing | Source | Original artist | Adapted by |",
		"| --- | --- | --- | --- | --- |",
		...rows,
		""
	].join("\n");
}
