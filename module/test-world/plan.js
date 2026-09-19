/**
 * A fake game of Mythic Bastionland, five Seasons in, for seeing what the
 * sheets, the GM Toolkit and a Realm look like once a campaign has been going
 * a while. This is the pure half: which places the Company goes to and by
 * what road, what a Knight's Property turns into, and their arms. The
 * "(TEST ONLY) Populate World" macro runs populate.js, which plays it out in
 * the world. Pure, so it can be tested without Foundry.
 */
import { SPECIALIST_DICE } from "../rules/attack.js";
import { CHARGE_SCALE, tintCharge } from "../rules/heraldry-charges.js";
import { DIVISIONS, FESS_POINT, SHIELD_HEIGHT, SHIELD_PATH, SHIELD_WIDTH, tinctureColor } from "../rules/heraldry.js";
import { LAKE, terrainAt } from "../rules/realm.js";
import { edgeKey, hexDistance, hexKey, neighbours, sameHex } from "../rules/realm-geometry.js";
import { parseAttacks, parseStatLine } from "../rules/stat-blocks.js";
import { capitalise, escapeHTML } from "../rules/text.js";

/* -------------------------------------------- */
/*  Property                                    */
/* -------------------------------------------- */

/**
 * @param {string} text
 * @param {RegExp} separator Anchored with ^, tried at each place outside parentheses.
 * @returns {string[]} The text split there, each part trimmed, empty parts dropped.
 */
function splitOutside(text, separator) {
	const parts = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < text.length; index++) {
		const character = text[index];
		if (character === "(") depth++;
		else if (character === ")") depth = Math.max(0, depth - 1);
		else if (depth === 0) {
			const match = separator.exec(text.slice(index));
			if (!match) continue;
			parts.push(text.slice(start, index));
			index += match[0].length - 1;
			start = index + 1;
		}
	}
	parts.push(text.slice(start));
	return parts.map((part) => part.trim()).filter(Boolean);
}

const COMMA = /^,/;
const JOINER = /^\s+(?:and|or)\s+/i;
const LEADING_JOINER = /^(?:and|or)\s+/i;
const DICE = /\b(\d*d\d+)\b/i;
const ARMOUR_VALUE = /(?:^|[\s,])A(\d+)\b/;
const TRAMPLE = /(\d*d\d+)\s+trample/i;

/**
 * @param {string} text
 * @returns {{open: number, close: number, inner: string}|null} The first outermost parenthesis.
 */
function firstGroup(text) {
	let depth = 0;
	let open = -1;
	for (let index = 0; index < text.length; index++) {
		if (text[index] === "(") {
			if (depth === 0) open = index;
			depth++;
		} else if (text[index] === ")" && depth > 0) {
			depth--;
			if (depth === 0) return { open, close: index, inner: text.slice(open + 1, index) };
		}
	}
	return null;
}

/**
 * @param {string} text
 * @returns {string} Commas and spaces trimmed from both ends.
 */
const tidy = (text) => String(text ?? "").replace(/^[\s,;.]+|[\s,;.]+$/g, "");

/**
 * What a parenthesis on a Property line says the thing before it is: a
 * companion with a stat line, such as a steed; armour, such as "(A1)" or a
 * shield's "(d4, A1)"; or a weapon, whose parenthesis starts with its dice.
 * @param {string} inner
 * @returns {"companion"|"armour"|"weapon"|null}
 */
function groupKind(inner) {
	if (Number.isInteger(parseStatLine(inner)?.stats.vig)) return "companion";
	if (ARMOUR_VALUE.test(inner)) return "armour";
	if (/^\s*\d*d\d+/i.test(inner)) return "weapon";
	return null;
}

/**
 * The armour type a piece's name suggests. Only one of each can be worn (p12).
 * @param {string} name
 * @returns {"coat"|"plates"|"helm"|"shield"}
 */
export function armourKind(name) {
	if (/shield|buckler/i.test(name)) return "shield";
	if (/helm|coif|hood|mask/i.test(name)) return "helm";
	if (/plate|splint|brigandine|scale|pauldron/i.test(name)) return "plates";
	return "coat";
}

/** @returns {string} Paragraphs of HTML, one for each piece of text given. */
const paragraphs = (...texts) => texts.map(tidy).filter(Boolean).map((text) => `<p>${escapeHTML(capitalise(text))}</p>`).join("");

/**
 * @typedef {object} Companion A creature carried as Property, such as a steed.
 * @property {string} name
 * @property {{vig: number, cla: number, spi: number, guard: number}} stats
 * @property {number} armour
 * @property {string|null} trample Its trample's dice, such as "d6", joining its rider's charge (p10).
 * @property {string[]} notes Anything else said of it.
 */

