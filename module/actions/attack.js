import { inputDialog } from "../apps/ui.js";
import { plural, postCard, t } from "../chat/cards.js";
import { combatPlace, marksOn } from "../chat/gambit-marks.js";
import { GAMBITS } from "../config.js";
import {
	ALTERNATE_QUALITIES,
	attackDamage,
	buildAttackPool,
	canFundGambit,
	canFundStrongGambit,
	checkWielding,
	defaultWielded,
	gambitAllowsSave,
	gambitIgnored,
	gambitSaveVirtue,
	hasDeniableDie,
	isDieSpent,
	knownWeakness,
	parseDice,
	sortDice,
	specialistDie,
	summarizeAttack,
	swarmImpairs,
	trampleJoins,
	weaknessFaces,
	wieldsInHands
} from "../rules/attack.js";
import { dieMask } from "../rules/die-shapes.js";
import { countAfter, isAtHand, isCounted } from "../rules/restock.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { chatIsPublic, playBlowFx } from "./attack-fx.js";
import { alternateText } from "./items.js";
import { recallAttack, rememberAttack, rememberedTicks, wieldedWith } from "./attack-memory.js";
import { openDuelFor, saveDuelChange } from "./duel.js";
import { canDenyAttack, featContext, resolveFeat } from "./feats.js";
import { leaderCandidates } from "./leading.js";
import { structureHarm } from "../rules/structures.js";

/** Weapon qualities shown beside each choice in the Attack dialog. */
const SHOWN_QUALITIES = Object.freeze(["hefty", "long", "slow", "heftyMounted", "ranged", "blast", "trample"]);

/**
 * A specialist weapon's extra die and when it applies, as shown beside the weapon.
 * @param {object} weapon An item's system data.
 * @returns {string|null} Such as "+d10 against the undead", or null for a weapon that isn't one.
 */
export function specialistLabel(weapon) {
	const die = specialistDie(weapon);
	if (!die) return null;
	const situation = weapon.specialist.situation.trim();
	return situation ? t("item.specialistTag", { die, situation }) : t("item.specialistTagBare", { die });
}

/**
 * @typedef {object} AttackSource One way to add dice to an Attack: a weapon or
 *   shield, or a weapon's other way to fight, such as a bolt-guisarme shot.
 * @property {string} id      The item's id, or for its other way, the id with "-alt" after it.
 * @property {string} name
 * @property {object} system  What it rolls and how it's held, as an item's system data has it.
 * @property {Item} item      The item it comes from.
 */

/** What an Attack reads off a weapon's or shield's system data. */
const WIELDED_KEYS = Object.freeze(["damage", "hefty", "long", "slow", "ranged", "blast", "ignoresArmour", "heftyMounted", "trample", "specialist", "usedUp"]);

/**
 * Worn or wielded items that add Attack dice: weapons, and armour with an
 * attack die such as a shield. A weapon fought two ways is offered once for
 * each, and a broken one, or one all used up, not at all.
 * @param {Actor} actor
 * @returns {AttackSource[]}
 */
function attackSources(actor) {
	return armedWith(actor).filter(({ item }) => isAtHand(item.system)).flatMap((source) => {
		const { item } = source;
		const alternate = item.system.alternate;
		if (!alternate?.damage?.trim()) return [source];
		const how = alternate.label?.trim() || alternateText(item.system);
		return [source, {
			id: `${item.id}-alt`,
			name: t("attack.alternateName", { name: item.name, how }),
			item,
			system: {
				...source.system,
				damage: alternate.damage,
				...Object.fromEntries(ALTERNATE_QUALITIES.map((key) => [key, alternate[key]])),
				heftyMounted: false
			}
		}];
	});
}

/**
 * Everything worn or wielded that has Attack dice, usable or not.
 * @param {Actor} actor
 * @returns {AttackSource[]}
 */
function armedWith(actor) {
	return actor.items
		.filter((item) => item.system.equipped && parseDice(item.system.damage).length)
		.map((item) => ({
			id: item.id,
			name: item.name,
			item,
			// Both ways of a weapon fought two ways name it, so only one of them is ticked, and
			// so do attacks printed with "or" between them.
			system: { ...Object.fromEntries(WIELDED_KEYS.map((key) => [key, item.system[key]])), of: item.system.either || item.id }
		}));
}

