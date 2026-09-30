/**
 * Pictures for weapons, armour, gear, beasts, hirelings and structures:
 * game-icons.net icons, each on the ink disc the Squire's portrait has,
 * picked by the words in a name, so "Old sword" gets a sword and "Loyal
 * steed" a horse. `npm run goods-icons` saves every icon GOODS_ICONS lists
 * to assets/icons/goods. Pure, so it can be tested without Foundry.
 */
import { SYSTEM_PATH } from "../system-id.js";
import { iconSet } from "./game-icons.js";
import { splitName } from "./text.js";

/** Where the pictures are served from. */
export const GOODS_ICON_ROOT = `${SYSTEM_PATH}/assets/icons/goods`;

/** The credits file saved beside the pictures. */
export const GOODS_ICON_CREDITS_FILE = "CREDITS.md";

/** Every picture, by the file it's saved as, and the game-icons.net icon it's made from. */
export const GOODS_ICONS = Object.freeze({
	// Weapons.
	"broadsword": "lorc/broadsword",
	"two-handed-sword": "delapouite/two-handed-sword",
	"plain-dagger": "lorc/plain-dagger",
	"wood-club": "delapouite/wood-club",
	"hatchet": "delapouite/hatchet",
	"wood-axe": "lorc/wood-axe",
	"battle-axe": "lorc/battle-axe",
	"barbed-spear": "lorc/barbed-spear",
	"spears": "lorc/spears",
	"trident": "lorc/trident",
	"flanged-mace": "delapouite/flanged-mace",
	"spiked-mace": "lorc/spiked-mace",
	"warhammer": "delapouite/warhammer",
	"war-pick": "delapouite/war-pick",
	"halberd": "lorc/halberd",
	"pitchfork": "delapouite/pitchfork",
	"scythe": "lorc/scythe",
	"sickle": "delapouite/sickle",
	"flail": "delapouite/flail",
	"whip": "lorc/whip",
	"wood-stick": "delapouite/wood-stick",
	"sling": "delapouite/sling",
	"bow-arrow": "delapouite/bow-arrow",
	"bow-string": "delapouite/bow-string",
	"pocket-bow": "lorc/pocket-bow",
	"crossbow": "carl-olsen/crossbow",
	"unlit-bomb": "lorc/unlit-bomb",
	"siege-ram": "skoll/siege-ram",
	"catapult": "heavenly-dog/catapult",
	"ballista": "skoll/ballista",
	"trebuchet": "delapouite/trebuchet",
	"crossed-swords": "lorc/crossed-swords",
	// A beast's own weapons.
	"fangs": "skoll/fangs",
	"claws": "delapouite/claws",
	"hoof": "lorc/hoof",
	// Armour.
	"shield": "sbed/shield",
	"viking-shield": "delapouite/viking-shield",
	"visored-helm": "lorc/visored-helm",
	"mail-shirt": "lorc/mail-shirt",
	"scale-mail": "lorc/scale-mail",
	"leather-vest": "lorc/leather-vest",
	"armor-vest": "lorc/armor-vest",
	"breastplate": "lorc/breastplate",
	"pauldrons": "skoll/pauldrons",
	// Tools, remedies and other gear.
	"hand-saw": "delapouite/hand-saw",
	"fishing-pole": "delapouite/fishing-pole",
	"fishing-net": "lorc/fishing-net",
	"sewing-needle": "lorc/sewing-needle",
	"candles": "delapouite/candles",
	"spade": "lorc/spade",
	"flute": "delapouite/flute",
	"harp": "delapouite/harp",
	"wolf-trap": "lorc/wolf-trap",
	"anvil": "lorc/anvil",
	"herbs-bundle": "delapouite/herbs-bundle",
	"quill-ink": "lorc/quill-ink",
	"round-bottom-flask": "lorc/round-bottom-flask",
	"fizzing-flask": "lorc/fizzing-flask",
	"crystal-ball": "lorc/crystal-ball",
	"poison-bottle": "lorc/poison-bottle",
	"lantern": "lorc/lantern",
	"torch": "delapouite/torch",
	"rope-coil": "delapouite/rope-coil",
	"key": "lorc/key",
	"cloak": "lucasms/cloak",
	"hood": "lorc/hood",
	"book-cover": "delapouite/book-cover",
	"scroll-unfurled": "lorc/scroll-unfurled",
	"hunting-horn": "lorc/hunting-horn",
	"ringing-bell": "lorc/ringing-bell",
	"mirror-mirror": "lorc/mirror-mirror",
	"saddle": "delapouite/saddle",
	"chest": "delapouite/chest",
	"chess-knight": "skoll/chess-knight",
	"roast-chicken": "lorc/roast-chicken",
	"incense": "lorc/incense",
	"wine-bottle": "delapouite/wine-bottle",
	"gem-pendant": "lorc/gem-pendant",
	"swap-bag": "lorc/swap-bag",
	"knapsack": "lorc/knapsack",
	// Beasts.
	"horse-head": "delapouite/horse-head",
	"hound": "lorc/hound",
	"wolf-head": "lorc/wolf-head",
	"fox-head": "lorc/fox-head",
	"sheep": "delapouite/sheep",
	"pig": "skoll/pig",
	"boar": "caro-asercion/boar",
	"donkey": "skoll/donkey",
	"bull": "lorc/bull",
	"cow": "delapouite/cow",
	"goat": "skoll/goat",
	"eagle-head": "delapouite/eagle-head",
	"raven": "lorc/raven",
	"bear-head": "delapouite/bear-head",
	"stag-head": "lorc/stag-head",
	"deer": "caro-asercion/deer",
	"rat": "delapouite/rat",
	"snake": "lorc/snake",
	"beetle-shell": "lorc/beetle-shell",
	// Hirelings and Warbands.
	"archer": "delapouite/archer",
	"swordman": "cathelineau/swordman",
	"pikeman": "delapouite/pikeman",
	"cavalry": "delapouite/cavalry",
	"mounted-knight": "skoll/mounted-knight",
	"wizard-face": "delapouite/wizard-face",
	"broom": "delapouite/broom",
	"direction-signs": "delapouite/direction-signs",
	// Structures.
	"medieval-gate": "delapouite/medieval-gate",
	"rempart": "delapouite/rempart",
	"stone-wall": "delapouite/stone-wall",
	"palisade": "delapouite/palisade",
	"siege-tower": "delapouite/siege-tower",
	"canoe": "delapouite/canoe",
	"raft": "delapouite/raft",
	"drakkar": "delapouite/drakkar",
	"galleon": "lorc/galleon"
});

