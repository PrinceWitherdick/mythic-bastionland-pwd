import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMPANY_FLAG } from "../../module/actions/company.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const changeCompanyPicture = vi.fn();
vi.mock("../../module/apps/company-picture.js", () => ({ changeCompanyPicture: (...args) => changeCompanyPicture(...args) }));

/** Foundry's own Token, as far as a double click is concerned. */
const opened = vi.fn();
const warned = vi.fn();
class FakeToken {
	constructor(document) {
		this.document = document;
		this.layer = { active: true, _draggedToken: null };
		this.isPreview = false;
		this.actor = null;
	}
	_propagateLeftClick() {
		return false;
	}
	_onClickLeft2() {
		opened();
	}
	// Foundry warns that the Actor is missing and refuses the double click.
	_canView() {
		if (!this.actor) warned();
		return this.actor?.testUserPermission?.() ?? undefined;
	}
}

vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
const onCompanyDoubleClick = vi.fn();
vi.mock("../../module/canvas/travels-click.js", () => ({ onCompanyDoubleClick: (...args) => onCompanyDoubleClick(...args) }));

globalThis.PIXI = { Container: class {}, Graphics: class {}, Sprite: class {} };
globalThis.foundry = { canvas: { placeables: { Token: FakeToken } } };
globalThis.game = { user: { isGM: true } };

const { BastionlandToken, registerTokenHeraldryHooks } = await import("../../module/canvas/BastionlandToken.js");

/** @returns {BastionlandToken} A Token, the Company's or another. */
function token({ company = false } = {}) {
	return new BastionlandToken({
		getFlag: (scope, key) => (scope === SYSTEM_ID && key === COMPANY_FLAG ? company || undefined : undefined)
	});
}

// Foundry asks _canView before it lets a double click through, and warns
// "this Token references an Actor which no longer exists" when there is none.
describe("what Foundry asks before the double click", () => {
	beforeEach(() => {
		warned.mockClear();
		opened.mockClear();
		game.user = { isGM: true };
	});

	it("lets everyone through on the Company, with no warning about a missing Actor, and opens its hex", () => {
		const company = token({ company: true });
		expect(company._canView({ isGM: true })).toBe(true);
		expect(company._canView({ isGM: false })).toBe(true);
		expect(warned).not.toHaveBeenCalled();
		const event = { stopPropagation: vi.fn() };
		company._onClickLeft2(event);
		expect(onCompanyDoubleClick).toHaveBeenCalledWith(company);
		expect(event.stopPropagation).toHaveBeenCalled();
		expect(opened).not.toHaveBeenCalled();
	});

	it("lets nobody through while the Token tools are put away or the Company is dragged", () => {
		const company = token({ company: true });
		company.layer.active = false;
		expect(company._canView({ isGM: true })).toBe(false);
		company.layer = { active: true, _draggedToken: company };
		expect(company._canView({ isGM: true })).toBe(false);
	});

	it("leaves every other Token to Foundry, warning and all, so a sheet still opens", () => {
		const other = token();
		expect(other._canView(game.user)).toBe(undefined);
		expect(warned).toHaveBeenCalled();
		other._onClickLeft2({});
		expect(opened).toHaveBeenCalled();
	});
});

describe("the Company picture button in the Token HUD", () => {
	const hooks = {};
	globalThis.Hooks = { on: (name, fn) => (hooks[name] ??= []).push(fn) };
	registerTokenHeraldryHooks();

	/** The HUD's left column after every renderTokenHUD hook has run. */
	function renderHud(object) {
		const appended = [];
		const element = { querySelector: (selector) => (selector === ".col.left" ? { append: (button) => appended.push(button) } : null) };
		const hud = { object, close: vi.fn(), render: vi.fn() };
		for (const hook of hooks.renderTokenHUD) hook(hud, element);
		return { hud, appended };
	}

	beforeEach(() => {
		changeCompanyPicture.mockClear();
		game.user = { isGM: true };
		globalThis.document = {
			createElement: () => {
				const listeners = {};
				return {
					dataset: {},
					addEventListener: (type, fn) => (listeners[type] = fn),
					click: () => listeners.click?.({ preventDefault() {} })
				};
			}
		};
	});

	it("offers the Referee the Company's picture, and closes the HUD", () => {
		const company = token({ company: true });
		const { hud, appended } = renderHud(company);
		expect(appended).toHaveLength(1);
		expect(appended[0].ariaLabel).toBe("company.picture");
		appended[0].click();
		expect(hud.close).toHaveBeenCalled();
		expect(changeCompanyPicture).toHaveBeenCalledWith(company.document);
	});

	it("isn't there for a player, or on anyone else's Token", () => {
		expect(renderHud(token()).appended).toHaveLength(0);
		game.user = { isGM: false };
		expect(renderHud(token({ company: true })).appended).toHaveLength(0);
	});
});