/**
 * Names of what is worn or wielded with Attack dice but can't be used, being
 * broken or all used up, for a line under the weapons in the Attack dialog.
 * @param {Actor} actor
 * @returns {string|null}
 */
function unavailableNames(actor) {
	const names = armedWith(actor).filter(({ item }) => !isAtHand(item.system)).map(({ name }) => name);
	return names.length ? t("attack.unavailable", { names: names.join(", ") }) : null;
}

/**
 * Take one off the count of each thing whose every Attack uses one up, such
 * as a titan bead thrown, and say how many are left.
 * @param {AttackSource[]} chosen
 */
async function useUpThrown(chosen) {
	const items = [...new Set(chosen.map(({ item }) => item))].filter((item) => item.system.usedUp && isCounted(item.system) && item.isOwner);
	await Promise.all(items.map((item) => {
		const left = countAfter(item.system.quantity, -1);
		ui.notifications.info(t("attack.usedOne", { name: item.name, left }));
		return item.update({ "system.quantity.value": left });
	}));
}

/**
 * A Knight's steed and its trample, which joins a mounted charge at enemies on foot (p10).
 * @param {Actor} actor
 * @returns {{steed: Actor, trample: Item[]}|null} Null without a steed that tramples.
 */
function mountOf(actor) {
	const steed = actor.system.steed ? fromUuidSync(actor.system.steed) : null;
	const trample = steed?.items?.filter((item) => item.type === "weapon" && item.system.trample && parseDice(item.system.damage).length) ?? [];
	return trample.length ? { steed, trample } : null;
}

/**
 * The Tokens this user has targeted, as an Attack card records them.
 * @returns {{uuid: string, name: string}[]}
 */
function currentTargets() {
	return [...game.user.targets].map((token) => ({ uuid: token.document.uuid, name: token.document.name }));
}

/**
 * How a targeted Token stands: whether it's mounted or a structure, for a
 * steed's trample, which only joins a charge at enemies on foot (p10), and
 * whether it's a swarm, whose foes' individual attacks are Impaired unless
 * they are Blast attacks (p61). A Token whose actor can't be found is taken to
 * be one person on foot.
 * @param {{uuid: string}} target
 * @returns {{mounted: boolean, structure: boolean, swarm: boolean}}
 */
function standingOf({ uuid }) {
	const actor = fromUuidSync(uuid)?.actor;
	if (!actor) return { mounted: false, structure: false, swarm: false };
	return {
		mounted: Boolean(actor.system.conditions?.mounted),
		structure: actor.type === "structure" || Boolean(actor.system.structure),
		swarm: actor.type === "npc" && actor.system.scale === "swarm"
	};
}

/**
 * Why a charge's trample can't join an Attack at these targets, for the Attack
 * dialog to say beside its charge box.
 * @param {{uuid: string, name: string}[]} targets
 * @returns {string|null} Null when it joins, or nobody is targeted yet.
 */
function trampleBarred(targets) {
	if (trampleJoins(targets.map(standingOf))) return null;
	return t("attack.chargeBarred", { names: targets.map(({ name }) => name).join(", ") });
}

/**
 * The weaknesses of these targets that the Knights have learned, each of which
 * gives every Attack that uses it a bonus die (p188). The Attack dialog offers
 * them ticked, to be unticked for a blow that doesn't use it.
 * @param {{uuid: string, name: string}[]} targets
 * @returns {{uuid: string, name: string, text: string, die: string}[]}
 */
function weaknessesOf(targets) {
	return targets.flatMap((target) => {
		const weakness = knownWeakness(fromUuidSync(target.uuid)?.actor?.system);
		return weakness ? [{ ...target, ...weakness }] : [];
	});
}

/**
 * The die a card at these targets gains from the weaknesses ticked in the
 * Attack dialog, one die however many of them it hits.
 * @param {{uuid: string}[]} group The card's targets.
 * @param {ReturnType<typeof weaknessesOf>} used The weaknesses ticked.
 * @returns {{faces: number, label: string}[]}
 */
function weaknessDice(group, used) {
	const hit = used.filter((weakness) => group.some((target) => target.uuid === weakness.uuid));
	const faces = weaknessFaces(hit);
	if (!faces) return [];
	const { text } = hit.find((weakness) => parseDice(weakness.die)[0] === faces);
	return [{ faces, label: text ? t("attack.weaknessDie", { text }) : t("attack.weaknessDieBare") }];
}

