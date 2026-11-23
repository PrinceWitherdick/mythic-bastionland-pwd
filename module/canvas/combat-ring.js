import { t } from "../chat/cards.js";
import { read } from "../client-settings.js";
import { clickOpensRing, ringButtons, ringCombatant, ringGrowth, ringHasButtons } from "../rules/combat-ring.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

/*
 * The combat buttons round a Token (what each holds is in
 * module/rules/combat-ring.js). Built on Foundry's own Token HUD, so they sit
 * in the HUD over the Token and are placed and scaled as it is.
 *
 * EVERY BUTTON IS A CONTROL THE SHEET ALREADY HAS, and calls what that control
 * calls: Attack the Attack dialog, Take Damage its window, a Save the sheet's
 * Save, and Morale the NPC sheet's Morale, which asks first. Nothing here rolls
 * what the sheet wouldn't.
 *
 * WHO GETS THEM: whoever just selected the Token, which is Foundry's rule for
 * who may (a player their own, the Referee anyone's), with the Select tool,
 * and without Shift, Ctrl, Alt or Meta held. A drag moves the Token and opens
 * nothing.
 *
 * THEY GO AWAY as Foundry's HUD does: any press on the map, pressing the same
 * Token again, the Token released or deleted, it leaving the Combat, the map
 * closing, or the setting turned off. A button puts them away as it acts.
 */

/** The setting that turns them off for one person. */
const COMBAT_RING_SETTING = "combatRing";

/** @returns {boolean} Whether this person wants the buttons. */
const showsCombatRing = () => read(COMBAT_RING_SETTING, true) !== false;

/** Register the setting. Called during init. */
export function registerCombatRingSetting() {
	game.settings.register(SYSTEM_ID, COMBAT_RING_SETTING, {
		name: "bastionland.settings.combatRing.name",
		hint: "bastionland.settings.combatRing.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: () => closeCombatRing()
	});
}

/**
 * The template's context: each button with its words, its spoken name and
 * its place. `data-index` counts through the left column, then the right.
 * @param {ReturnType<typeof ringButtons>} buttons
 * @param {{name?: string}} [options]
 * @returns {object}
 */
export function ringContext(buttons, { name = "" } = {}) {
	const fight = buttons?.fight ?? [];
	const saves = buttons?.saves ?? [];
	const view = (button, index) => {
		if (button.run === "save") {
			const virtue = t(`virtues.${button.virtue}.label`);
			return { index, icon: button.icon, label: t(`virtues.${button.virtue}.abbr`), value: String(button.value), aria: t("combatRing.save", { virtue, value: button.value }) };
		}
		const label = t({ attack: "sheet.attack", takeDamage: "sheet.takeDamage", morale: "morale.title" }[button.run]);
		return { index, icon: button.icon, label, value: "", aria: label };
	};
	return {
		ringLabel: t("combatRing.label", { name }),
		fightLabel: t("combatRing.fight"),
		savesLabel: t("combatRing.saves"),
		fight: fight.map((button, index) => view(button, index)),
		saves: saves.map((button, index) => view(button, fight.length + index))
	};
}

/**
 * Press one of the buttons: what the sheet's own control does. The actions
 * are loaded as a button is pressed, so the Token class, which puts the
 * buttons up, doesn't carry the whole of the fight with it.
 * @param {import("../rules/combat-ring.js").RingButton} button
 * @param {Actor} actor
 * @returns {Promise<unknown>}
 */
export async function runRingButton(button, actor) {
	if (!button || !actor) return null;
	switch (button.run) {
		case "attack": return (await import("../actions/attack.js")).attack(actor);
		case "takeDamage": return (await import("../actions/damage.js")).takeDamage(actor);
		case "morale": return (await import("../actions/saves.js")).rollMoraleIfAccepted(actor);
		case "save": return (await import("../actions/saves.js")).rollSave(actor, button.virtue);
		default: return null;
	}
}

/**
 * The Combat a Token is in, if its buttons may come up for this person.
 * @param {Token|null} token The placeable.
 * @returns {object|null} Its combatant.
 */
export function ringCombatantFor(token) {
	if (!showsCombatRing()) return null;
	const doc = token?.document;
	if (!doc || doc.parent?.id !== globalThis.canvas?.scene?.id) return null;
	return ringCombatant(doc, game.combats ?? []);
}

/**
 * The window, built on Foundry's Token HUD base, made the first time a click
 * wants it: Foundry's HUD classes don't exist while this module is imported.
 * @returns {typeof Application}
 */
