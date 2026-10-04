import { t } from "../chat/cards.js";
import { read } from "../client-settings.js";
import { SETTINGS_TAB, formatRange, groupsFor, offersMenu, offersSetting, settingRow, settingValue } from "../rules/settings-tab.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * The Settings page a Knight sheet and the GM Toolkit carry on their tab
 * rails, after the Preferences tab on Stonetop's sheets. The groups it offers
 * are in module/rules/settings-tab.js, the page is
 * templates/actor/parts/settings-tab.hbs, and a sheet takes it with
 * SettingsTabMixin plus SETTINGS_TAB_ENTRY among its tabs, and says who
 * is shown it with _showsSettingsTab. The settings are that person's own, so
 * the page is kept to sheets that are theirs.
 *
 * None of the page's controls has a name, so the sheet's form never sends one
 * to the Actor. Each says which setting it writes in `data-setting`, and the
 * setting's own onChange does whatever a change needs, so the sheet isn't
 * drawn again.
 */

/** The Settings page's entry on a sheet's tab rail. */
export const SETTINGS_TAB_ENTRY = Object.freeze({ id: SETTINGS_TAB, icon: "fa-solid fa-sliders", label: "bastionland.settingsTab.tab" });

/** @returns {Map<string, object>|undefined} Every registered setting, by `namespace.key`. */
const registered = () => game.settings?.settings;

/**
 * @param {string} key
 * @returns {unknown} The setting's value, or its default while it can't be read.
 */
const currentValue = (key) => read(key, registered()?.get(`${SYSTEM_ID}.${key}`)?.default);

/**
 * Whether a character is the reader's own, for the Settings page: one they
 * play as, or, for a player, one they own by name, as on Stonetop's sheets. A
 * GM counts only the one they play, since a GM can open every character, and
 * Foundry makes whoever creates one its owner.
 * @param {{id?: string, ownership?: object}|null} actor
 * @param {{id: string, isGM: boolean, character?: {id: string}|null}|null} [user]
 * @returns {boolean}
 */
export function isOwnCharacter(actor, user = game.user) {
	if (!actor?.id || !user) return false;
	if (user.character?.id === actor.id) return true;
	const owner = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
	return !user.isGM && (actor.ownership?.[user.id] ?? 0) >= owner;
}

/**
 * The groups as the page draws them, with each setting's current value. Built
 * afresh each time the sheet draws, since a value can change from Foundry's
 * settings window or another sheet.
 * @param {{isGM: boolean}} [user]
 * @returns {object[]}
 */
export function settingGroupsView(user = game.user) {
	const settings = registered();
	if (!settings) return [];
	return groupsFor(Boolean(user?.isGM))
		.map((group) => ({
			id: group.id,
			title: group.title,
			rows: group.keys.map((key) => {
				const config = settings.get(`${SYSTEM_ID}.${key}`);
				const row = settingRow(key, config, currentValue(key));
				// The rest are this person's own; these change the game for everyone.
				return row && { ...row, forTable: config.scope === "world" };
			}).filter(Boolean),
			menus: (group.menus ?? []).map((id) => {
				const menu = game.settings.menus?.get(`${SYSTEM_ID}.${id}`);
				return menu && { id, label: menu.label ?? menu.name, hint: menu.hint ?? "", icon: menu.icon ?? "fa-solid fa-gear" };
			}).filter(Boolean)
		}))
		// A group with nothing registered would be a heading over nothing.
		.filter((group) => group.rows.length || group.menus.length);
}

/**
 * Write a setting from one of the page's controls.
 * @param {string} key
 * @param {unknown} raw A tick box's `checked`, or any other control's `value`.
 * @returns {Promise<boolean>} Whether it was written.
 */
export async function changeSetting(key, raw) {
	if (!offersSetting(key, Boolean(game.user?.isGM))) return false;
	const config = registered()?.get(`${SYSTEM_ID}.${key}`);
	if (!config) return false;
	const value = settingValue(config, raw);
	if (value === undefined) return false;
	await game.settings.set(SYSTEM_ID, key, value);
	return true;
}

/**
 * Open one of the system's settings windows, such as the Welcome.
 * @param {string} id As registered with registerMenu.
 */
export function openSettingsMenu(id) {
	if (!offersMenu(id, Boolean(game.user?.isGM))) return null;
	const menu = game.settings.menus?.get(`${SYSTEM_ID}.${id}`);
	if (!menu?.type) return null;
	// One already open under the window's own id is brought forward rather than drawn over.
	const open = menu.type.DEFAULT_OPTIONS?.id ? foundry.applications.instances?.get(menu.type.DEFAULT_OPTIONS.id) : null;
	return (open instanceof menu.type ? open : new menu.type()).render({ force: true });
}