/**
 * Whether the actor's Token has moved this turn. Foundry records movement only
 * while a combat is running, and clears it as each turn starts.
 * @param {Actor} actor
 * @returns {boolean}
 */
function movedThisTurn(actor) {
	return actor.getActiveTokens(false, true).some((token) => token.combatant?.parent?.started && token.movementHistory.length > 0);
}

/**
 * Whether an Attack is held to what two hands can wield (p12): always for a
 * Knight, never for a Warband, whose Attack is its members', and for anybody
 * else as their sheet or their gear says.
 * @param {Actor} actor
 * @returns {boolean}
 */
function countsHands(actor) {
	if (actor.type === "knight") return true;
	if (actor.type !== "npc" || actor.system.scale === "warband") return false;
	return wieldsInHands(actor.system.wields, [...actor.items]);
}

/**
 * Check the items ticked in the Attack dialog against the situation ticked there.
 * @param {Actor} actor
 * @param {Item[]} sources Everything the dialog offered.
 * @param {object} choice  The dialog's expanded form data.
 * @returns {{chosen: Item[], check: ReturnType<typeof checkWielding>}}
 */
function readWielding(actor, sources, choice) {
	const chosen = sources.filter((item) => choice.source?.[item.id]);
	const check = checkWielding(chosen.map((item) => item.system), {
		moved: Boolean(choice.moved),
		engaged: Boolean(choice.engaged),
		confined: Boolean(choice.confined),
		exhausted: actor.system.conditions.exhausted,
		// A mounted charge is made on horseback.
		mounted: Boolean(choice.mounted || choice.charge),
		spearwall: Boolean(choice.spearwall),
		smite: Boolean(choice.smite),
		hands: countsHands(actor)
	});
	return { chosen, check };
}

/**
 * What stops or changes the Attack as chosen, one line each.
 * @param {Actor} actor
 * @param {Item[]} chosen
 * @param {ReturnType<typeof checkWielding>} check
 * @returns {string[]}
 */
function wieldingProblems(actor, chosen, check) {
	const lines = check.refusal ? [t(`attack.refusals.${check.refusal}`, { name: actor.name })] : [];
	for (const { index, reason } of check.setAside) lines.push(t(`attack.setAside.${reason}`, { name: chosen[index].name }));
	if (check.impaired) lines.push(t("attack.confinedImpaired"));
	return lines;
}

/**
 * Keep the Attack dialog's list of problems up to date as boxes are ticked, and
 * hold back the roll while the Attack can't be made.
 * @param {foundry.applications.api.DialogV2} dialog
 * @param {Actor} actor
 * @param {Item[]} sources
 */
function watchWielding(dialog, actor, sources) {
	const form = dialog.element.querySelector("form");
	const list = form?.querySelector("[data-wielding-problems]");
	if (!list) return;
	const roll = dialog.element.querySelector("[data-action='ok']");

	const update = () => {
		const choice = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(form).object);
		const { chosen, check } = readWielding(actor, sources, choice);
		list.replaceChildren(...wieldingProblems(actor, chosen, check).map((text) => {
			const line = document.createElement("li");
			line.textContent = text;
			return line;
		}));
		list.hidden = list.childElementCount === 0;
		if (roll) roll.disabled = Boolean(check.refusal);
	};
	form.addEventListener("change", update);
	update();
}

/**
 * Which weapons the dialog opens ticked: the ones this actor last rolled with,
 * and the hardest-hitting of anything they've taken up since. A remembered set
 * that can't be held together any more — a shield beside a weapon since made
 * Hefty — gives way to the hardest-hitting set instead, so the dialog doesn't
 * open on an Attack that can't be rolled.
 * @param {Actor} actor
 * @param {Item[]} sources
 * @param {import("./attack-memory.js").AttackChoice|null} remembered
 * @param {boolean} mounted
 * @returns {number[]} Indexes into sources.
 */
function openingWielded(actor, sources, remembered, mounted) {
	const items = sources.map((item) => item.system);
	const options = { mounted, hands: countsHands(actor) };
	const hardest = defaultWielded(items, options);
	if (!remembered) return hardest;
	const kept = wieldedWith(remembered, sources.map((item) => item.id), hardest);
	return checkWielding(kept.map((index) => items[index]), options).refusal ? hardest : kept;
}

