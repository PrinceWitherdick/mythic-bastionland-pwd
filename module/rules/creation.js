/**
 * Making a Knight (Beginnings & Glory p6, Knighthood p7). Plain data and
 * functions, so the Knight chooser's choices can be tested without Foundry.
 */
import { RANKS } from "./glory.js";
import { propertyGear } from "./property.js";
import { formatStatLine } from "./stat-blocks.js";
import { escapeHTML } from "./text.js";
import { VIRTUES } from "./virtues.js";

const gloryFor = (rankKey) => RANKS.find((rank) => rank.key === rankKey).glory;

/**
 * The Starts a Company can begin with. Each sets the dice for Virtues and GD,
 * the Knights' Age, and their Rank, given as the Glory that reaches it.
 */
export const STARTS = Object.freeze([
	Object.freeze({ key: "wanderer", virtues: "1d12 + 1d6", guard: "1d6", age: "young", rank: "errant", glory: gloryFor("errant") }),
	Object.freeze({ key: "courtier", virtues: "1d12 + 6", guard: "2d6", age: "mature", rank: "gallant", glory: gloryFor("gallant") }),
	Object.freeze({ key: "ruler", virtues: "1d12 + 6", guard: "1d6 + 6", age: "mature", rank: "tenant", glory: gloryFor("tenant") })
]);

/** "If unsure, roll d12+d6" for Virtues and d6 for GD: the Wanderer's dice. */
export const DEFAULT_START = "wanderer";

/**
 * @param {string} key
 * @returns {object} The Start, or the default for an unknown key.
 */
export function startFor(key) {
	return STARTS.find((start) => start.key === key) ?? STARTS.find((start) => start.key === DEFAULT_START);
}

/** What every Knight carries besides their Property (p7). Names live under `bastionland.chooser.kit`. */
export const STANDARD_KIT = Object.freeze([
	Object.freeze({ key: "dagger", type: "weapon", system: Object.freeze({ damage: "d6" }) }),
	Object.freeze({ key: "torches", type: "gear" }),
	Object.freeze({ key: "rope", type: "gear" }),
	Object.freeze({ key: "rations", type: "gear" }),
	Object.freeze({ key: "camping", type: "gear" })
]);

/**
 * @param {string} name e.g. "The Lantern Knight".
 * @returns {string} "Lantern", for "Known as the ___ Knight".
 */
export function knightTypeFromName(name) {
	return String(name ?? "").trim().replace(/^the\s+/i, "").replace(/\s+knight$/i, "").trim();
}

/** Marks the prompts line so the Seer page can centre it. */
const PROMPTS_CLASS = ' class="bastionland-seer__prompts"';

/**
 * The prompts, each "Label: value" kept whole on one line, with a "~" between
 * them that the Seer page hides wherever the line wraps (see prompt-breaks.js),
 * so no line starts or ends with one.
 * @param {{label: string, value: string}[]} prompts
 * @param {"plain"|"whole"} [older] As older fills wrote them: plain text, or each prompt whole with a trailing "~".
 * @returns {string} HTML
 */
function promptsHTML(prompts, older) {
	const pairs = prompts.map(({ label, value }) => `<strong>${escapeHTML(label)}</strong>: ${escapeHTML(value)}`);
	if (older === "plain") return pairs.join(" ~ ");
	if (older === "whole") return pairs.map((pair, i) => `<span class="bastionland-seer__prompt">${pair}${i < pairs.length - 1 ? " ~" : ""}</span>`).join(" ");
	return pairs.map((pair) => `<span class="bastionland-seer__prompt">${pair}</span>`)
		.join('<span class="bastionland-seer__sep"> <span>~</span> </span>');
}

/**
 * What the book says of a Seer, for the Seer page of their Knight's sheet:
 * their stat line, each trait as a bullet, then the prompts along the foot of the page.
 * @param {{stats?: object|null, lines?: string[]|null, prompts?: {label: string, value: string}[]|null}|null} seer From the art index.
 * @param {Record<string, string>} [labels] For formatStatLine.
 * @param {"plain"|"whole"} [older] The prompts as older fills wrote them, to recognise those.
 * @returns {string} HTML, or "" when Import PDF couldn't read their text.
 */
export function seerInfo(seer, labels, older) {
	const stats = formatStatLine(seer?.stats ?? null, labels);
	const lines = (seer?.lines ?? []).filter(Boolean);
	const prompts = (seer?.prompts ?? []).filter((prompt) => prompt?.label && prompt?.value);
	return [
		stats ? `<p><strong>${escapeHTML(stats)}</strong></p>` : "",
		lines.length ? `<ul>${lines.map((line) => `<li>${escapeHTML(line)}</li>`).join("")}</ul>` : "",
		prompts.length ? `<p${PROMPTS_CLASS}>${promptsHTML(prompts, older)}</p>` : ""
	].join("");
}

/**
 * The Seer who knighted a Knight, found in the art index by the Seer's name,
 * or else by the Knight's own roll, since each Seer shares their Knight's page.
 * @param {object|null} index The art index.
 * @param {{seer: string, knightType: string}} knight
 * @returns {object|null} The Seer's entry.
 */
export function seerForKnight(index, { seer = "", knightType = "" }) {
	const seers = index?.seers ?? [];
	const named = String(seer).trim().toLowerCase();
	const byName = named && seers.find((entry) => entry.name?.trim().toLowerCase() === named);
	if (byName) return byName;
	const type = String(knightType).trim().toLowerCase();
	const knight = type && (index?.knights ?? []).find((entry) => entry.name && knightTypeFromName(entry.name).toLowerCase() === type);
	return (knight && seers.find((entry) => entry.roll === knight.roll)) || null;
}

