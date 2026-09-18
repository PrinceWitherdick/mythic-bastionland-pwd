import { confirmDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import {
	KNIGHTING_GAIN_ROLL,
	SQUIRE_EQUIPMENT,
	SQUIRE_GUARD,
	SQUIRE_IMAGE,
	SQUIRE_VIRTUE_ROLL,
	knightedLooks,
	knightedVirtues,
	mayTakeSquires,
	ponySystem,
	squireEquipment,
	squireItems,
	squireSystem
} from "../rules/squires.js";
import { escapeHTML } from "../rules/text.js";
import { VIRTUES } from "../rules/virtues.js";

/** @returns {Actor[]} The Company's Knights: every Knight a player owns who isn't a Squire. */
const companyKnights = () => game.actors.filter((actor) => actor.type === "knight" && actor.hasPlayerOwner && !actor.system.isSquire);

/**
 * Give a Knight a Squire (p7): roll 2d6 for each Virtue and a d6 for their
 * extra equipment, then create the Squire, with a dagger and a pony, beside
 * the Knight in the Actors directory. A Knight who already has one gets that
 * Squire's sheet instead.
 * @param {Actor} knight
 * @returns {Promise<Actor|null>} The Squire.
 */
export async function takeSquire(knight) {
	if (knight.type !== "knight" || knight.system.isSquire) return null;
	const existing = knight.system.squire ? fromUuidSync(knight.system.squire) : null;
	if (existing) {
		existing.sheet.render({ force: true });
		return existing;
	}
	if (!game.user.can("ACTOR_CREATE")) {
		ui.notifications.warn(t("squire.cantCreate"));
		return null;
	}

	// Only small Companies may take Squires, but the Referee may bend that.
	const count = companyKnights().length;
	if (!mayTakeSquires(count) && !(await confirmDialog({
		title: t("squire.largeTitle"),
		icon: "fa-solid fa-people-group",
		message: t("squire.largeCompany", { count })
	}))) return null;

	const rolls = [];
	const virtues = {};
	const lines = [];
	for (const key of VIRTUES) {
		const roll = await new Roll(SQUIRE_VIRTUE_ROLL).evaluate();
		rolls.push(roll);
		virtues[key] = roll.total;
		lines.push({ label: t(`virtues.${key}.abbr`), value: roll.total });
	}
	lines.push({ label: t("guard.abbr"), value: SQUIRE_GUARD });

	const equipmentRoll = await new Roll("1d6").evaluate();
	rolls.push(equipmentRoll);
	const names = { dagger: t("chooser.kit.dagger"), ...Object.fromEntries(SQUIRE_EQUIPMENT.map(({ key }) => [key, t(`squire.equipment.${key}`)])) };
	lines.push({ label: t("squire.equipmentRoll", { roll: equipmentRoll.total }), value: names[squireEquipment(equipmentRoll.total).key] });

	// Players who can see the Knight can see their Squire. Only a GM may hand ownership to others.
	const shared = { folder: knight.folder?.id ?? null, ...(game.user.isGM ? { ownership: foundry.utils.deepClone(knight.ownership) } : {}) };
	// The pony comes first, so the Squire is created already riding it.
	const name = t("squire.name", { knight: knight.name });
	const pony = await Actor.implementation.create({ ...shared, name: t("squire.pony", { name }), type: "npc", system: ponySystem() });
	const squire = await Actor.implementation.create({
		...shared,
		name,
		type: "knight",
		img: SQUIRE_IMAGE,
		system: { ...squireSystem(virtues), serves: knight.uuid, steed: pony?.uuid ?? "" },
		items: squireItems(equipmentRoll.total, names)
	});
	if (!squire) {
		await pony?.delete();
		return null;
	}
	if (pony) lines.push({ label: t("steed.label"), value: pony.name });
	await knight.update({ "system.squire": squire.uuid });

	await postCard(knight, "creation", {
		title: t("squire.title"),
		tagline: t("squire.tagline", { name: squire.name, knight: knight.name }),
		lines,
		note: t("squire.hint")
	}, { rolls });
	squire.sheet.render({ force: true });
	return squire;
}

/**
 * Knight a Squire (p7): they gain d6 in each Virtue, and from then on can gain
 * Glory and perform Feats.
 * @param {Actor} squire
 * @returns {Promise<Record<string, {value: number, max: number}>|null>} Their new Virtues.
 */
export async function knightSquire(squire) {
	if (!squire.system.isSquire) return null;
	const confirmed = await confirmDialog({
		title: t("squire.knightConfirmTitle"),
		icon: "fa-solid fa-khanda",
		message: t("squire.knightConfirm", { name: escapeHTML(squire.name) })
	});
	if (!confirmed) return null;

	const rolls = [];
	const gains = {};
	for (const key of VIRTUES) {
		const roll = await new Roll(KNIGHTING_GAIN_ROLL).evaluate();
		rolls.push(roll);
		gains[key] = roll.total;
	}
	// Read before the update, which changes the Squire's Virtues in place.
	const before = Object.fromEntries(VIRTUES.map((key) => [key, squire.system.virtues[key].max]));
	const virtues = knightedVirtues(squire.system.virtues, gains);

	const master = squire.system.serves ? fromUuidSync(squire.system.serves) : null;
	await squire.update({ "system.isSquire": false, "system.serves": "", "system.glory": 0, "system.virtues": virtues, ...knightedLooks(squire, Actor.implementation.DEFAULT_ICON) });
	if (master?.isOwner && master.system.squire === squire.uuid) await master.update({ "system.squire": "" });

	await postCard(squire, "creation", {
		title: t("squire.knightedTitle"),
		tagline: t("squire.knightedTagline", { name: squire.name }),
		lines: VIRTUES.map((key) => ({
			label: t(`virtues.${key}.abbr`),
			value: t("squire.knightedValue", { gain: gains[key], from: before[key], to: virtues[key].max })
		}))
	}, { rolls });
	return virtues;
}
