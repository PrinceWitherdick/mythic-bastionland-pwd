import { SYSTEM_ID } from "../system-id.js";

/*
 * Where an Attack card keeps its state. Kept apart from attack-card.js so the
 * modules that card imports, such as the duel's, can read a card too.
 */

/** The flag an Attack card's state is kept under. */
export const ATTACK_FLAG = "attack";

/**
 * @param {ChatMessage|undefined} message
 * @returns {import("../rules/attack.js").AttackState|null} The Attack the card holds, if it's an Attack card.
 */
export const attackOf = (message) => message?.flags?.[SYSTEM_ID]?.[ATTACK_FLAG] ?? null;