function createCombatRingClass() {
	const { BasePlaceableHUD } = foundry.applications.hud;
	const { HandlebarsApplicationMixin } = foundry.applications.api;

	class CombatRing extends HandlebarsApplicationMixin(BasePlaceableHUD) {
		static DEFAULT_OPTIONS = {
			id: "bastionland-combat-ring",
			classes: ["bastionland", "bastionland-combat-ring"],
			actions: { ringPress: CombatRing.#onPress }
		};

		static PARTS = {
			ring: { root: true, template: templatePath("hud/combat-ring.hbs") }
		};

		/** What the buttons on screen do, by their `data-index`. */
		#buttons = [];

		get actor() {
			return this.document?.actor ?? null;
		}

		/** @override The buttons need none of the Token's own data that Foundry's HUD puts in its context. */
		async _prepareContext(options) {
			const buttons = options?.ringButtons ?? ringButtons(this.actor);
			this.#buttons = [...buttons.fight, ...buttons.saves];
			return ringContext(buttons, { name: this.document?.name ?? this.actor?.name ?? "" });
		}

		/** @inheritDoc Never smaller on screen than their own size, however far out the map is zoomed. */
		_updatePosition(position) {
			const placed = super._updatePosition(position);
			const grow = ringGrowth(globalThis.canvas?.stage?.scale?.x ?? 1, placed.scale ?? 1);
			if (grow > 1) {
				placed.width /= grow;
				placed.height /= grow;
				placed.scale = (placed.scale ?? 1) * grow;
			}
			return placed;
		}

		/**
		 * A button: put the buttons away, then do what the sheet's control does.
		 * @this {CombatRing}
		 * @param {PointerEvent} _event
		 * @param {HTMLElement} target
		 */
		static async #onPress(_event, target) {
			const button = this.#buttons[Number(target?.dataset?.index)];
			const actor = this.actor;
			await this.close();
			try {
				await runRingButton(button, actor);
			} catch (error) {
				console.error(`${SYSTEM_ID} | The combat buttons couldn't do that`, error);
			}
		}
	}
	return CombatRing;
}

/* -------------------------------------------- */
/*  The one set of buttons on this client       */
/* -------------------------------------------- */

let ring = null;
/** The Token whose buttons the latest press on the map put away, so letting go of that Token keeps them away. */
let pressedOn = null;
const boards = new WeakSet();

const theRing = () => (ring ??= new (createCombatRingClass())());

/** @returns {Promise<unknown>|undefined} Put the buttons away, if they're up. */
function closeCombatRing() {
	if (ring?.rendered) return ring.close();
}

/** A press anywhere on the map: remember whose buttons were up, and put them away. */
function onBoardPress() {
	pressedOn = ring?.rendered ? (ring.object?.document?.id ?? null) : null;
	return closeCombatRing();
}

/**
 * A click has let go of a Token: put its buttons up, if it should have them.
 * @param {Token} token
 * @param {PointerEvent} [event]
 */
export async function openRingOnClick(token, event) {
	const pressed = pressedOn;
	pressedOn = null;
	const modifiers = Boolean(event?.shiftKey || event?.ctrlKey || event?.altKey || event?.metaKey);
	const tokenId = token?.document?.id ?? null;
	if (!clickOpensRing({ pressedOn: pressed, tokenId, tool: game.activeTool ?? null, modifiers, controlled: Boolean(token?.controlled) })) return;
	if (!ringCombatantFor(token)) return;
	const buttons = ringButtons(token.actor);
	if (!ringHasButtons(buttons)) return;
	try {
		await theRing().render({ force: true, position: true, object: token, ringButtons: buttons });
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't put the combat buttons up`, error);
	}
}

/** The Combats changed: buttons on a Token no longer in one, or now defeated, go away. */
function syncCombatRing() {
	if (ring?.rendered && !ringCombatantFor(ring.object)) closeCombatRing();
}

/** Listen for everything that moves the buttons or puts them away. Called during init. */
export function registerCombatRingHooks() {
	// Any press on the map. The board is the same element for the whole session, so it's listened to once.
	Hooks.on("canvasReady", (board) => {
		const view = board?.app?.view ?? globalThis.canvas?.app?.view;
		if (!view || boards.has(view)) return;
		boards.add(view);
		// Capture, so they're put away before Foundry handles the press.
		view.addEventListener("pointerdown", onBoardPress, { capture: true });
	});
	const onToken = (token) => ring?.rendered && ring.object === token;
	Hooks.on("controlToken", (token, controlled) => {
		if (!controlled && onToken(token)) closeCombatRing();
	});
	Hooks.on("deleteToken", (doc) => {
		if (ring?.rendered && ring.object?.document?.id === doc?.id) closeCombatRing();
	});
	// Follow the Token as it moves, and the zoom, which decides how much they grow.
	Hooks.on("refreshToken", (token) => {
		if (onToken(token)) ring.setPosition();
	});
	Hooks.on("canvasPan", () => {
		if (ring?.rendered) ring.setPosition();
	});
	Hooks.on("canvasTearDown", () => {
		pressedOn = null;
		return closeCombatRing();
	});
	// A Save's score drawn as it is now; a Token taken out of the Combat, or marked defeated, loses them.
	// A write of flags alone, as an Attack's marks are, changes nothing the ring shows.
	Hooks.on("updateActor", (actor, changes) => {
		if (ring?.rendered && ring.actor === actor && ["system", "type", "name"].some((key) => key in changes)) ring.render();
	});
	for (const hook of ["updateCombatant", "deleteCombatant", "deleteCombat"]) Hooks.on(hook, syncCombatRing);
}
