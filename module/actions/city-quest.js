import { confirmDialog } from "../apps/ui.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import { CITY_OMEN_COUNT, cityOmen, cityQuestOver } from "../rules/city-quest.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * The City Quest (p172). A Company worthy of it meets an Omen of the City
 * where the Wilderness Roll would give a random Myth's Omen. The world
 * remembers which Omens of the City the Company has encountered.
 */

const CITY_QUEST_SETTING = "cityQuest";

/** Called on every client whenever the Omens of the City seen change. */
export const CITY_QUEST_HOOK = `${SYSTEM_ID}.cityQuestChanged`;

/** Register the City Quest's progress. Called during init. */
export function registerCityQuestSetting() {
	game.settings.register(SYSTEM_ID, CITY_QUEST_SETTING, {
		scope: "world",
		config: false,
		type: Object,
		default: { seen: [] },
		onChange: () => Hooks.callAll(CITY_QUEST_HOOK)
	});
}

/** @returns {number[]} The Omens of the City encountered, in the order they came. */
export function cityOmensSeen() {
	const seen = game.settings.get(SYSTEM_ID, CITY_QUEST_SETTING)?.seen;
	return Array.isArray(seen) ? seen.filter((omen) => Number.isInteger(omen) && omen >= 1 && omen <= CITY_OMEN_COUNT) : [];
}

/**
 * Roll the next Omen of the City: d12 plus the Omens already encountered, the
 * next one down the list for a duplicate, and 24 at most. Only GMs see the
 * card. GMs only.
 * @returns {Promise<{omen: number, ends: boolean}|null>}
 */
export async function rollCityOmen() {
	if (!game.user.isGM) return null;
	const seen = cityOmensSeen();
	if (cityQuestOver(seen)) {
		ui.notifications.info(t("cityQuest.over"));
		return null;
	}

	const roll = await new Roll("1d12").evaluate();
	const { omen, ends } = cityOmen(roll.total, seen);
	if (omen === null) return null;
	await game.settings.set(SYSTEM_ID, CITY_QUEST_SETTING, { seen: [...seen, omen] });

	const index = await loadArtIndex();
	await postCard(null, "omen", {
		title: t("cityQuest.title"),
		tagline: t("cityQuest.rolled", { roll: roll.total, count: seen.length }),
		omen: t("cityQuest.omen", { omen, count: CITY_OMEN_COUNT }),
		text: index?.cityQuest?.omens?.[omen - 1] ?? null,
		hint: ends ? t("cityQuest.ends") : null
	}, { rolls: [roll], mode: "gm" });
	return { omen, ends };
}

/**
 * Forget every Omen of the City encountered, for a new Company. GMs only.
 * @returns {Promise<boolean>} Whether it was reset.
 */
export async function resetCityQuest() {
	if (!game.user.isGM) return false;
	const confirmed = await confirmDialog({ title: t("cityQuest.resetTitle"), icon: "fa-solid fa-city", message: t("cityQuest.resetConfirm") });
	if (!confirmed) return false;
	await game.settings.set(SYSTEM_ID, CITY_QUEST_SETTING, { seen: [] });
	return true;
}
