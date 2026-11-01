import { t } from "../chat/cards.js";
import { chooseActor } from "../apps/actor-pick.js";
import { ownedAttackers } from "../chat/attack-card.js";
import { macroIconPath } from "../rules/macro-icons.js";
import { attack } from "./attack.js";
import { hotbarMacro } from "./hotbar-macro.js";
import { worldKnights } from "./knights.js";

/**
 * An Attack macro on everyone's hotbar, so an Attack is a number key away and
 * the sheet needn't cover the map: target with T, then press the macro's key.
 * It attacks with whoever's Token is selected; a player with none selected
 * attacks with their own Knight.
 */

/** The world setup step that gives a world the macro. */
export const ATTACK_MACRO_STEP = "attackMacro";

const { seed: seedAttackMacro, ensure: ensureAttackHotbar } = hotbarMacro({
	macroFlag: "attackMacro",
	hotbarFlag: "attackHotbar",
	nameKey: "attack.macro.name",
	img: macroIconPath("attack"),
	command: "game.system.api.attackFromHotbar();",
	ownership: () => ({ default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }),
	everyone: true
});

export { seedAttackMacro, ensureAttackHotbar };

/**
 * Who this user could attack with from the hotbar: the actors of their
 * selected Tokens, or with none selected, a player's own character and then
 * every Knight they own. A GM owns everybody, and their character is the
 * Toolkit, so only their selected Tokens are offered. Each is offered once,
 * however many ways they were gathered.
 * @returns {Actor[]}
 */
export function attackerPool() {
	const selected = ownedAttackers((canvas?.tokens?.controlled ?? []).map((token) => token.actor));
	if (selected.length || game.user.isGM) return selected;
	const own = ownedAttackers([game.user.character]);
	return own.length ? own : ownedAttackers(worldKnights());
}

/**
 * Attack with whoever this user has to hand, asking which where there are
 * several, as the sheet's Attack button would.
 * @returns {Promise<ChatMessage[]|null>}
 */
export async function attackFromHotbar() {
	const pool = attackerPool();
	if (!pool.length) {
		ui.notifications.warn(t(game.user.isGM ? "attack.macro.nobodyGM" : "attack.macro.nobody"));
		return null;
	}
	const attacker = await chooseActor(pool, { title: t("attack.title"), message: t("attack.macro.who"), icon: "fa-solid fa-swords" });
	return attacker ? attack(attacker) : null;
}