/**
 * One piece of Property, from the text before a parenthesis, the parenthesis,
 * and whatever follows it.
 * @param {string} chunk
 * @returns {{item?: object, companion?: Companion}}
 */
function readChunk(chunk) {
	const text = chunk.replace(LEADING_JOINER, "").trim();
	const group = firstGroup(text);
	const kind = group && groupKind(group.inner);
	const name = kind ? capitalise(tidy(text.slice(0, group.open))) : "";
	if (!kind || !name) return { item: { type: "gear", name: capitalise(tidy(text)) } };
	const after = tidy(text.slice(group.close + 1));

	if (kind === "companion") {
		const { stats, rest } = parseStatLine(group.inner);
		const parts = splitOutside(rest, COMMA);
		const trample = parts.map((part) => TRAMPLE.exec(part)?.[1]).find(Boolean) ?? null;
		const armour = Number(parts.map((part) => /^A(\d+)$/.exec(part)?.[1]).find(Boolean) ?? 0);
		const notes = [...parts.filter((part) => !TRAMPLE.test(part) && !/^A\d+$/.test(part)), after].map(tidy).filter(Boolean);
		return { companion: { name, stats, armour, trample: trample?.toLowerCase() ?? null, notes } };
	}

	if (kind === "armour") {
		const armour = Number(ARMOUR_VALUE.exec(group.inner)[1]);
		const damage = DICE.exec(group.inner)?.[1].toLowerCase() ?? "";
		const note = splitOutside(group.inner.replace(ARMOUR_VALUE, " ").replace(DICE, " "), COMMA).map(tidy).filter(Boolean).join(", ");
		return {
			item: {
				type: "armour",
				name,
				system: { kind: armourKind(name), armour, damage, equipped: true, description: paragraphs(note, after) }
			}
		};
	}

	const [attack] = parseAttacks(`${name} (${group.inner})`).attacks;
	if (!attack) return { item: { type: "gear", name: capitalise(tidy(text)) } };
	const notes = attack.note ? splitOutside(attack.note, COMMA) : [];
	// "+d8 dropping from above": a specialist weapon's extra die, and when it applies (p12).
	const special = notes.map((note) => /^\+\s*(d\d+)\s+(.+)$/i.exec(note)).find((match) => match && SPECIALIST_DICE.includes(match[1].toLowerCase()));
	const system = {
		damage: attack.damage,
		equipped: true,
		specialist: special ? { die: special[1].toLowerCase(), situation: tidy(special[2]) } : { die: "", situation: "" },
		description: paragraphs(...notes.filter((note) => !special || note !== special[0]), after)
	};
	for (const quality of ["hefty", "long", "slow", "ranged", "blast", "ignoresArmour", "trample", "heftyMounted"]) system[quality] = attack.qualities.includes(quality);
	return { item: { type: "weapon", name, system } };
}

/**
 * What a Knight's Property turns into once their player has filled the sheet
 * in: weapons with their dice and qualities, armour with its value and type,
 * other gear by name, and a steed or other companion to be made an NPC. A line
 * with nothing typed in it, such as a curious trinket, stays one piece of gear.
 * Where two pieces are the same armour type, only the first is worn.
 * @param {string[]} lines As the book prints them, such as "Old sword (d8 hefty), mail (A1)".
 * @returns {{items: object[], companions: Companion[]}} Item data, and the companions.
 */
export function propertyItems(lines) {
	const items = [];
	const companions = [];
	for (const line of lines ?? []) {
		const text = String(line ?? "").trim();
		if (!text) continue;
		const typed = splitOutside(text, COMMA).some((part) => {
			const group = firstGroup(part);
			return group && groupKind(group.inner);
		});
		const chunks = typed ? splitOutside(text, COMMA).flatMap((part) => splitOutside(part, JOINER)) : [text];
		for (const chunk of chunks) {
			const { item, companion } = readChunk(chunk);
			if (item) items.push(item);
			if (companion) companions.push(companion);
		}
	}
	const worn = new Set();
	for (const item of items) {
		if (item.type !== "armour") continue;
		if (worn.has(item.system.kind)) item.system.equipped = false;
		worn.add(item.system.kind);
	}
	return { items, companions };
}

/** @param {string} name */
export const isSteed = (name) => /steed|horse|charger|stallion|warhorse|mount|pony/i.test(String(name ?? ""));

/**
 * NPC data for a companion, with its trample as a weapon.
 * @param {Companion} companion
 * @param {object} [options]
 * @param {string} [options.trampleName] Names the trample weapon.
 * @returns {{type: "npc", name: string, system: object, items: object[]}}
 */