/** @returns {string} Where the picture saved as `key` is served from. */
export const goodsIconPath = (key) => `${GOODS_ICON_ROOT}/${key}.svg`;

/**
 * Siege engines, whether they're a weapon or a structure. First, as a Stone
 * Thrower isn't a stone and a Battering Ram isn't a sheep.
 */
const SIEGE = Object.freeze([
	[/trebuchet/i, "trebuchet"],
	[/stone thrower|catapult|mangonel|onager/i, "catapult"],
	[/bolt launcher|ballista/i, "ballista"],
	[/battering ram/i, "siege-ram"],
	[/siege tower/i, "siege-tower"]
]);

/**
 * Words in an item's name, and the picture each calls for, the first that
 * matches winning. Polearms come before the blades and axes on their heads,
 * weapons before a beast's own, so Fang blades are blades, armour before the
 * cloaks worn over it, and a book before the sack it's in.
 */
const ITEM_ICONS = Object.freeze([
	...SIEGE,
	// Weapons.
	[/halberd|pole-?axe|billhook|polearm|guisarme|glaive|pole sickle|banner-pike|neck-catcher|blade-staff|bardiche|partisan|voulge/i, "halberd"],
	[/trident|two-pronged|forked spear/i, "trident"],
	[/pitchfork/i, "pitchfork"],
	[/crossbow/i, "crossbow"],
	[/longbow/i, "bow-string"],
	[/curvebow|recurve/i, "pocket-bow"],
	[/(?:\b|short|root|war|hunting)bows?\b/i, "bow-arrow"],
	[/sling\b/i, "sling"],
	[/javelin|darts?\b|throwing spear|\bthrown\b/i, "spears"],
	[/\blances?\b|greatlance|spear|\bpikes?\b/i, "barbed-spear"],
	[/scythe/i, "scythe"],
	[/sickle/i, "sickle"],
	[/(?:spiked|spiny|spined|pronged)\s*mace|morning ?star/i, "spiked-mace"],
	[/flail/i, "flail"],
	[/mace/i, "flanged-mace"],
	[/hammer|maul/i, "warhammer"],
	[/\bpicks?\b|war-?pick|pickaxe|mattock/i, "war-pick"],
	[/hatchet|hand ?axe|throwing axe|rider.s axe/i, "hatchet"],
	[/logging axe|wood ?axe|splitting ?axe/i, "wood-axe"],
	[/axe/i, "battle-axe"],
	[/dagger|knife|dirk|stiletto/i, "plain-dagger"],
	[/great ?sword|great ?blade|two-handed|cleaving ?blade|claymore/i, "two-handed-sword"],
	[/sword|blade|sabre|saber|falchion|scimitar|cutlass|rapier|scabbard/i, "broadsword"],
	[/club|cudgel|bludgeon/i, "wood-club"],
	[/staff|stick/i, "wood-stick"],
	[/whip/i, "whip"],
	[/explosive|bomb|grenade/i, "unlit-bomb"],
	// A beast's own attacks.
	[/\bbites?\b|jaws|\bfangs?\b|teeth|\bmaw\b/i, "fangs"],
	[/claws?\b|talons?/i, "claws"],
	[/trample|hoof|hooves|\bkicks?\b/i, "hoof"],
	// Armour. A coif is a helm (p12), mail or not.
	[/buckler|round ?shield|targe/i, "viking-shield"],
	[/shield/i, "shield"],
	[/helm|coif/i, "visored-helm"],
	[/pauldron/i, "pauldrons"],
	[/brigandine/i, "armor-vest"],
	[/scale/i, "scale-mail"],
	[/plate|cuirass|splint/i, "breastplate"],
	[/mail|hauberk|byrnie/i, "mail-shirt"],
	[/gambeson|coat\b|padded|quilted|leather/i, "leather-vest"],
	// Tools and other gear.
	[/saw\b/i, "hand-saw"],
	[/\bnet\b/i, "fishing-net"],
	[/fishing|\brod\b/i, "fishing-pole"],
	[/sewing|needle/i, "sewing-needle"],
	[/sacrament|incense|censer/i, "incense"],
	[/candle/i, "candles"],
	[/shovel|spade/i, "spade"],
	[/broom/i, "broom"],
	[/flute|pipes?\b|whistle/i, "flute"],
	[/\blutes?\b|\bharps?\b|lyre/i, "harp"],
	[/\btraps?\b|snare/i, "wolf-trap"],
	[/smith|anvil|forge/i, "anvil"],
	[/herb|salve|stimulant|poultice|weeds/i, "herbs-bundle"],
	[/quill|\bscribes?\b|\bink\b/i, "quill-ink"],
	[/crystal ball/i, "crystal-ball"],
	[/poison|venom|toxin/i, "poison-bottle"],
	[/alchem|vial|potion|flask/i, "round-bottom-flask"],
	[/lantern|lamp/i, "lantern"],
	[/torch/i, "torch"],
	[/rope/i, "rope-coil"],
	[/\bkeys?\b/i, "key"],
	[/cloak|\bcapes?\b|mantle/i, "cloak"],
	[/\bhoods?\b/i, "hood"],
	[/book|\btomes?\b/i, "book-cover"],
	[/scroll|parchment/i, "scroll-unfurled"],
	[/horn\b/i, "hunting-horn"],
	[/bell\b/i, "ringing-bell"],
	[/mirror/i, "mirror-mirror"],
	[/saddle|\btack\b/i, "saddle"],
	[/chest\b|box\b|casket|coffer/i, "chest"],
	[/chess/i, "chess-knight"],
	[/sustenance|feast|food|\brations?\b|\bmeals?\b|bread|\bmeat\b/i, "roast-chicken"],
	[/alcohol|wine|\bale\b|mead\b|beer/i, "wine-bottle"],
	[/pendant|amulet|necklace|locket|bracelet|\brings?\b/i, "gem-pendant"],
	[/pouch|\bbag\b|sack|purse/i, "swap-bag"]
]);

