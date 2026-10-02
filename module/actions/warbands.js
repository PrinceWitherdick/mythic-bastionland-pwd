import { GOODS_PACKS } from "../book-art/goods-folders.js";
import { chooseDialog, confirmDialog, inputDialog } from "../apps/ui.js";
import { postCard, statLabels, t } from "../chat/cards.js";
import { PICK_BLANK, pickedFrom } from "../rules/pick-list.js";
import { escapeHTML } from "../rules/text.js";
import {
	UPKEEP_LOSS,
	UPKEEP_STRAINS,
	UPKEEP_VIRTUE,
	WARBAND_ORIGINS,
	isOrigin,
	isStrain,
	musterState,
	strainedSpirit,
	warbandLine,
	warbandStatLine,
	willNotFollowOrders
} from "../rules/warbands.js";
import { SYSTEM_ID } from "../system-id.js";
import { causedBy } from "./ledger.js";

/**
 * Raising soldiers and keeping them (p11). A Holding musters its Warbands
 * (p21), who expect their basic needs met while they serve; a Warband that is
 * ill-rested, poorly fed or pushed too far loses d6 SPI, and at SPI 0 will not
 * follow orders. The rules are in rules/warbands.js; here they are asked for,
 * rolled and told to the table.
 */

/** Marks a Warband as one a Domain has raised. Kept as its id, as companions are. */
export const MUSTERED_FLAG = "musteredBy";

/** Where a Warband was drawn from, kept so the sheet and cards can say. */
export const ORIGIN_FLAG = "warbandOrigin";

/**
 * @param {Actor} domain
 * @returns {Actor[]} The Warbands it has in the field, in the order they were raised.
 */
export const warbandsOf = (domain) =>
	// Without a Domain to match, none: an unflagged NPC reads the flag as undefined,
	// which would answer to a missing id and hand back the whole bestiary.
	(domain?.id ? game.actors.filter((actor) => actor.type === "npc" && actor.getFlag(SYSTEM_ID, MUSTERED_FLAG) === domain.id) : []);

/**
 * What a Domain's sheet shows of its Warbands: how many it has against how
 * many it can raise, and a line for each.
 * @param {Actor} domain
 * @returns {{state: ReturnType<typeof musterState>, lines: object[]}}
 */
export function musterView(domain) {
	const warbands = warbandsOf(domain);
	return {
		state: musterState(warbands.length, domain.system.muster),
		lines: warbands.map((actor) => {
			const line = warbandLine({ name: actor.name, spi: actor.system.virtues.spi.value, warband: actor.system.warband });
			const origin = actor.getFlag(SYSTEM_ID, ORIGIN_FLAG);
			return {
				id: actor.id,
				uuid: actor.uuid,
				img: actor.img,
				name: line.name,
				spi: t("warband.spiritLine", { spi: line.spi, abbr: t(`virtues.${UPKEEP_VIRTUE}.abbr`) }),
				state: line.state ? t(`npc.warband.${line.state}.label`) : null,
				origin: isOrigin(origin) ? t(`warband.origins.${origin}.label`) : null
			};
		})
	};
}

/**
 * The book's Warbands (p11), once Import PDF has filled the Beasts & Hirelings
 * compendium. None when it hasn't, or this user can't read it.
 * @returns {Promise<Actor[]>}
 */