/**
 * What a Knight's sheet fills in about their Seer on its own. The Seer is found by the name beside
 * "Knighted by", or by the Knight's roll while that's blank. The picture and what the book says are
 * filled only where they're empty or still hold what the book says of some Seer, so a new name
 * swaps them over but something picked or written by hand is kept. A Squire has no Seer yet (p7).
 * @param {object|null} index The art index.
 * @param {{isSquire?: boolean, seer?: string, knightType?: string, seerImg?: string, seerInfo?: string}} knight
 * @param {Record<string, string>} [labels] For seerInfo.
 * @returns {object} An Actor update, empty when there's nothing to fill.
 */
export function seerAutoFill(index, knight, labels) {
	if (knight.isSquire) return {};
	const named = String(knight.seer ?? "").trim();
	const seer = named ? seerForKnight(index, { seer: named }) : seerForKnight(index, { knightType: knight.knightType });
	if (!seer) return {};
	const seers = index?.seers ?? [];
	const fromBook = (value, of) => !value || seers.some((entry) => of(entry).includes(value));
	const update = {};
	if (!named && seer.name) update["system.seer"] = seer.name;
	if (seer.path && seer.path !== knight.seerImg && fromBook(knight.seerImg, (entry) => [entry.path])) {
		update["system.seerImg"] = seer.path;
	}
	const info = seerInfo(seer, labels);
	// Imports before the prompts were read gave the same text without them,
	// fills before the prompts were centred gave them without their class,
	// and fills before the "~" came out of wrapped lines gave them as plain text
	// or with each prompt whole. Every one of those opens with the Seer's stats
	// and traits, so only a Seer whose own open the text is written out in full.
	const asBookGave = (entry) => {
		const withoutPrompts = seerInfo({ ...entry, prompts: null }, labels);
		if (!String(knight.seerInfo).startsWith(withoutPrompts)) return [];
		const plain = seerInfo(entry, labels, "plain");
		return [seerInfo(entry, labels), seerInfo(entry, labels, "whole"), plain, plain.replace(PROMPTS_CLASS, ""), withoutPrompts];
	};
	if (info && info !== knight.seerInfo && fromBook(knight.seerInfo, asBookGave)) {
		update["system.seerInfo"] = info;
	}
	return update;
}

/**
 * Knights other characters already are, so the chooser can steer each player
 * to a different one.
 * @param {{id: string, name: string, knightType: string}[]} knights Knight actors in the world.
 * @param {{roll: string, name: string|null}[]} entries Knights from the art index.
 * @param {string|null} [exceptId] The Knight being chosen for.
 * @returns {Map<string, string>} Roll to the name of the character who took it.
 */
export function takenKnights(knights, entries, exceptId = null) {
	const rollsByType = new Map(entries
		.filter((entry) => entry.name)
		.map((entry) => [knightTypeFromName(entry.name).toLowerCase(), entry.roll]));

	const taken = new Map();
	for (const knight of knights) {
		if (knight.id === exceptId) continue;
		const roll = rollsByType.get(String(knight.knightType ?? "").trim().toLowerCase());
		if (roll && !taken.has(roll)) taken.set(roll, knight.name);
	}
	return taken;
}

/**
 * The actor update for the choices made. Virtues and GD are only set once
 * rolled, and each sets both its current and maximum value. The Knight's
 * portrait becomes the actor's picture, and the square cut around their face
 * becomes their token, but only when those were imported.
 * @param {object} choice
 * @param {object} choice.start              From STARTS.
 * @param {Record<string, number|null>} [choice.virtues]
 * @param {number|null} [choice.guard]
 * @param {object|null} [choice.knight]      A Knight from the art index.
 * @param {object|null} [choice.seer]        Their Seer from the art index.
 * @param {Record<string, string>} [choice.statLabels] For the Seer's stat line.
 * @returns {object}
 */
export function knightUpdate({ start, virtues = {}, guard = null, knight = null, seer = null, statLabels }) {
	const update = { "system.age": start.age, "system.glory": start.glory };
	for (const key of VIRTUES) {
		const value = virtues[key];
		if (!Number.isInteger(value)) continue;
		update[`system.virtues.${key}.value`] = value;
		update[`system.virtues.${key}.max`] = value;
	}
	if (Number.isInteger(guard)) {
		update["system.guard.value"] = guard;
		update["system.guard.max"] = guard;
	}
	if (knight) {
		update["system.knightType"] = knightTypeFromName(knight.name);
		update["system.seer"] = seer?.name ?? "";
		// The Knight's notes on their Seer stay; what the book says follows the new Seer.
		update["system.seerImg"] = seer?.path ?? "";
		update["system.seerInfo"] = seerInfo(seer, statLabels);
		if (knight.path) update.img = knight.path;
		if (knight.token) update["prototypeToken.texture.src"] = knight.token;
	}
	return update;
}

/**
 * Items a Knight starts with: their Property as weapons, armour and gear,
 * their Ability and Passion, and the standard kit.
 * @param {object|null} knight   A Knight from the art index.
 * @param {Record<string, string>} kitNames Names for STANDARD_KIT, by key.
 * @returns {object[]} Item data for `createEmbeddedDocuments`.
 */
export function knightItems(knight, kitNames) {
	const items = propertyGear(knight?.property);
	for (const type of ["ability", "passion"]) {
		const part = knight?.[type];
		if (part) items.push({ type, name: part.name, system: { description: `<p>${escapeHTML(part.text)}</p>` } });
	}
	for (const { key, type, system } of STANDARD_KIT) {
		items.push(system ? { type, name: kitNames[key], system: { ...system } } : { type, name: kitNames[key] });
	}
	return items;
}