export function companionActorData({ name, stats, armour, trample, notes }, { trampleName = "Trample" } = {}) {
	const track = (value) => ({ value, max: value });
	return {
		type: "npc",
		name,
		system: {
			virtues: { vig: track(stats.vig), cla: track(stats.cla), spi: track(stats.spi) },
			guard: track(stats.guard),
			armour,
			notes: paragraphs(...notes)
		},
		items: trample ? [{ type: "weapon", name: trampleName, system: { damage: trample, trample: true, equipped: true } }] : []
	};
}

/* -------------------------------------------- */
/*  Heraldry                                    */
/* -------------------------------------------- */

/**
 * @typedef {object} Arms
 * @property {string|null} division One of DIVISIONS' keys, or null for a plain field.
 * @property {string[]} field The tincture of each of the division's groups, in group order.
 * @property {{svg: string, tincture: string}|null} [charge] A charge's file as shipped, and its tincture.
 */

/**
 * A Knight's arms as the heraldry painter would paint them: the field, its
 * division, and a charge at the fess point, all inside the shield.
 * @param {Arms} arms
 * @param {{width: number, height: number}} size In pixels, the size of the painter's painting.
 * @returns {string} An SVG document.
 */
export function heraldrySvg({ division = null, field, charge = null }, { width, height }) {
	const scale = ([x, y]) => `${x * SHIELD_WIDTH},${y * SHIELD_HEIGHT}`;
	const parts = DIVISIONS.find(({ key }) => key === division)?.parts ?? null;
	const ground = parts
		? parts.map(({ group, points }) => `<polygon points="${points.map(scale).join(" ")}" fill="${tinctureColor(field[group] ?? field[0])}"/>`).join("")
		: `<rect width="${SHIELD_WIDTH}" height="${SHIELD_HEIGHT}" fill="${tinctureColor(field[0])}"/>`;
	let bearing = "";
	if (charge?.svg) {
		// The charge fills its box as the painter fits one, centred on the fess point.
		const tinted = tintCharge(charge.svg, tinctureColor(charge.tincture))
			.replace(/^<svg\b[^>]*>/, (root) => root.replace(/\swidth="[^"]*"/, ' width="100%"').replace(/\sheight="[^"]*"/, ' height="100%"'));
		const boxWidth = SHIELD_WIDTH * CHARGE_SCALE;
		const boxHeight = SHIELD_HEIGHT * CHARGE_SCALE;
		const x = SHIELD_WIDTH / 2 - boxWidth / 2;
		const y = SHIELD_HEIGHT * FESS_POINT - boxHeight / 2;
		bearing = `<svg x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}">${tinted}</svg>`;
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${SHIELD_WIDTH} ${SHIELD_HEIGHT}" preserveAspectRatio="none">`
		+ `<defs><clipPath id="shield"><path d="${SHIELD_PATH}"/></clipPath></defs>`
		+ `<g clip-path="url(#shield)">${ground}${bearing}</g></svg>`;
}

/* -------------------------------------------- */
/*  The Company's road                          */
/* -------------------------------------------- */

/** How many hexes the Company covers in a day of travel: one in the Morning, one in the Afternoon. */
export const HEXES_PER_DAY = 2;

/** @returns {number} Top to bottom, then left to right. */
const byPlace = (a, b) => a.row - b.row || a.col - b.col;

/**
 * @template {{hex: {col: number, row: number}}} T
 * @param {T[]} list
 * @param {{col: number, row: number}} to
 * @returns {T[]} Nearest first, ties broken by place.
 */
const nearestTo = (list, to) => [...list].sort((a, b) => hexDistance(a.hex, to) - hexDistance(b.hex, to) || byPlace(a.hex, b.hex));

/**
 * The places the Company's story goes through. Each is picked from the Realm
 * so that the whole road can be walked, and is null where the Realm has none.
 * @param {import("../rules/realm.js").Realm} realm
 * @returns {{seat: object|null, sanctum: object|null, ruin: object|null, dwelling: object|null, monument: object|null,
 *   tourney: object|null, domain: object|null, myths: object[]}} `myths` in the order the Company meets them.
 */
export function pickPlaces(realm) {
	const seat = realm.holdings.find((holding) => holding.seat) ?? realm.holdings[0] ?? null;
	const home = seat?.hex ?? { col: 1, row: 1 };
	const landmarks = (type) => realm.landmarks.filter((landmark) => landmark.type === type);
	const sanctum = nearestTo(landmarks("sanctum").filter((landmark) => landmark.seer), home)[0] ?? nearestTo(landmarks("sanctum"), home)[0] ?? null;
	const ruin = nearestTo(landmarks("ruin"), sanctum?.hex ?? home)[0] ?? null;
	const dwelling = nearestTo(landmarks("dwelling"), home)[0] ?? null;
	const monument = nearestTo(landmarks("monument"), ruin?.hex ?? home)[0] ?? null;

	const others = nearestTo(realm.holdings.filter((holding) => holding !== seat), ruin?.hex ?? home);
	const tourney = others.find((holding) => ["town", "castle"].includes(holding.style)) ?? others[0] ?? null;
	const domain = others.find((holding) => holding !== tourney) ?? null;

	const first = nearestTo(realm.myths, tourney?.hex ?? home)[0] ?? null;
	const rest = realm.myths.filter((myth) => myth !== first);
	const second = nearestTo(rest, domain?.hex ?? home)[0] ?? null;
	const third = nearestTo(rest.filter((myth) => myth !== second), second?.hex ?? home)[0] ?? null;
	return { seat, sanctum, ruin, dwelling, monument, tourney, domain, myths: [first, second, third].filter(Boolean) };
}

/**
 * The shortest road between two hexes that crosses no Barrier (p18), keeping
 * out of lakes where it can.
 * @param {import("../rules/realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} from
 * @param {{col: number, row: number}} to
 * @returns {{col: number, row: number}[]} The hexes after `from`, up to and including `to`. Empty when they're the same.
 */
export function realmRoad(realm, g, from, to) {
	if (sameHex(from, to)) return [];
	const barriers = new Set(realm.barriers.map((barrier) => barrier.edge));
	const search = (dry) => {
		const cameFrom = new Map([[hexKey(from), null]]);
		const queue = [from];
		while (queue.length) {
			const hex = queue.shift();
			if (sameHex(hex, to)) break;
			for (const { hex: next } of neighbours(g, hex)) {
				const key = hexKey(next);
				if (cameFrom.has(key) || barriers.has(edgeKey(hex, next))) continue;
				if (dry && !sameHex(next, to) && terrainAt(realm, g, next) === LAKE) continue;
				cameFrom.set(key, hex);
				queue.push(next);
			}
		}
		if (!cameFrom.has(hexKey(to))) return null;
		const road = [];
		for (let hex = to; hex && !sameHex(hex, from); hex = cameFrom.get(hexKey(hex))) road.unshift(hex);
		return road;
	};
	return search(true) ?? search(false) ?? [];
}

/**
 * @typedef {object} RoadStep
 * @property {{col: number, row: number}} hex
 * @property {string|null} arrive The stop reached there, or null on the way.
 */

/**
 * A Season's travel, a day at a time: the road to each of its stops in turn,
 * two hexes a day.
 * @param {import("../rules/realm.js").Realm} realm
 * @param {object} g
 * @param {{col: number, row: number}} from Where the Company is as the Season begins.
 * @param {{name: string, hex: {col: number, row: number}}[]} stops
 * @param {object} [options]
 * @param {boolean} [options.stopShort] End a hex before the last stop, still on the road to it.
 * @returns {{days: RoadStep[][], end: {col: number, row: number}}}
 */
export function seasonRoad(realm, g, from, stops, { stopShort = false } = {}) {
	const steps = [];
	let here = from;
	for (const [index, stop] of stops.entries()) {
		const road = realmRoad(realm, g, here, stop.hex);
		const last = index === stops.length - 1;
		const walked = last && stopShort ? road.slice(0, -1) : road;
		walked.forEach((hex, step) => steps.push({ hex, arrive: step === road.length - 1 ? stop.name : null }));
		if (walked.length) here = walked.at(-1);
	}
	const days = [];
	for (let index = 0; index < steps.length; index += HEXES_PER_DAY) days.push(steps.slice(index, index + HEXES_PER_DAY));
	return { days, end: here };
}

/**
 * Barriers beside the road the Company has walked, which it would have found
 * barring its way. Those already revealed are left out.
 * @param {import("../rules/realm.js").Realm} realm
 * @param {{col: number, row: number}[]} walked
 * @returns {string[]} Their edge keys, in the order the road reaches them.
 */
export function barriersBeside(realm, walked) {
	const found = [];
	for (const hex of walked) {
		const key = hexKey(hex);
		for (const barrier of realm.barriers) {
			if (barrier.revealed || found.includes(barrier.edge)) continue;
			if (barrier.edge.split("|").includes(key)) found.push(barrier.edge);
		}
	}
	return found;
}
