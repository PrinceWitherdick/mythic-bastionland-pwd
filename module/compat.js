/**
 * Foundry v13 and v14 in one place, after Stonetop's foundry-compat.js. Each
 * call site that has to write something one way on v13 and another on v14
 * asks here, so dropping v13 later is an edit to this file rather than a hunt.
 *
 * A core that doesn't say which generation it is (a unit test) is taken for
 * v14, the one the system was written against.
 */

/** @returns {number} The running core's generation (13, 14...), or 0 when it can't be read. */
export function coreGeneration() {
	return Number(globalThis.game?.release?.generation) || 0;
}

/** @returns {boolean} Whether this is Foundry v13, whose data operators, message modes and Scene Levels are older. */
export function isV13() {
	const generation = coreGeneration();
	return generation > 0 && generation < 14;
}

/** @returns {Function|null} v14's ForcedDeletion, or null where the core deletes through `-=` keys instead. */
function forcedDeletion() {
	return isV13() ? null : (globalThis.foundry?.data?.operators?.ForcedDeletion ?? null);
}

/**
 * The update entry that deletes a key: v14's ForcedDeletion, or v13's `-=`
 * prefix on the last part of the path. v14 still reads `-=`, but warns.
 * @param {string} path Dotted path to the key, such as "flags.x.hexes.3.4".
 * @returns {[string, *]}
 */
export function deletionEntry(path) {
	const ForcedDeletion = forcedDeletion();
	if (ForcedDeletion) return [path, new ForcedDeletion()];
	const i = path.lastIndexOf(".");
	return [`${path.slice(0, i + 1)}-=${path.slice(i + 1)}`, null];
}

/**
 * The update entry that writes a key, or deletes it where there's nothing to write.
 * @param {string} path Dotted path to the key.
 * @param {*} value Null or undefined deletes it.
 * @returns {[string, *]}
 */
export function setOrDeleteEntry(path, value) {
	return value != null ? [path, value] : deletionEntry(path);
}

/**
 * The update entry that writes an object whole rather than merging it into
 * what's there: v14's ForcedReplacement, or v13's `==` prefix.
 * @param {string} path
 * @param {object} value
 * @returns {[string, *]}
 */
export function replacementEntry(path, value) {
	const ForcedReplacement = isV13() ? null : globalThis.foundry?.data?.operators?.ForcedReplacement;
	if (ForcedReplacement) return [path, ForcedReplacement.create(value)];
	const i = path.lastIndexOf(".");
	return [`${path.slice(0, i + 1)}==${path.slice(i + 1)}`, value];
}

/** v13's name for each of v14's message modes. */
const ROLL_MODES = Object.freeze({ public: "publicroll", gm: "gmroll", blind: "blindroll", self: "selfroll" });

/** @returns {string} This user's chosen message mode, in v14's words: public, gm, blind or self. */
export function currentMessageMode() {
	if (!isV13()) return game.settings.get("core", "messageMode");
	const rollMode = game.settings.get("core", "rollMode");
	return Object.keys(ROLL_MODES).find((mode) => ROLL_MODES[mode] === rollMode) ?? "public";
}

/**
 * Set a new message's whisper and blind to a message mode, given in v14's words.
 * @param {object} data Data for ChatMessage.create.
 * @param {string} mode public, gm, blind or self.
 */
export function applyMessageMode(data, mode) {
	const cls = ChatMessage.implementation;
	if (isV13()) cls.applyRollMode(data, ROLL_MODES[mode] ?? mode);
	else cls.applyMode(data, mode);
}

/** On v13, the User who sent the query being answered, as the socket brought it. */
let querySender = null;

/**
 * Hear who sends each User query on v13, which doesn't tell a handler. The
 * socket calls its catch-all listeners before core's own, and core calls the
 * handler before it first waits, so the sender heard is the one who sent the
 * query being answered. Called during init.
 */
export function watchQuerySenders() {
	if (!isV13()) return;
	game.socket?.onAny?.((event, userId) => {
		if (event === "userQuery") querySender = userId;
	});
}

/**
 * Who sent a User query: v14 names them in the handler's context, and v13's
 * are heard off the socket (see watchQuerySenders), so a handler must ask
 * before it first waits. Nothing the sender writes in the data is believed.
 * @param {object} [context] The handler's second argument.
 * @returns {User|null}
 */