/**
 * Ask which weapons to use, roll the Attack dice together, and post a card
 * where the table declares Deny and Gambits and applies the Damage. A Blast
 * against several targeted Tokens rolls separately for each, one card apiece.
 * @param {Actor} actor
 * @returns {Promise<ChatMessage[]|null>}
 */
export async function attack(actor) {
	const sources = attackSources(actor);
	const mount = mountOf(actor);
	const { conditions } = actor.system;
	const warband = actor.system.scale === "warband";

	const leaders = warband ? leaderCandidates(actor) : [];
	const duel = openDuelFor(actor);
	// Gambits a foe landed on them (p10): an Impair holds this turn, a Trap holds a shield back.
	const marks = marksOn(actor);
	// An Impaired attack rolls a single d4 only (p9), however it came to be Impaired,
	// so a landed Impair leaves no room for Smite's +d12 any more than SPI 0 does.
	const startsImpaired = conditions.impaired || marks.some((mark) => mark.key === "impair");

	// What this actor last rolled an Attack with, which the dialog opens on again.
	const remembered = recallAttack(actor);
	// A joust is fought mounted, and so is anybody marked Mounted. Otherwise nobody is taken to be
	// riding, steed or no, until they say so.
	const mounted = duel?.duel.kind === "joust" || Boolean(conditions.mounted) || Boolean(remembered?.mounted);
	const wielded = openingWielded(actor, sources, remembered, mounted);
	// Who the Attack is aimed at as the dialog opens: the other duelist in a duel.
	const aimedAt = duel?.opponent.token ? [{ uuid: duel.opponent.token, name: duel.opponent.name }] : currentTargets();
	// Nobody on foot among the targets leaves the steed nobody to trample.
	const chargeBarred = mount ? trampleBarred(aimedAt) : null;
	const weaknesses = weaknessesOf(aimedAt);

	const data = await inputDialog({
		title: t("attack.title"),
		icon: "fa-solid fa-swords",
		template: "attack",
		context: {
			sources: sources.map((item, index) => ({
				id: item.id,
				name: item.name,
				tags: [item.system.damage, ...SHOWN_QUALITIES.filter((key) => item.system[key]).map((key) => t(`item.${key}`)), isCounted(item.item.system) ? t("item.quantityTagBare", { value: item.item.system.quantity.value }) : null].filter(Boolean).join(" · "),
				checked: wielded.includes(index),
				// Ticked by the player when the situation it's made for comes up.
				specialist: specialistLabel(item.system),
				specialistChecked: Boolean(remembered?.specialist?.[item.id])
			})),
			...rememberedTicks(remembered),
			// Worn or wielded, but broken or all used up, so not offered.
			unavailable: unavailableNames(actor),
			moved: movedThisTurn(actor),
			// Read off the world rather than remembered, so it follows the steed.
			mounted,
			duel: duel && t("duel.attackIn", { kind: t(`duel.kinds.${duel.duel.kind}.label`), name: duel.opponent.name }),
			charge: mount && t("attack.charge", { steed: mount.steed.name, dice: mount.trample.map((item) => item.system.damage).join(" + ") }),
			chargeBarred,
			exhausted: conditions.exhausted,
			impaired: startsImpaired,
			// A swarm aimed at is named, so a Blast, which isn't Impaired by it, can be chosen before rolling.
			marks: [...marks.map((mark) => mark.hint), ...aimedAt.filter((target) => standingOf(target).swarm).map(({ name }) => t("attack.swarmHint", { name }))],
			weaknesses: weaknesses.map(({ name, text, die }, index) => ({
				index,
				label: text ? t("attack.weakness", { name, text, die }) : t("attack.weaknessBare", { name, die })
			})),
			smiteDisabled: conditions.fatigued || startsImpaired || !sources.length || !actor.system.knowsFeat("smite"),
			warband,
			leaders: leaders.map((leader) => ({ uuid: leader.uuid, name: leader.name, selected: leader.uuid === actor.system.leader }))
		},
		ok: { label: t("attack.roll"), icon: "fa-solid fa-dice" },
		render: (_event, dialog) => watchWielding(dialog, actor, sources)
	});
	if (!data) return null;

	const choice = foundry.utils.expandObject(data);
	const { chosen: picked, check } = readWielding(actor, sources, choice);
	if (check.refusal) {
		ui.notifications.warn(t(`attack.refusals.${check.refusal}`, { name: actor.name }));
		return null;
	}
	// Their next Attack with this actor opens on what they chose here.
	await rememberAttack(actor, choice);
	// Riding or not, as ticked here, is marked on them, so a rider's plate counts while they ride.
	const riding = Boolean(choice.mounted || choice.charge);
	if (actor.isOwner && typeof actor.system.mounted === "boolean" && actor.system.mounted !== riding) await actor.update({ "system.mounted": riding });
	const chosen = check.usable.map((index) => picked[index]);
	// Leading from the front adds the leader's Attack dice to the Warband's roll (p11).
	const leader = leaders.find((candidate) => candidate.uuid === choice.leader) ?? null;
	// What rolls, each group's dice labelled with the item or whoever brings them.
	const weaponGroups = [
		{ items: chosen, label: null },
		{ items: mount && choice.charge ? mount.trample : [], label: mount?.steed.name, trample: true },
		{ items: leader ? armedWith(leader).filter(({ item }) => isAtHand(item.system)) : [], label: leader?.name }
	];
	const weaponItems = weaponGroups.flatMap(({ items }) => items);
	const weaponDice = weaponGroups.flatMap(({ items, label, trample = false }) =>
		items.flatMap((item) => parseDice(item.system.damage).map((faces) => ({ faces, label: label ?? item.name, trample }))));
	// They share the Warband's Damage until their next turn, so the Warband remembers who leads it,
	// and forgets a leader who no longer does.
	const leaderUuid = leader?.uuid ?? "";
	if (warband && actor.isOwner && actor.system.leader !== leaderUuid) await actor.update({ "system.leader": leaderUuid });
	// Impaired is read off the actor and the marks on them, never declared in the dialog.
	const impaired = startsImpaired || check.impaired || !weaponDice.length;
	// A Warband's Attack on individuals gets +d12 and Blast (Warfare, p11).
	const againstIndividuals = warband && Boolean(choice.againstIndividuals);

	// Smite is declared before rolling, and Impaired attacks cannot benefit from Feats.
	let smite = null;
	if (choice.smite && !impaired) {
		const save = await resolveFeat(actor, "smite");
		if (save) smite = { mode: choice.smite, feat: featContext("smite", save), roll: save.roll };
	}

	const bonusDice = parseDice(choice.bonus).map((faces) => ({ faces, label: t("attack.bonus") }));
	// A specialist weapon's die joins only when it's wielded in the situation it's made for (p12).
	for (const item of chosen.filter((candidate) => choice.specialist?.[candidate.id])) {
		const die = specialistDie(item.system);
		if (die) bonusDice.push(...parseDice(die).map((faces) => ({ faces, label: t("attack.specialistDie", { name: item.name }) })));
	}
	// Smite for a lasting mark adds no dice: the Wound it deals leaves the mark (p187).
	if (smite?.mode === "d12") bonusDice.push({ faces: 12, label: t("feats.smite.name") });
	if (againstIndividuals) bonusDice.push({ faces: 12, label: t("npc.scales.warband.label") });
	// A known weakness joins each card at whoever has it, and only while it's ticked.
	const exploited = weaknesses.filter((_weakness, index) => choice.weakness?.[index]);

	const pool = buildAttackPool({
		sources: weaponItems.map((item) => item.system.damage),
		bonus: bonusDice.map((die) => die.faces),
		impaired
	});
	const dice = pool.impaired
		? [{ faces: 4, label: t(weaponDice.length ? "conditions.impaired.label" : "attack.unarmed") }]
		: [...weaponDice, ...bonusDice];

	const blast = smite?.mode === "blast" || againstIndividuals || chosen.some((item) => item.system.blast);
	// An Attack in a duel is against the other duelist, whatever else is targeted.
	const inDuel = duel && choice.duel ? duel : null;
	const targets = inDuel?.opponent.token ? [{ uuid: inDuel.opponent.token, name: inDuel.opponent.name }] : currentTargets();
	// Blast attacks target everybody in their area, rolling each separately (p8).
	const groups = blast && targets.length > 1 ? targets.map((target) => [target]) : [targets];

	const shared = {
		// Cards from one Blast share an id, so a Feat used on one counts for all of them.
		attackId: foundry.utils.randomID(),
		attacker: actor.uuid,
		attackerName: actor.name,
		// Where in a running Combat this was rolled, so a Gambit's mark knows when it lapses.
		place: combatPlace(),
		melee: !chosen.some((item) => item.system.ranged),
		impaired: pool.impaired,
		// A Long weapon in a confined space is why this Attack is Impaired.
		confined: check.impaired,
		setAside: check.setAside.map(({ index, reason }) => ({ name: picked[index].name, reason })),
		blast,
		ignoresArmour: chosen.some((item) => item.system.ignoresArmour),
		// Its Damage never Slays or leaves anybody dying (p173).
		nonLethal: chosen.length > 0 && chosen.every((item) => item.system.nonLethal),
		// What a Cast member's weapon does besides its dice, as its stat block says: "sets area alight".
		notes: actor.type === "knight" ? [] : chosen.map((item) => ({ name: item.name, note: plainNote(item.system.description) })).filter(({ note }) => note),
		// A Warband's Attack is large-scale, so it can harm another Warband.
		largeScale: warband,
		// Fire, a siege weapon or a suitably large creature harms a structure (p11).
		structureHarm: structureHarm({
			fromSiege: actor.type === "structure",
			large: actor.type === "npc" && Boolean(actor.system.structure),
			texts: chosen.map((item) => `${item.name} ${item.system.description ?? ""}`)
		}),
		leader: leader ? { uuid: leader.uuid, name: leader.name } : null,
		smite: smite?.feat ?? null,
		// A Smite made to leave a lasting mark rather than more Damage, which a Wound brings (p187).
		smiteMark: smite?.mode === "mark",
		duel: inDuel?.message.id ?? null,
		gambits: [],
		feats: [],
		appliedTo: []
	};

	await useUpThrown(chosen);

	const messages = [];
	for (const [index, group] of groups.entries()) {
		// A steed tramples only enemies on foot (p10), so a card at riders alone leaves its dice out,
		// and a charge that was all trample fights them unarmed.
		const standing = group.map(standingOf);
		const trampleOut = weaponDice.some((die) => die.trample) && !trampleJoins(standing);
		const unarmed = trampleOut && !pool.impaired && weaponDice.every((die) => die.trample);
		// An individual's Attack at a swarm is Impaired unless it's a Blast (p61).
		const swarmed = !pool.impaired && !unarmed && swarmImpairs(shared, standing);
		// An Impaired Attack rolls its d4 alone, known weakness or not.
		const cardDice = unarmed || swarmed
			? [{ faces: 4, label: t(unarmed ? "attack.unarmed" : "npc.scales.swarm.label") }]
			: [...dice.filter((die) => !(trampleOut && die.trample)), ...(pool.impaired ? [] : weaknessDice(group, exploited))];
		const roll = await new Roll(cardDice.map((die) => `1d${die.faces}`).join(" + ")).evaluate();
		const rolled = cardDice.map((die, i) => ({ faces: die.faces, label: die.label, result: roll.dice[i].total, deniedBy: null }));
		const state = { ...shared, targets: group, dice: sortDice(rolled) };
		if (trampleOut) state.setAside = [...shared.setAside, { name: mount.steed.name, reason: "mountedFoe" }];
		if (unarmed || swarmed) state.impaired = true;
		if (swarmed) state.swarm = true;
		// The Smite Save was rolled once, so only the first card carries it.
		const rolls = smite && index === 0 ? [smite.roll, roll] : [roll];
		messages.push(await postCard(actor, "attack", attackCardContext(state), {
			rolls,
			flags: { [SYSTEM_ID]: { attack: state } }
		}));
	}
	if (inDuel && messages.length) await saveDuelChange(inDuel.message, { type: "attack", actor: actor.uuid, message: messages[0].id });
	// The blows on the map, as the card lands (module/actions/attack-fx.js): one for
	// each thing that added dice, the biggest die first. Once for the whole Attack,
	// however many cards a Blast split it into, and never awaited: the dice are
	// rolled and the cards are posted, so it can't cost the table anything.
	playBlowFx({
		attacker: actor,
		weapons: weaponItems.map((item) => ({ name: item.name, damage: item.system.damage, ranged: Boolean(item.system.ranged) })),
		mounted: Boolean(choice.mounted || choice.charge),
		warband,
		// An Impaired Attack rolls one d4 whatever they hold (p9), so it strikes once.
		impaired: pool.impaired,
		targets,
		// A card the table wasn't shown isn't drawn on their map either.
		whispered: !chatIsPublic()
	});
	return messages;
}

