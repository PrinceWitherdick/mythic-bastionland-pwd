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
	squireSystem,
	stillServes
} from "../rules/squires.js";
import { escapeHTML } from "../rules/text.js";
import { VIRTUES } from "../rules/virtues.js";
import { SYSTEM_ID } from "../system-id.js";
import { COMPANY_KNIGHT_FLAG, companyKnights, inCompany, worldKnights } from "./knights.js";
import { SOLO_CHANGED_HOOK, isSolo } from "./solo.js";
import { timelineKnighted, timelineSquireTaken } from "./timeline-events.js";
import { isCompanyKnight, isKnight, isNpcKnight } from "../rules/knight-types.js";

/**
 * @returns {number} Knights in the Company: one for each player who owns a Knight, so a fallen Knight and their heir
 *   count once. Played alone, each living Knight riding with the Company counts, as the Referee owns them all.
 */
export function companyKnightCount() {
	if (isSolo()) {
		const riding = worldKnights((actor) => inCompany(actor) && !actor.system.slain);
		return companySize(riding.map((actor) => ({ isSquire: Boolean(actor.system.isSquire), players: [actor.id] })));
	}
	const players = game.users.filter((user) => !user.isGM);
	// An NPC Knight a player holds, such as a rival they run for the Referee, isn't one of the Company.
	return companySize(companyKnights().map((actor) => ({
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
		for (const actor of worldKnights()) if (actor.sheet?.rendered) actor.sheet.render();
	}
	if (!outgrewSquires(before, lastCompanyCount) || !game.users.activeGM?.isSelf) return null;
	const squires = worldKnights((actor) => actor.system.isSquire);
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
const changesCompany = (actor, changes) => isKnight(actor) && (!changes || "ownership" in changes || "type" in changes || changes.system?.isSquire !== undefined
	// Played alone, a Knight joins or leaves the Company by its mark, and a Slain one no longer rides.
	|| changes.flags?.[SYSTEM_ID]?.[COMPANY_KNIGHT_FLAG] !== undefined || changes.system?.slain !== undefined);

/** Count the Company once the world is ready, then recount it as Knights come and go. */
export function watchCompanySize() {
	lastCompanyCount = companyKnightCount();
	Hooks.on("createActor", (actor) => changesCompany(actor) && recountCompany());
	Hooks.on("updateActor", (actor, changes) => changesCompany(actor, changes) && recountCompany());
	Hooks.on("deleteActor", (actor) => changesCompany(actor) && recountCompany());
	Hooks.on(SOLO_CHANGED_HOOK, () => recountCompany());
}

/**
 * The Squire a Knight's sheet names, while they still serve that Knight: not
 * Knighted since, nor taken by another Knight, nor, unless the dead are
 * wanted too, Slain.
 * @param {Actor} knight
 * @param {object} [options] As stillServes takes them.
 * @returns {Actor|null}
 */
export function servingSquire(knight, options) {
	const uuid = knight?.system?.isSquire ? "" : knight?.system?.squire;
	const squire = uuid ? fromUuidSync(uuid) : null;
	return squire?.documentName === "Actor" && stillServes(squire.system, knight.uuid, options) ? squire : null;
}

/**
 * Only small Companies may take Squires (p7), but the Referee may bend that:
 * a player is told so, and the Referee asked.
 * @returns {Promise<boolean>} Whether a Knight may be given a Squire.
 */
async function squireAllowed() {
	const count = companyKnightCount();
	if (mayTakeSquires(count)) return true;
	if (!game.user.isGM) {
		ui.notifications.warn(t("squire.largeCompanyPlayer", { count }));
		return false;
	}
	return confirmDialog({
		title: t("squire.largeTitle"),
		icon: "fa-solid fa-people-group",
		message: t("squire.largeCompany", { count })
	});
}

/**
 * The ownership a Knight's companion is given when the Referee links them:
 * what they had, raised to whatever the Knight's players have, so a player
 * can see and play the Squire, steed or follower their Knight was given.
 * @param {Actor} companion
 * @param {Actor} knight
 * @returns {object} An update, empty for a player, who can't hand ownership on.
 */
export function sharedOwnership(companion, knight) {
	if (!game.user.isGM) return {};
	const ownership = { ...companion.ownership };
	let changed = false;
	for (const [user, level] of Object.entries(knight.ownership ?? {})) {
		if (user === "default" || (ownership[user] ?? 0) >= level) continue;
		ownership[user] = level;
		changed = true;
	}
	return changed ? { ownership } : {};
}

/**
 * Make a Squire already in the world this Knight's (p7), as dropping them on
 * the Knight's sheet does. The Knight they served lets them go, and a Squire
 * this Knight had before is let go, so no Squire serves two Knights and no
 * Knight keeps two. A Knight who had none is held to the Company's size, as
 * taking a new Squire is. Moving a Squire from another Knight, or replacing
 * one, is asked first. A player can't move a Squire who serves a Knight they
 * don't own.
 * @param {Actor} knight
 * @param {Actor} squire
 * @returns {Promise<Actor|null>} The Squire, or null where nothing changed.
 */
export async function claimSquire(knight, squire) {
	if (!isKnight(knight) || knight.system.isSquire || !squire?.system?.isSquire || squire === knight) return null;
	// Only a small Company's Knights are given Squires (p7), never the Referee's.
	if (isNpcKnight(knight)) {
		ui.notifications.warn(t("npcKnight.noSquire", { name: knight.name }));
		return null;
	}
	if (squire.system.slain) {
		ui.notifications.warn(t("squire.slainServing", { name: squire.name }));
		return null;
	}
	if (knight.system.squire === squire.uuid && squire.system.serves === knight.uuid) return squire;

	const served = squire.system.serves && squire.system.serves !== knight.uuid ? fromUuidSync(squire.system.serves) : null;
	const master = served?.documentName === "Actor" ? served : null;
	// Only a link the old Knight still keeps needs undoing on their side.
	const masterKeeps = master?.system?.squire === squire.uuid;
	if ((master && !squire.isOwner) || (masterKeeps && !master.isOwner)) {
		ui.notifications.warn(t("squire.servesAnother", { name: squire.name, knight: master.name }));
		return null;
	}
	// A Knight who has a Squire already, this one or another, has been through the Company's size.
	const had = servingSquire(knight, { living: false });
	const before = had && had !== squire ? had : null;

	const asked = [];
	if (master) asked.push(t("squire.moveFrom", { name: escapeHTML(squire.name), from: escapeHTML(master.name), knight: escapeHTML(knight.name) }));
	if (before) asked.push(t("squire.replaces", { name: escapeHTML(before.name), knight: escapeHTML(knight.name) }));
	if (asked.length && !(await confirmDialog({ title: t("squire.claimTitle"), icon: "fa-solid fa-user-plus", message: asked }))) return null;
	if (!had && !(await squireAllowed())) return null;

	await knight.update({ "system.squire": squire.uuid });
	if (squire.isOwner) await squire.update({ "system.serves": knight.uuid, ...sharedOwnership(squire, knight) });
	if (masterKeeps) await master.update({ "system.squire": "" });
	if (before?.isOwner && before.system.serves === knight.uuid) await before.update({ "system.serves": "" });
	// On both threads, as taking a new Squire writes it.
	await timelineSquireTaken(knight, squire);
	return squire;
}

/**
 * Part a Knight and their Squire, from either one's sheet: both sides of the
 * link go, where this user may write the other one.
 * @param {Actor} actor The Knight or the Squire.
 * @returns {Promise<void>}
 */
export async function releaseSquire(actor) {
	const { isSquire } = actor.system;
	const uuid = isSquire ? actor.system.serves : actor.system.squire;
	const linked = uuid ? fromUuidSync(uuid) : null;
	await actor.update({ [isSquire ? "system.serves" : "system.squire"]: "" });
	if (linked?.documentName !== "Actor" || !linked.isOwner) return;
	if (isSquire && linked.system.squire === actor.uuid) await linked.update({ "system.squire": "" });
	if (!isSquire && linked.system.serves === actor.uuid) await linked.update({ "system.serves": "" });
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
	if (!isCompanyKnight(knight) || knight.system.isSquire) return null;
	const existing = servingSquire(knight);
	if (existing) {
		existing.sheet.render({ force: true });
		return existing;
	}
	if (!game.user.can("ACTOR_CREATE")) {
		ui.notifications.warn(t("squire.cantCreate"));
		return null;
	}
	if (!(await squireAllowed())) return null;

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
	await Promise.all([
		timelineSquireTaken(knight, squire),
		postCard(knight, "creation", {
			title: t("squire.title"),
			tagline: t("squire.tagline", { name: squire.name, knight: knight.name }),
			lines,
			note: t("squire.hint")
		}, { rolls })
	]);
	squire.sheet.render({ force: true });
	return squire;
}

/**
 * @param {Actor} actor
 * @returns {boolean} Whether they're a Squire just Knighted, still to choose which Knight they became.
 */
export const isChoosingKnight = (actor) => isKnight(actor) && !actor.system.isSquire && Boolean(actor.getFlag(SYSTEM_ID, CHOOSING_FLAG));

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
 * Knight a Squire (p7): each Virtue rises by d6, and from then on they can gain
 * Glory and perform Feats. Then they choose which Knight they became, keeping
 * their Virtues and everything they carry. The dead aren't Knighted: raising
 * their VIG would bring them back.
 * @param {Actor} squire
 * @param {object} [options]
 * @param {string} [options.note] HTML, already escaped: why they're asked, said before the question.
 * @returns {Promise<Record<string, {value: number, max: number}>|null>} Their new Virtues.
 */
export async function knightSquire(squire, { note } = {}) {
	if (!squire.system.isSquire) return null;
	if (squire.system.slain) {
		ui.notifications.warn(t("squire.slainKnighting", { name: squire.name }));
		return null;
	}
	const confirmed = await confirmDialog({
		title: t("squire.knightConfirmTitle"),
		icon: "fa-solid fa-khanda",
		message: [note, t("squire.knightConfirm", { name: escapeHTML(squire.name) })].filter(Boolean)
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
	await Promise.all([
		timelineKnighted(squire, master),
		postCard(squire, "creation", {
			title: t("squire.knightedTitle"),
			tagline: t("squire.knightedTagline", { name: squire.name }),
			lines: VIRTUES.map((key) => ({
				label: t(`virtues.${key}.abbr`),
				value: t("squire.knightedValue", { gain: gains[key], from: before[key], to: virtues[key].max })
			}))
		}, { rolls })
	]);
	chooseKnightedSquire(squire);
	return virtues;
}
