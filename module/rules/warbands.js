/**
 * Recruitment and upkeep (p11). Soldiers come from loyal Vassals, from Knights
 * who share the cause, or from mercenaries paid an agreed price, and all of
 * them expect to be fed and sheltered while they serve. A Warband short of
 * rest or food, or driven too hard, loses SPI, and at SPI 0 it stops taking
 * orders.
 *
 * A Warband at SPI 0 is already Broken on its own sheet (p11), which is the
 * same thing said from the other side, so nothing new is written on them: the
 * strain takes the SPI and the sheet says what that makes of them.
 *
 * How much SPI a strain costs is left as "typically", so it costs d6, which is
 * what Virtue Loss costs everywhere else in the book. Pure, so it can be
 * tested without Foundry.
 */
import { formatStatLine, maxStats } from "./stat-blocks.js";

/** Where soldiers are drawn from, in the order the book lists them. */
export const WARBAND_ORIGINS = Object.freeze(["vassals", "allies", "mercenaries"]);

/** What wears a Warband down. */
export const UPKEEP_STRAINS = Object.freeze(["illRested", "poorlyFed", "pushedTooFar"]);

/** What a strain costs, as Virtue Loss costs elsewhere. */
export const UPKEEP_LOSS = "1d6";

/** The Virtue their needs are met in. */
export const UPKEEP_VIRTUE = "spi";

/**
 * @param {number} spi
 * @param {number} loss
 * @returns {number} Their SPI once a strain has told, never below 0.
 */
export const strainedSpirit = (spi, loss) => Math.max(0, (Number(spi) || 0) - Math.max(0, Number(loss) || 0));

/**
 * @param {number} spi
 * @returns {boolean} Whether they've stopped taking orders, looking out only for themselves.
 */
export const willNotFollowOrders = (spi) => (Number(spi) || 0) <= 0;

/**
 * What a Holding has raised against what it can (Mustering Troops, p21).
 * @param {number} mustered How many Warbands it has in the field.
 * @param {number} muster   How many it can raise: 3 for a Seat of Power, 2 for another Holding.
 * @returns {{mustered: number, muster: number, spare: number, full: boolean}}
 */
export function musterState(mustered, muster) {
	const raised = Math.max(0, Math.trunc(Number(mustered)) || 0);
	const limit = Math.max(0, Math.trunc(Number(muster)) || 0);
	return { mustered: raised, muster: limit, spare: Math.max(0, limit - raised), full: raised >= limit };
}

/**
 * What has become of a Warband (p11). A Mortal Wound routs them from the
 * battle, and so does a failed Morale Save that sent them running (p10); one
 * that ended in surrender takes them out of it too. SPI 0 breaks them, and VIG
 * 0 wipes them out.
 * @param {object} args
 * @param {boolean} args.mortalWound
 * @param {number} args.spi
 * @param {number} args.vig
 * @param {string} [args.moraleBroken] "fled" or "surrendered" once their Morale failed, or blank.
 * @returns {{routed: boolean, surrendered: boolean, broken: boolean, wipedOut: boolean}}
 */
export const warbandState = ({ mortalWound, spi, vig, moraleBroken = "" }) => ({
	routed: Boolean(mortalWound) || moraleBroken === "fled",
	surrendered: moraleBroken === "surrendered",
	broken: spi === 0,
	wipedOut: vig === 0
});

/**
 * @typedef {object} WarbandLine One Warband as a Domain's sheet lists it.
 * @property {string} name
 * @property {number} spi
 * @property {string|null} state The worst of what has become of them, or null while they stand.
 */

/**
 * How a Warband reads in a list: their Spirit, and the worst that has become
 * of them. Wiped out is the end of them, being routed or surrendering takes
 * them out of the battle, and broken leaves them in it but out of hand.
 * @param {{name: string, spi: number, warband: {routed: boolean, surrendered?: boolean, broken: boolean, wipedOut: boolean}|null}} actor
 * @returns {WarbandLine}
 */
export function warbandLine({ name, spi, warband }) {
	const state = ["wipedOut", "routed", "surrendered", "broken"].find((key) => warband?.[key]) ?? null;
	return { name, spi: Number(spi) || 0, state };
}

/**
 * @param {string} origin
 * @returns {boolean} Whether it's one of the three the book draws soldiers from.
 */
export const isOrigin = (origin) => WARBAND_ORIGINS.includes(origin);

/**
 * @param {string} strain
 * @returns {boolean} Whether it's one of the ways the book wears a Warband down.
 */
export const isStrain = (strain) => UPKEEP_STRAINS.includes(strain);

/**
 * A Warband's stat line as the book prints one, such as "VIG 11, CLA 11, SPI 9,
 * 3GD, A2, Lance (d8)", to tell one from another when choosing which to raise.
 * The scores the book gives it are its maximums.
 * @param {object} system An NPC's system data.
 * @param {{type: string, name: string, system: {damage?: string}}[]} [items]
 * @param {Record<string, string>} [labels] Each Virtue's abbreviation, GD's as `guard`, and Armour's as `armour`.
 * @returns {string} Empty when it has no stats yet.
 */
export function warbandStatLine(system, items = [], labels = { vig: "VIG", cla: "CLA", spi: "SPI", guard: "GD", armour: "A" }) {
	const parts = [formatStatLine(maxStats(system), labels)].filter(Boolean);
	if (system.armour > 0) parts.push(`${labels.armour}${system.armour}`);
	for (const item of items) {
		if (item.type !== "weapon") continue;
		parts.push(item.system.damage ? `${item.name} (${item.system.damage})` : item.name);
	}
	return parts.join(", ");
}