/** The longest weapon note an Attack card repeats; anything longer is on the weapon itself. */
const NOTE_LENGTH = 160;

/**
 * A weapon's note as one short line of plain text for a card.
 * @param {string} html
 * @returns {string} Empty for a note too long to repeat, or none.
 */
function plainNote(html) {
	const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
	return text.length <= NOTE_LENGTH ? text : "";
}

/**
 * @param {import("../rules/attack.js").FocusSave|null|undefined} save
 * @returns {{passed: boolean, result: string}|null}
 */
function focusSaveContext(save) {
	if (!save) return null;
	const { by, total, target, passed } = save;
	return { passed, result: t(passed ? "attack.focusPassed" : "attack.focusFailed", { name: by, total, target }) };
}

/**
 * Where a declared Gambit stands with the foe it was aimed at: no Save to be
 * had, one still to roll, or one already rolled (p10).
 * @param {import("../rules/attack.js").Gambit} gambit
 * @param {number} index
 * @param {boolean} settled Whether the Damage has been applied.
 * @returns {object|null} Null once a settled Attack leaves a Save unrolled.
 */
/**
 * @param {import("../rules/attack.js").Gambit} gambit
 * @returns {string} The Virtue the foe Saves in against it, as its short name.
 */
const virtueOf = (gambit) => t(`virtues.${gambitSaveVirtue(gambit)}.abbr`);

