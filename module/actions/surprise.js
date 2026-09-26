import { inputDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { contextMenuEntry } from "../compat.js";
import { evaluateSave, saveContext } from "./saves.js";

/**
 * Characters who were not readied for combat must pass a CLA Save or miss the
 * first turn (Surprise, p8). The GM ticks who was caught unready, and one card
 * shows every Save. GMs only.
 * @param {Combat|null} [combat] The encounter. Defaults to the active one.
 * @returns {Promise<{name: string, actor: Actor, save: import("./saves.js").SaveResult}[]|null>}
 */
export async function rollSurprise(combat = game.combat) {
	if (!game.user.isGM) return null;

	// One entry per character, even if they have more than one Combatant.
	const combatants = [];
	const seen = new Set();
	for (const combatant of combat?.combatants ?? []) {
		const { actor } = combatant;
		if (!actor?.system?.virtues || seen.has(actor.uuid)) continue;
		seen.add(actor.uuid);
		combatants.push({ name: combatant.name, actor });
	}
	if (!combatants.length) {
		ui.notifications.warn(t("surprise.noCombatants"));
		return null;
	}

	const data = await inputDialog({
		title: t("surprise.title"),
		icon: "fa-solid fa-bolt",
		template: "surprise",
		context: { combatants: combatants.map(({ name }, index) => ({ index, name })) },
		ok: { label: t("surprise.roll"), icon: "fa-solid fa-dice" }
	});
	if (!data) return null;

	const unready = combatants.filter((_entry, index) => data[`unready-${index}`]);
	if (!unready.length) {
		ui.notifications.info(t("surprise.nobody"));
		return null;
	}

	const results = [];
	for (const entry of unready) results.push({ ...entry, save: await evaluateSave(entry.actor, "cla") });
	await postCard(null, "surprise", {
		entries: results.map(({ name, save }) => ({
			name,
			save: saveContext(save),
			outcome: t(save.passed ? "surprise.acts" : "surprise.misses")
		}))
	}, { rolls: results.map(({ save }) => save.roll) });
	return results;
}

/**
 * Offer Roll Surprise in the Combat Tracker's encounter menu.
 * @param {foundry.applications.sidebar.tabs.CombatTracker} tracker
 * @param {object[]} options The menu's entries.
 */
export function addSurpriseOption(tracker, options) {
	options.push(contextMenuEntry({
		label: "bastionland.surprise.title",
		icon: "fa-solid fa-bolt",
		visible: () => game.user.isGM && tracker.viewed?.combatants.size > 0,
		run: () => rollSurprise(tracker.viewed)
	}));
}