/** Each armour type's picture, for armour whose name calls for none. */
const ARMOUR_KIND_ICONS = Object.freeze({ shield: "shield", helm: "visored-helm", coat: "mail-shirt", plates: "breastplate" });

/** The picture for an item of each type whose name calls for none. */
const ITEM_TYPE_ICONS = Object.freeze({ weapon: "crossed-swords", armour: "breastplate", gear: "knapsack" });

/**
 * Words in an NPC's or structure's name, and the picture each calls for. People
 * come before beasts, so Horsemen ride rather than are horses, and a Bearded
 * steed is no bear.
 */
const ACTOR_ICONS = Object.freeze([
	...SIEGE,
	// Structures.
	[/\bgates?\b|portcullis/i, "medieval-gate"],
	[/rampart/i, "rempart"],
	[/palisade|stockade|fence/i, "palisade"],
	[/\bwalls?\b/i, "stone-wall"],
	[/longship|drakkar/i, "drakkar"],
	[/warship|galleon|\bship\b|\bcog\b|carrack/i, "galleon"],
	[/rowboat|boat|canoe/i, "canoe"],
	[/raft/i, "raft"],
	// Hirelings and Warbands.
	[/archer|bowm[ae]n|skirmisher|crossbowm[ae]n/i, "archer"],
	[/riders?\b|cavalry|horsem[ae]n/i, "cavalry"],
	[/knights?\b/i, "mounted-knight"],
	[/sellsword|mercenar|soldier|swordsm[ae]n|m[ae]n-at-arms|warrior/i, "swordman"],
	[/sentry|sentries|guard|militia|pikem[ae]n|watchm[ae]n/i, "pikeman"],
	[/\bsages?\b|scholar|wizard|\bseers?\b/i, "wizard-face"],
	[/alchemist/i, "fizzing-flask"],
	[/herbalist/i, "herbs-bundle"],
	[/servant|\bmaids?\b|butler|valet|footm[ae]n|chamberlain/i, "broom"],
	[/\bguides?\b|pathfinder|tracker/i, "direction-signs"],
	// Beasts.
	[/steed|horse|charger|stallion|\bmare\b|destrier|palfrey|courser|gelding|pony|ponies/i, "horse-head"],
	[/hound|\bdogs?\b|mastiff/i, "hound"],
	[/wolf|wolves/i, "wolf-head"],
	[/\bfox/i, "fox-head"],
	[/sheep|\blambs?\b/i, "sheep"],
	[/boar/i, "boar"],
	[/\bpigs?\b|swine|\bhogs?\b/i, "pig"],
	[/mule|donkey/i, "donkey"],
	[/\box(?:en)?\b|bull\b|bulls\b|cattle|aurochs/i, "bull"],
	[/\bcows?\b/i, "cow"],
	[/goat/i, "goat"],
	[/hawk|falcon|eagle|kestrel/i, "eagle-head"],
	[/raven|\bcrows?\b|\brooks?\b|bird/i, "raven"],
	[/\bbears?\b/i, "bear-head"],
	[/\bstags?\b|\bharts?\b/i, "stag-head"],
	[/deer|\belk\b/i, "deer"],
	[/\brats?\b/i, "rat"],
	[/snake|serpent|viper|\badders?\b/i, "snake"],
	[/beetle|\bbugs?\b|insect/i, "beetle-shell"]
]);