function gambitSaveContext(gambit, index, settled) {
	// A Strong Gambit that denies the Save already says so in its tag.
	if (!gambitAllowsSave(gambit)) return gambit.strong === "noSave" ? null : { none: t("attack.gambitNoSave") };
	if (gambit.save) {
		const { by, total, target, passed } = gambit.save;
		return { passed, result: t(passed ? "attack.gambitSaved" : "attack.gambitFailed", { name: by, total, target, virtue: virtueOf(gambit) }) };
	}
	return settled ? null : { index, button: t("attack.gambitSave", { virtue: virtueOf(gambit) }) };
}

/**
 * The book's line for each Gambit, folded into the card so somebody who
 * doesn't know the rule can see what a die of 4+ would buy them (p10).
 * @returns {{label: string, lines: string[], strong: string, hint: string}}
 */
function gambitHelp() {
	return {
		label: t("attack.gambitHelp"),
		lines: GAMBITS.map((key) => t(`gambits.${key}`)),
		strong: t("gambits.strong"),
		hint: t("gambits.hint")
	};
}

/**
 * The line reminding whoever is about to be hurt that they can still Deny one
 * of these dice (p10). It names the targets who could, since they are the ones
 * with something to lose; an ally within arm's reach may Deny for them, so the
 * card falls silent rather than naming somebody who can't. An Attack rolled at
 * nobody in particular names nobody either way.
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {boolean} settled
 * @returns {string|null}
 */