export function queryAsker(context = {}) {
	if (context?.user) return context.user;
	return (querySender && globalThis.game?.users?.get(querySender)) ?? null;
}

/**
 * One Combat Tracker (or other ContextMenu) entry both cores read: v14's
 * label, visible and onClick, and v13's name, condition and callback. The icon
 * goes in as a whole element, since v13 inserts it as HTML.
 * @param {object} entry
 * @param {string} entry.label An i18n key.
 * @param {string} entry.icon Font Awesome classes.
 * @param {() => boolean} [entry.visible]
 * @param {() => unknown} entry.run
 * @returns {object}
 */
export function contextMenuEntry({ label, icon, visible = () => true, run }) {
	const shown = () => Boolean(visible());
	return {
		label,
		name: label,
		icon: `<i class="${icon}"></i>`,
		visible: shown,
		condition: shown,
		onClick: () => run(),
		callback: () => run()
	};
}

/**
 * Whether a Scene control's tool is being switched on. v14 says so in the
 * third argument of onToolChange; v13 calls it once for the tool going and once
 * for the tool coming with no third argument, having already picked the new one.
 * @param {object} tool
 * @param {boolean} [active]
 * @returns {boolean}
 */
export function toolActivated(tool, active) {
	return active ?? (globalThis.ui?.controls?.tool === tool);
}

/**
 * Buttons in a window's own header, beside Close, from `_getFrameButtons` as
 * v14 has it. v13 has neither `_getFrameButtons` nor anything that would draw
 * them, so this adds both there; on v14 it steps aside.
 * @template {typeof foundry.applications.api.ApplicationV2} T
 * @param {T} Base
 * @returns {T}
 */
export function FrameButtonsMixin(Base) {
	const drawnByCore = typeof Base.prototype._renderFrameButtons === "function";
	return class extends Base {
		/**
		 * @param {object} options
		 * @returns {{action: string, icon: string, label: string}[]}
		 */
		_getFrameButtons(options) {
			return super._getFrameButtons?.(options) ?? [];
		}

		/** @override */
		async _renderFrame(options) {
			const frame = await super._renderFrame(options);
			if (drawnByCore) return frame;
			const close = frame.querySelector(".window-header [data-action=close]");
			for (const { action, icon, label } of this._getFrameButtons(options)) {
				const button = frame.ownerDocument.createElement("button");
				button.type = "button";
				button.className = `header-control ${icon} icon`;
				button.dataset.action = action;
				button.dataset.tooltip = "";
				button.ariaLabel = game.i18n.localize(label);
				close?.before(button);
			}
			return frame;
		}
	};
}

/**
 * The Scene data that paints a Scene's paper: the colour of its first Level
 * on v14, its own background colour on v13, which has no Levels.
 * @param {string} levelId
 * @param {string} name
 * @param {string} paper
 * @returns {object}
 */
export function paperSceneData(levelId, name, paper) {
	if (isV13()) return { backgroundColor: paper };
	return { levels: [{ _id: levelId, name, background: { color: paper } }], initialLevel: levelId };
}

/** @returns {object} The Scene data that turns off Fog of War exploration. */
export function noFogSceneData() {
	return isV13() ? { fog: { exploration: false } } : { fog: { mode: 0 } };
}

/**
 * Where a Scene's paper colour is kept, and how to write a new one.
 * @param {Scene} scene
 * @param {string} levelId The Level to prefer on v14.
 * @returns {{colour: string|undefined, update: (paper: string) => object, updateSource: (paper: string) => void}|null}
 */
export function scenePaper(scene, levelId) {
	if (isV13()) {
		return {
			colour: scene._source.backgroundColor,
			update: (paper) => ({ backgroundColor: paper }),
			updateSource: (paper) => scene.updateSource({ backgroundColor: paper })
		};
	}
	const level = scene.levels?.get(levelId) ?? scene.levels?.contents[0];
	if (!level) return null;
	return {
		colour: level._source.background?.color,
		update: (paper) => ({ levels: [{ _id: level.id, background: { color: paper } }] }),
		updateSource: (paper) => level.updateSource({ background: { color: paper } })
	};
}