/**
 * @returns {string|null} The picture the first rule matching `name` calls for. Only the
 *   lead words count, cut where the sheet cuts them (splitName), not the gloss after
 *   " (" or ", ", so the Salt of cleansing that "makes spoiled meat fit to eat" is no food.
 */
function firstMatch(rules, name) {
	const { nameHead } = splitName(String(name ?? ""));
	return rules.find(([pattern]) => pattern.test(nameHead))?.[1] ?? null;
}

/**
 * @param {{type: string, name: string, system?: object}} item
 * @returns {string|null} The picture for an item, by its name, or failing that
 *   its type. Null for Abilities, Passions and Scars, which have none.
 */
export function goodsItemIcon({ type, name, system }) {
	if (!(type in ITEM_TYPE_ICONS)) return null;
	const key = firstMatch(ITEM_ICONS, name) ?? (type === "armour" ? ARMOUR_KIND_ICONS[system?.kind] : null) ?? ITEM_TYPE_ICONS[type];
	return goodsIconPath(key);
}

/**
 * @param {{type: string, name: string}} actor
 * @returns {string|null} The picture for an NPC or structure, by its name. Null
 *   for a name that calls for none, and for Knights and the like, who have portraits.
 */
export function goodsActorIcon({ type, name }) {
	if (type !== "npc" && type !== "structure") return null;
	const key = firstMatch(ACTOR_ICONS, name);
	return key ? goodsIconPath(key) : null;
}

/** What this set's pictures are credited as. */
const CREDITS = iconSet({
	icons: Object.entries(GOODS_ICONS).map(([key, icon]) => ({ key, icon })),
	heading: "Item, beast and structure pictures",
	blurb: ["Each is recoloured and set on an ink disc; the artwork is otherwise unchanged. Each picture carries its credit too."]
});

/**
 * @param {string} key A GOODS_ICONS key.
 * @returns {{title: string, artist: string, url?: string, page: string}} Who drew it, and where it's from.
 */
export const goodsIconCredit = CREDITS.credit;

/**
 * @param {string} key
 * @returns {string} The credit an icon's picture carries, as the Squire's does. It holds
 *   no pair of hyphens, which would break the XML comment it goes in.
 */
export const goodsIconNotice = CREDITS.notice;

/** @returns {string} The credits file, one line for each icon. */
export const goodsIconCredits = CREDITS.credits;