function denyPrompt(attack, settled) {
	if (settled || !hasDeniableDie(attack)) return null;
	if (!attack.targets.length) return t("attack.denyPromptAny");
	const names = attack.targets
		.map((target) => fromUuidSync(target.uuid)?.actor)
		.filter((actor) => canDenyAttack(attack, actor))
		.map((actor) => actor.name);
	return names.length ? t("attack.denyPrompt", { names: names.join(", ") }) : null;
}

/**
 * Template data for an Attack card at any point: fresh from the roll, part way
 * through Deny and Gambits, or settled once the Damage is applied.
 * @param {import("../rules/attack.js").AttackState} attack
 */
export function attackCardContext(attack) {
	const { highest, bolster, damage, die: counted } = attackDamage(attack);
	const settled = attack.appliedTo.length > 0;
	const remaining = attack.dice.filter((_die, index) => !isDieSpent(attack, index)).map((die) => die.result);
	const summary = summarizeAttack(remaining, { melee: attack.melee });
	const gambitName = (key) => t(`gambits.names.${key}`);

	return {
		smite: attack.smite,
		smiteMark: attack.smiteMark ? t("attack.smiteMarkLine") : null,
		targets: attack.targets.length ? t("attack.against", { names: attack.targets.map((target) => target.name).join(", ") }) : null,
		dice: attack.dice.map((die, index) => {
			const gambit = attack.gambits.find((entry) => entry.die === index);
			let spentOn = null;
			if (gambit) spentOn = gambitName(gambit.key);
			else if (die.deniedBy) spentOn = t("attack.deniedBy", { name: die.deniedBy });
			return {
				index,
				faces: die.faces,
				// The outline the card draws behind the result, so a d12 is told from a d6 without reading.
				shape: dieMask(die.faces),
				result: die.result,
				label: spentOn ?? die.label,
				spent: Boolean(spentOn),
				isHighest: index === counted,
				isGambit: canFundGambit(attack, index),
				isStrong: canFundStrongGambit(attack, index),
				// A die of 4+ can be spent, and a die spent on a Gambit can be taken back.
				locked: settled || !(gambit || canFundGambit(attack, index))
			};
		}),
		gambits: attack.gambits.map((gambit, index) => {
			const ignored = gambitIgnored(gambit);
			return {
				// The book's own line, which names the Gambit and says how long it lasts.
				effect: t(`gambits.${gambit.key}`),
				source: gambit.die === null
					? t("feats.focus.name")
					: t("attack.dieSource", { faces: attack.dice[gambit.die].faces, result: attack.dice[gambit.die].result }),
				strong: gambit.strong ? t(`attack.strong.${gambit.strong}`) : null,
				// The CLA Save Focus cost the attacker (p10). Cards from before it was kept have none.
				focus: focusSaveContext(gambit.focus),
				// A Dismount the target Saved against adds nothing, so its d6 goes unmentioned.
				bonus: gambit.bonus && !ignored ? t("attack.dismounted", { result: gambit.bonus }) : null,
				// A Greater effect can break a wooden shield or weapon (p10), which the card marks on the foe's sheet.
				breaks: gambit.strong === "greater" && !ignored ? { label: t("attack.break"), hint: t("attack.breakHint") } : null,
				ignored,
				save: gambitSaveContext(gambit, index, settled)
			};
		}),
		damage,
		breakdown: bolster ? t("attack.breakdown", { highest, bolster }) : null,
		// Said only while there is a choice to make, so the line keeps its weight.
		gambitPrompt: settled || !summary.gambitDice ? null : plural("attack.gambitPrompt", summary.gambitDice),
		strongPrompt: settled || !summary.strongDice ? null : plural("attack.strongPrompt", summary.strongDice),
		// Said while a die is still there to discard, so the reminder lands before the Damage does.
		denyPrompt: denyPrompt(attack, settled),
		takeBack: !settled && attack.gambits.some((gambit) => gambit.die !== null) ? t("attack.takeBack") : null,
		// A Gambit is still to be had while a die can pay for one, or Focus can.
		gambitHelp: settled || !(summary.gambitDice || !attack.impaired) ? null : gambitHelp(),
		// Cards rolled before weapons could be set aside have no list.
		setAside: (attack.setAside ?? []).map(({ name, reason }) => t(`attack.setAside.${reason}`, { name })),
		impaired: attack.impaired,
		confined: Boolean(attack.confined),
		// Impaired for striking at a swarm without a Blast.
		swarm: Boolean(attack.swarm),
		blast: attack.blast,
		ignoresArmour: attack.ignoresArmour,
		// Cards rolled before weapon notes were kept have none.
		weaponNotes: (attack.notes ?? []).map(({ name, note }) => `${name}: ${note}`),
		// Cards rolled before leading from the front have no leader.
		leader: attack.leader ? t("attack.ledBy", { name: attack.leader.name }) : null,
		// A duel's Attacks are applied together from the duel card.
		duel: Boolean(attack.duel),
		settled,
		appliedTo: settled ? t("attack.applied", { names: attack.appliedTo.join(", ") }) : null
	};
}

/**
 * @param {import("../rules/attack.js").AttackState} attack
 * @returns {Promise<string>} The card's HTML.
 */
export function renderAttackCard(attack) {
	return foundry.applications.handlebars.renderTemplate(templatePath("chat/attack.hbs"), attackCardContext(attack));
}