async function warbandsFromBook() {
	const pack = game.packs.get(`world.${GOODS_PACKS.actors.name}`);
	if (!pack?.visible) return [];
	try {
		return (await pack.getDocuments()).filter((actor) => actor.type === "npc" && actor.folder?.name === t("goods.folders.warbands"));
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't read the book's Warbands`, error);
		return [];
	}
}

/**
 * Ask which Warband is raised, and where its soldiers are drawn from.
 * @param {Actor[]} warbands The book's, if they've been imported.
 * @param {string} intro
 * @returns {Promise<{warband: Actor|typeof PICK_BLANK, origin: string}|null>} Null if closed.
 */
async function pickWarband(warbands, intro) {
	const labels = { ...statLabels(), armour: t("warband.armourAbbr") };
	const data = await inputDialog({
		title: t("warband.muster.title"),
		icon: "fa-solid fa-flag",
		template: "muster",
		context: {
			intro,
			warbands: warbands.map((warband) => ({
				id: warband.id,
				name: warband.name,
				detail: warbandStatLine(warband.system, warband.items.contents.map((item) => item.toObject()), labels) || warband.system.epithet || ""
			})),
			origins: WARBAND_ORIGINS.map((key) => ({ key, label: t(`warband.origins.${key}.label`), hint: t(`warband.origins.${key}.hint`) }))
		},
		ok: { label: t("warband.muster.ok"), icon: "fa-solid fa-flag" }
	});
	if (!data) return null;
	const warband = pickedFrom(warbands, data.warband);
	return warband ? { warband, origin: data.origin } : null;
}

/**
 * Muster a Warband for a Domain (p21): one of the book's, or one with no stats
 * yet, raised beside the Domain in the Actors directory. A Holding that has
 * already raised all it can is asked first, since the Referee may allow it.
 * @param {Actor} domain
 * @returns {Promise<Actor|null>} The Warband.
 */
export async function musterWarband(domain) {
	if (domain?.type !== "domain" || !domain.isOwner) return null;
	if (!game.user.can("ACTOR_CREATE")) {
		ui.notifications.warn(t("warband.cantCreate"));
		return null;
	}

	// Only the tally is wanted here, not a line for every Warband the sheet would draw.
	const state = musterState(warbandsOf(domain).length, domain.system.muster);
	if (state.full && !(await confirmDialog({
		title: t("warband.muster.title"),
		icon: "fa-solid fa-flag",
		message: t("warband.muster.full", { name: escapeHTML(domain.name), count: state.muster })
	}))) return null;

	const book = await warbandsFromBook();
	const choice = await pickWarband(book, t(book.length ? "warband.muster.intro" : "warband.muster.blankIntro", { name: escapeHTML(domain.name) }));
	if (!choice || !isOrigin(choice.origin)) return null;

	const blank = choice.warband === PICK_BLANK;
	const data = blank ? { type: "npc", name: t("warband.muster.newName") } : game.actors.fromCompendium(choice.warband);
	const warband = await Actor.implementation.create({
		...data,
		system: { ...data.system, scale: "warband" },
		folder: domain.folder?.id ?? null,
		flags: {
			...data.flags,
			[SYSTEM_ID]: { ...data.flags?.[SYSTEM_ID], [MUSTERED_FLAG]: domain.id, [ORIGIN_FLAG]: choice.origin }
		},
		// Players who can see the Domain can see its Warbands. Only a GM may hand ownership to others.
		...(game.user.isGM ? { ownership: foundry.utils.deepClone(domain.ownership) } : {})
	});
	if (!warband) return null;

	await postCard(domain, "report", {
		title: t("warband.muster.title"),
		tagline: t("warband.muster.raised", { name: warband.name, domain: domain.name }),
		entries: [{
			name: warband.name,
			pursuit: t(`warband.origins.${choice.origin}.label`),
			lines: [t(`warband.origins.${choice.origin}.text`), t("warband.muster.needs")]
		}],
		hint: t("warband.muster.marshal")
	});
	warband.sheet.render({ force: true });
	return warband;
}

/**
 * Let a Warband go: they are no longer one of the Domain's, though their sheet
 * stays in the Actors directory.
 * @param {Actor} domain
 * @param {string} id The Warband's actor id.
 * @returns {Promise<boolean>} Whether they went.
 */
export async function dismissWarband(domain, id) {
	const warband = warbandsOf(domain).find((actor) => actor.id === id);
	if (!warband || !warband.isOwner) return false;
	if (!(await confirmDialog({
		title: t("warband.dismiss.title"),
		icon: "fa-solid fa-person-walking-arrow-right",
		message: t("warband.dismiss.confirm", { name: escapeHTML(warband.name), domain: escapeHTML(domain.name) })
	}))) return false;

	await warband.unsetFlag(SYSTEM_ID, MUSTERED_FLAG);
	await postCard(domain, "note", {
		icon: "fa-solid fa-person-walking-arrow-right",
		text: t("warband.dismiss.went", { name: warband.name, domain: domain.name })
	});
	return true;
}

/**
 * Ask what has worn a Warband down, and take the SPI it costs.
 * @param {Actor} warband
 * @returns {Promise<{loss: number, spi: number}|null>} Null when nothing was chosen.
 */
export async function strainWarband(warband) {
	if (warband?.system?.scale !== "warband" || !warband.isOwner) return null;
	const strain = await chooseDialog({
		title: t("warband.upkeep.title"),
		icon: "fa-solid fa-utensils",
		message: [t("warband.upkeep.intro", { name: escapeHTML(warband.name) }), t("warband.upkeep.needs")],
		buttons: UPKEEP_STRAINS.map((key, index) => ({
			action: key,
			label: t(`warband.upkeep.strains.${key}.label`),
			default: index === 0
		}))
	});
	if (!isStrain(strain)) return null;
	return wearWarbandDown(warband, strain);
}

/**
 * A Warband ill-rested, poorly fed or pushed too far loses d6 SPI, and at SPI 0
 * will not follow orders (p11).
 * @param {Actor} warband
 * @param {string} strain One of UPKEEP_STRAINS.
 * @returns {Promise<{loss: number, spi: number}|null>}
 */
export async function wearWarbandDown(warband, strain) {
	if (!isStrain(strain) || warband?.system?.scale !== "warband") return null;
	const roll = await new Roll(UPKEEP_LOSS).evaluate();
	const from = warband.system.virtues[UPKEEP_VIRTUE].value;
	const spi = strainedSpirit(from, roll.total);
	await warband.update({ [`system.virtues.${UPKEEP_VIRTUE}.value`]: spi }, causedBy("upkeep"));

	const abbr = t(`virtues.${UPKEEP_VIRTUE}.abbr`);
	await postCard(warband, "report", {
		title: t("warband.upkeep.title"),
		tagline: t(`warband.upkeep.strains.${strain}.label`),
		entries: [{
			name: warband.name,
			lines: [
				t(`warband.upkeep.strains.${strain}.text`),
				t("time.hardship.lost", { amount: roll.total, virtue: abbr, from, to: spi })
			]
		}],
		hint: willNotFollowOrders(spi) ? t("warband.upkeep.broken", { name: warband.name }) : t("warband.upkeep.notDamage")
	}, { rolls: [roll] });
	return { loss: roll.total, spi };
}
