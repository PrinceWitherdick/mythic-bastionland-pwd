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
 * @param {string} path Dotted path to the key.
 * @returns {object} An update that deletes only that key.
 */
export const deletionUpdate = (path) => Object.fromEntries([deletionEntry(path)]);

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

/**
 * How a key of the changes an update hook is handed was written. v13's keep
 * the `-=` and `==` prefixes they were asked with; v14's keep the
 * ForcedDeletion or ForcedReplacement, and read the old prefixes as those.
 * @param {string} key
 * @param {*} value
 * @returns {{name: string, whole: boolean}} The key's own name, and whether it was deleted or replaced whole
 *   rather than merged into.
 */
export function changedKey(key, value) {
	const prefixed = /^(-=|==)/.test(key);
	const operators = globalThis.foundry?.data?.operators;
	const is = (operator) => typeof operator === "function" && value instanceof operator;
	return { name: prefixed ? key.slice(2) : key, whole: prefixed || is(operators?.ForcedDeletion) || is(operators?.ForcedReplacement) };
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

/**
 * Half a Tile's width or height, in whole pixels, so a centre turned into a
 * corner and back comes out where it started.
 * @param {number} size
 */
const halfOf = (size) => Math.floor((Number(size) || 0) / 2);

/**
 * Half a Tile's width or height rounded up, as v14's upgrade moves a turned
 * v13 Tile from its corner to its middle.
 * @param {number} size
 */
const halfUp = (size) => Math.ceil((Number(size) || 0) / 2);

/**
 * How far a v14 Tile's centre lies from its x and y. v14 places a Tile by the
 * point its texture is anchored on, and turns it about that point.
 * @param {object} tile
 * @param {number} tile.width
 * @param {number} tile.height
 * @param {number} tile.rotation In degrees clockwise.
 * @param {number} tile.anchorX 0 at its left edge, 1 at its right.
 * @param {number} tile.anchorY 0 at its top edge, 1 at its bottom.
 * @returns {{x: number, y: number}}
 */
function centreOffset({ width, height, rotation, anchorX, anchorY }) {
	const x = Math.floor((0.5 - anchorX) * (Number(width) || 0));
	const y = Math.floor((0.5 - anchorY) * (Number(height) || 0));
	if (!rotation || (!x && !y)) return { x, y };
	const turn = (rotation * Math.PI) / 180;
	return { x: x * Math.cos(turn) - y * Math.sin(turn), y: x * Math.sin(turn) + y * Math.cos(turn) };
}

/**
 * @param {object} [texture] A Tile's texture data.
 * @param {"anchorX"|"anchorY"} key
 * @returns {number|undefined} The anchor it says, if it says one.
 */
const anchorIn = (texture, key) => (texture?.[key] === undefined || texture[key] === null ? undefined : Number(texture[key]));

/**
 * A Tile's data with its x and y at its centre. On v14 a Tile is placed by the
 * point its texture is anchored on: the middle for every Tile the system draws,
 * but v14's upgrade anchors an unturned v13 Tile on its top-left corner, where
 * v13 placed it. On v13 they're its top-left corner.
 * @param {object} data Tile source data or a TileDocument.
 * @returns {object} Source data on either version, never the document: read its `_id`, not `id`.
 *   A copy with x and y moved to the centre where they aren't there already. Its anchor is left
 *   as it is, so a sync sees one that isn't the middle and writes the Tile again.
 */
export function tileCentred(data) {
	const source = data?._source ?? data;
	if (!source) return source;
	if (isV13()) return { ...source, x: source.x + halfOf(source.width), y: source.y + halfOf(source.height) };
	const offset = centreOffset({
		width: source.width,
		height: source.height,
		rotation: source.rotation,
		anchorX: anchorIn(source.texture, "anchorX") ?? 0.5,
		anchorY: anchorIn(source.texture, "anchorY") ?? 0.5
	});
	if (!offset.x && !offset.y) return source;
	return { ...source, x: source.x + offset.x, y: source.y + offset.y };
}

/**
 * Tile data to write, from data whose x and y are its centre: on v13 they're
 * moved to its top-left corner, and on v14 to the point it's anchored on. An
 * update that changes its size or place but not both carries x and y worked
 * out from what the Tile holds now, and on v14 so does one that anchors it
 * anew, since its x and y then mean another point.
 * @param {object} data Creation data, or an update's changes.
 * @param {object} [current] The Tile as it is, centred (tileCentred), for an update.
 * @returns {object}
 */
export function tilePlaced(data, current = {}) {
	const at = (key) => data[key] ?? current[key] ?? 0;
	const moved = ["x", "y", "width", "height"].some((key) => key in data);
	if (isV13()) {
		if (!moved) return data;
		return { ...data, x: at("x") - halfOf(at("width")), y: at("y") - halfOf(at("height")) };
	}
	const anchor = (key) => anchorIn(data.texture, key) ?? anchorIn(current.texture, key) ?? 0.5;
	const anchored = ["anchorX", "anchorY"].some((key) => anchorIn(data.texture, key) !== undefined);
	const offset = centreOffset({ width: at("width"), height: at("height"), rotation: at("rotation"), anchorX: anchor("anchorX"), anchorY: anchor("anchorY") });
	// Anchored on its middle, its x and y are its centre already.
	if (!anchored && !offset.x && !offset.y) return data;
	if (!anchored && !moved && !("rotation" in data)) return data;
	return { ...data, x: Math.round(at("x") - offset.x), y: Math.round(at("y") - offset.y) };
}

/**
 * @param {object} data Tile source data or a TileDocument.
 * @returns {boolean} Whether v14's upgrade anchored the Tile on its top-left corner, as it does every unturned v13 Tile.
 */
export function tileCornerAnchored(data) {
	const source = data?._source ?? data;
	if (isV13() || !source || source.rotation) return false;
	return anchorIn(source.texture, "anchorX") === 0 && anchorIn(source.texture, "anchorY") === 0;
}

/**
 * tileCentred, for a Realm laid on v13 before its Tiles were placed by their
 * corners (tilesSettled in rules/realm-documents.js), which has each Tile's
 * centre in its x and y. v14's upgrade leaves an unturned Tile's x and y as
 * they were, but moves a turned one's on by half its size, as if from its corner.
 * @param {object} data Tile source data or a TileDocument.
 * @returns {object} Source data, as tileCentred gives it.
 */
export function tileCentredUnsettled(data) {
	const source = data?._source ?? data;
	if (isV13() || !source?.rotation) return source;
	return { ...source, x: source.x - halfUp(source.width), y: source.y - halfUp(source.height) };
}

/**
 * tilePlaced, for a Realm laid on v13 before its Tiles were placed by their
 * corners, written as it was laid until it's settled: so its anchor is kept,
 * and on v14 a turned Tile's x and y are moved on as the upgrade moved them.
 * @param {object} data Creation data, or an update's changes.
 * @param {object} [current] The Tile as it is, centred (tileCentredUnsettled), for an update.
 * @returns {object}
 */
export function tilePlacedUnsettled(data, current = {}) {
	if (isV13()) return data;
	let placed = data;
	if (["anchorX", "anchorY"].some((key) => anchorIn(data.texture, key) !== undefined)) {
		const texture = { ...data.texture };
		delete texture.anchorX;
		delete texture.anchorY;
		placed = { ...data, texture };
		if (!Object.keys(texture).length) delete placed.texture;
	}
	const at = (key) => data[key] ?? current[key] ?? 0;
	if (!at("rotation") || !["x", "y", "width", "height", "rotation"].some((key) => key in data)) return placed;
	return { ...placed, x: at("x") + halfUp(at("width")), y: at("y") + halfUp(at("height")) };
}

/**
 * How to read and write a Realm's Tiles, as they stand.
 * @param {boolean} settled Whether its Tiles are settled (tilesSettled in rules/realm-documents.js).
 * @returns {{centred: typeof tileCentred, placed: typeof tilePlaced}} tileCentred and tilePlaced,
 *   or their Unsettled twins for a Realm laid on v13 before its Tiles were placed by their corners.
 */
export const tileReading = (settled) => (settled ? { centred: tileCentred, placed: tilePlaced } : { centred: tileCentredUnsettled, placed: tilePlacedUnsettled });

/**
 * Where to move a Tile of a Realm laid on v13 before its Tiles were placed by
 * their corners, once, so it stands as this Foundry places a Tile: by its
 * top-left corner on v13, and on v14 by its middle, anchored there.
 * @param {object} data Tile source data or a TileDocument.
 * @returns {{x: number, y: number, texture?: {anchorX: number, anchorY: number}}} The update's changes.
 */
export function tileSettling(data) {
	const { x, y, width, height } = tileCentredUnsettled(data);
	if (isV13()) return { x: x - halfOf(width), y: y - halfOf(height) };
	return { x, y, texture: { anchorX: 0.5, anchorY: 0.5 } };
}

/**
 * A Tile's name, as Tile data: v13 Tiles have none, and one written there is
 * dropped, so every comparison with what the Tile holds would find it changed.
 * @param {string} name
 * @returns {{name?: string}}
 */
export const tileNameData = (name) => (isV13() ? {} : { name });

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
