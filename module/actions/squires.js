import { confirmDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import {
	CHOOSING_FLAG,
	KNIGHTING_GAIN_ROLL,
	SQUIRE_EQUIPMENT,
	SQUIRE_GUARD,
	SQUIRE_IMAGE,
	SQUIRE_VIRTUE_ROLL,
	companySize,
	knightedLooks,
	knightedVirtues,
	mayTakeSquires,
	outgrewSquires,
	ponySystem,
	squireEquipment,
	squireItems,
	squireSystem
} from "../rules/squires.js";
import { escapeHTML } from "../rules/text.js";
import { VIRTUES } from "../rules/virtues.js";
import { SYSTEM_ID } from "../system-id.js";

/** @returns {number} Knights in the Company: one for each player who owns a Knight, so a fallen Knight and their heir count once. */
export function companyKnightCount() {
	const players = game.users.filter((user) => !user.isGM);
	return companySize(game.actors.filter((actor) => actor.type === "knight").map((actor) => ({
		isSquire: Boolean(actor.system.isSquire),
		players: players.filter((user) => actor.testUserPermission(user, "OWNER")).map((user) => user.id)
	})));
}

/** The Company's size when last counted, kept fresh by watchCompanySize. */
let lastCompanyCount = 0;

/** @returns {number} The Company's size when last counted, cheap enough for every sheet render. */
export const companySizeNow = () => lastCompanyCount;

/**
 * Recount the Company after a Knight is created, deleted, Knighted or handed
 * to another player. Open Knight sheets are redrawn when the count changes,
 * since their Squire hint shows it. If the Company grew past 2 Knights while Squires remain, whisper
 * the GMs, since only small Companies may keep them (p7). Whether the Squires
 * stay is the Referee's call, so nothing else changes.
 * @returns {Promise<ChatMessage|null>}
 */
async function recountCompany() {
	const before = lastCompanyCount;
	lastCompanyCount = companyKnightCount();
	if (before !== lastCompanyCount) {
		for (const actor of game.actors) if (actor.type === "knight" && actor.sheet?.rendered) actor.sheet.render();
	}
	if (!outgrewSquires(before, lastCompanyCount) || !game.users.activeGM?.isSelf) return null;
	const squires = game.actors.filter((actor) => actor.type === "knight" && actor.system.isSquire);
	if (!squires.length) return null;
	const names = new Intl.ListFormat(game.i18n.lang, { type: "conjunction" }).format(squires.map((squire) => squire.name));
	return postCard(null, "note", {
		icon: "fa-solid fa-people-group",
		text: t("squire.companyGrew", { count: lastCompanyCount, squires: names })
	}, { mode: "gm" });
}

/**
 * @param {Actor} actor
 * @param {object} [changes] An update's changes; none for a creation or deletion.
 * @returns {boolean} Whether the change could alter the Company's size.
 */
const changesCompany = (actor, changes) => actor.type === "knight" && (!changes || "ownership" in changes || changes.system?.isSquire !== undefined);

/** Count the Company once the world is ready, then recount it as Knights come and go. */
export function watchCompanySize() {
	lastCompanyCount = companyKnightCount();
	Hooks.on("createActor", (actor) => changesCompany(actor) && recountCompany());
	Hooks.on("updateActor", (actor, changes) => changesCompany(actor, changes) && recountCompany());
	Hooks.on("deleteActor", (actor) => changesCompany(actor) && recountCompany());
}

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
	const count = companyKnightCount();
	if (!mayTakeSquires(count)) {
		if (!game.user.isGM) {
			ui.notifications.warn(t("squire.largeCompanyPlayer", { count }));
			return null;
		}
		if (!(await confirmDialog({
			title: t("squire.largeTitle"),
			icon: "fa-solid fa-people-group",
			message: t("squire.largeCompany", { count })
		}))) return null;
	}

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
 * @param {Actor} actor
 * @returns {boolean} Whether they're a Squire just Knighted, still to choose which Knight they became.
 */
export const isChoosingKnight = (actor) => actor?.type === "knight" && !actor.system.isSquire && Boolean(actor.getFlag(SYSTEM_ID, CHOOSING_FLAG));

/**
 * Open the chooser for a Knighted Squire to choose which Knight they became,
 * keeping everything they have.
 * @param {Actor} knight
 * @returns {Promise<Application>}
 */
export async function chooseKnightedSquire(knight) {
	// Loaded when wanted, so this file doesn't pull in the application classes.
	const { openKnightChooser } = await import("../apps/KnightChooser.js");
	return openKnightChooser(knight, { knighting: true });
}

/**
 * Knight a Squire (p7): they gain d6 in each Virtue, and from then on can gain
 * Glory and perform Feats. Then they choose which Knight they became, keeping
 * their Virtues and everything they carry.
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
	await squire.update({
		"system.isSquire": false,
		"system.serves": "",
		"system.glory": 0,
		"system.virtues": virtues,
		[`flags.${SYSTEM_ID}.${CHOOSING_FLAG}`]: true,
		...knightedLooks(squire, Actor.implementation.DEFAULT_ICON)
	});
	if (master?.isOwner && master.system.squire === squire.uuid) await master.update({ "system.squire": "" });

	await postCard(squire, "creation", {
		title: t("squire.knightedTitle"),
		tagline: t("squire.knightedTagline", { name: squire.name }),
		lines: VIRTUES.map((key) => ({
			label: t(`virtues.${key}.abbr`),
			value: t("squire.knightedValue", { gain: gains[key], from: before[key], to: virtues[key].max })
		}))
	}, { rolls });
	chooseKnightedSquire(squire);
	return virtues;
}