/** Open Foundry's settings window on this system's settings. */
export function openSystemSettings() {
	const app = game.settings.sheet;
	// Chosen before the window draws its tabs, which it does again once its list of settings has loaded.
	app.tabGroups.categories = "system";
	return app.render({ force: true });
}

/**
 * Show a setting's value in a control, as it would be drawn.
 * @param {HTMLInputElement|HTMLSelectElement} control
 * @param {unknown} value
 */
function showValue(control, value) {
	if (control.type === "checkbox") {
		control.checked = Boolean(value);
		return;
	}
	control.value = String(value);
	const readout = control.type === "range" ? control.closest(".bastionland-settings__range")?.querySelector("output") : null;
	if (readout) readout.value = formatRange(value, control.step);
}

/**
 * Keep every open Settings page showing each setting as it is, whether it was
 * changed from another sheet's page, Foundry's settings window or a macro,
 * without drawing a sheet again. Called during init.
 */
export function registerSettingsTabHooks() {
	const prefix = `${SYSTEM_ID}.`;
	const sync = (id) => {
		if (!id?.startsWith(prefix)) return;
		const key = id.slice(prefix.length);
		const controls = document.querySelectorAll(`.bastionland-settings [data-setting="${CSS.escape(key)}"]`);
		if (!controls.length) return;
		const value = currentValue(key);
		for (const control of controls) showValue(control, value);
	};
	Hooks.on("clientSettingChanged", (id) => sync(id));
	// A world setting is a document, made the first time it's set.
	for (const hook of ["createSetting", "updateSetting"]) Hooks.on(hook, (setting) => sync(setting.key));
}

/**
 * Gives an actor sheet the Settings page. The sheet lists SETTINGS_TAB_ENTRY
 * among its tabs, draws the page where `tabs.settings` is given, and says who
 * is shown it with _showsSettingsTab. The page is marked `data-viewable`, so a
 * sheet with ViewableMixin keeps it live for someone who can only view it.
 * @param {typeof foundry.applications.sheets.ActorSheetV2} Base
 */
export const SettingsTabMixin = (Base) => class extends Base {
	static DEFAULT_OPTIONS = {
		actions: {
			openSettingsMenu: (_event, target) => openSettingsMenu(target.dataset.menu),
			openAllSettings: () => openSystemSettings()
		}
	};

	/**
	 * Whether the person reading the sheet is shown its Settings page. None is,
	 * unless the sheet says otherwise.
	 * @param {User|null} _user
	 * @returns {boolean}
	 */
	_showsSettingsTab(_user) {
		return false;
	}

	/**
	 * Only a sheet that is the reader's own shows the page.
	 * @override
	 */
	_getTabsConfig(group) {
		const config = super._getTabsConfig(group);
		if (!config?.tabs?.some((tab) => tab.id === SETTINGS_TAB) || this._showsSettingsTab(game.user ?? null)) return config;
		return { ...config, tabs: config.tabs.filter((tab) => tab.id !== SETTINGS_TAB) };
	}

	/**
	 * A sheet left on its Settings page that no longer shows it, such as after
	 * a player hands the Knight on, opens on its first page instead.
	 * @override
	 */
	_prepareTabs(group) {
		const tabs = super._prepareTabs(group);
		const initial = this._getTabsConfig(group)?.initial;
		if (!initial || Object.values(tabs).some((tab) => tab.active)) return tabs;
		this.tabGroups[group] = initial;
		return super._prepareTabs(group);
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		context.settingGroups = context.tabs?.[SETTINGS_TAB] ? settingGroupsView() : [];
		return context;
	}

	/**
	 * A control on the Settings page writes its setting, and nothing is sent to the Actor.
	 * @override
	 */
	_onChangeForm(formConfig, event) {
		const control = event.target;
		const key = control?.dataset?.setting;
		if (!key) return super._onChangeForm(formConfig, event);
		changeSetting(key, control.type === "checkbox" ? control.checked : control.value).catch((error) => {
			console.error(error);
			ui.notifications.error(t("settingsTab.notSaved"));
		});
	}

	/**
	 * A slider's number follows the handle while it's dragged. The setting is
	 * written once, when the handle is let go.
	 * @override
	 */
	_attachFrameListeners() {
		super._attachFrameListeners();
		this.element.addEventListener("input", (event) => {
			const control = event.target.closest?.('.bastionland-settings input[type="range"][data-setting]');
			const readout = control?.closest(".bastionland-settings__range")?.querySelector("output");
			if (readout) readout.value = formatRange(control.value, control.step);
		});
	}
};
