/**
 * The Settings page on the Knight sheet and the GM Toolkit, after the
 * Preferences tab on Stonetop's sheets.
 *
 * The page stores nothing of its own. Each control writes the setting that
 * Foundry's own settings window writes, so the two never disagree, and each
 * row's label, hint, choices and range are read from the setting's
 * registration rather than written out a second time. What is decided here is
 * which settings the page offers, in what order, and to whom.
 *
 * The keys are quoted in full, not built, so a search for a setting's key
 * finds every place that reads it.
 */

/** The page's id, on the rail and in the sheet's tab group. */
export const SETTINGS_TAB = "settings";

/**
 * The groups, in the order the page draws them.
 *
 * `gmOnly` groups are drawn for GMs alone, and their settings are refused to
 * anyone else. `menus` are registered settings windows, offered as buttons
 * under the group's rows.
 */
export const SETTING_GROUPS = Object.freeze([
	{
		id: "reading",
		title: "bastionland.settingsTab.groups.reading",
		// Text size first: it's the one most often looked for.
		keys: ["textSize", "contrast", "typeface", "noItalics", "reduceMotion", "keywordTips"]
	},
	{
		id: "windows",
		title: "bastionland.settingsTab.groups.windows",
		keys: ["artPreviews", "restoreOpenSheets", "phaseBannerShown", "travelRulesShown", "hexReadoutShown", "visitedMarksShown"]
	},
	{
		id: "referee",
		title: "bastionland.settingsTab.groups.referee",
		keys: ["soloPlay", "hexLorePrompt", "hexCoordinates", "direWeather", "weatherButton", "rulebookForPlayers"],
		menus: ["realmAppearance", "welcome"],
		gmOnly: true
	}
]);

/**
 * @param {boolean} isGM
 * @returns {typeof SETTING_GROUPS[number][]} The groups this person is offered.
 */
export const groupsFor = (isGM) => SETTING_GROUPS.filter((group) => isGM || !group.gmOnly);

/**
 * @param {string} key
 * @param {boolean} isGM
 * @returns {boolean} Whether this person may change the setting from the page.
 *   Controls say which setting they write in a data attribute, so without this
 *   any element that grew one could write any setting, the world's included.
 */
export const offersSetting = (key, isGM) => groupsFor(isGM).some((group) => group.keys.includes(key));

/**
 * @param {string} id
 * @param {boolean} isGM
 * @returns {boolean} Whether this person may open the settings window from the page.
 */
export const offersMenu = (id, isGM) => groupsFor(isGM).some((group) => group.menus?.includes(id));

/**
 * A slider's value as its readout shows it, with as many decimals as its step,
 * so the number doesn't jump a character wider as the handle moves.
 * @param {number|string} value
 * @param {number} [step]
 * @returns {string}
 */
export function formatRange(value, step = 1) {
	const decimals = String(step).split(".")[1]?.length ?? 0;
	return Number(value).toFixed(decimals);
}

/**
 * One setting as the page draws it, or null when it isn't registered.
 *
 * The control follows the registration the way Foundry's settings window
 * does: choices make a drop-down, a range makes a slider, and anything else is
 * a tick box. Labels are left as the registration's keys for the template to
 * localize.
 * @param {string} key
 * @param {{name?: string, hint?: string, choices?: object, range?: {min: number, max: number, step: number}, default?: unknown}|undefined} config
 * @param {unknown} value The setting's current value.
 * @returns {object|null}
 */
export function settingRow(key, config, value) {
	if (!config) return null;
	const row = { key, label: config.name ?? key, hint: config.hint ?? "" };
	if (config.choices) {
		return {
			...row,
			isChoice: true,
			// Choice keys are strings whatever the setting's type, so both sides are compared as strings.
			choices: Object.entries(config.choices).map(([choice, label]) => ({ value: choice, label, selected: String(value) === choice }))
		};
	}
	if (config.range) {
		const { min, max, step } = config.range;
		const number = Number(value);
		const current = Number.isFinite(number) ? number : Number(config.default) || 0;
		return { ...row, isRange: true, min, max, step, value: current, display: formatRange(current, step) };
	}
	return { ...row, isCheck: true, checked: Boolean(value) };
}

/**
 * A control's value as its setting stores it. Controls hand back strings, and
 * a setting stores what it's given, so a Number setting written from a slider
 * would otherwise come back as text.
 * @param {{type?: Function, choices?: object, range?: {min: number, max: number}}} config
 * @param {unknown} raw A tick box's `checked`, or any other control's `value`.
 * @returns {unknown} Undefined for a value the setting can't take.
 */
export function settingValue(config, raw) {
	if (config.type === Boolean) return Boolean(raw);
	if (config.type === Number) {
		const number = Number(raw);
		if (!Number.isFinite(number)) return undefined;
		return config.range ? Math.min(config.range.max, Math.max(config.range.min, number)) : number;
	}
	const text = String(raw);
	if (config.choices && !Object.hasOwn(config.choices, text)) return undefined;
	return text;
}
