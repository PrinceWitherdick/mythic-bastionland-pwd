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

globalThis.PIXI = { Container: class {}, Graphics: class {}, Sprite: class {} };
globalThis.foundry = { canvas: { placeables: { Token: FakeToken } } };
globalThis.game = { user: { isGM: true } };

const { BastionlandToken } = await import("../../module/canvas/BastionlandToken.js");

/** @returns {BastionlandToken} A Token, the Company's or another. */
function token({ company = false } = {}) {
	return new BastionlandToken({
		getFlag: (scope, key) => (scope === SYSTEM_ID && key === COMPANY_FLAG ? company || undefined : undefined)
	});
}

const click = () => ({ stopPropagation: vi.fn() });

describe("double clicking a Token", () => {
	beforeEach(() => {
		changeCompanyPicture.mockClear();
		opened.mockClear();
		warned.mockClear();
		game.user.isGM = true;
	});

	it("offers the Company's picture, which nothing else on a made Realm does", () => {
		const company = token({ company: true });
		company._onClickLeft2(click());
		expect(changeCompanyPicture).toHaveBeenCalledWith(company.document);
		expect(opened).not.toHaveBeenCalled();
	});

	it("leaves it to Foundry for anyone else's Token, so a sheet still opens", () => {
		token()._onClickLeft2(click());
		expect(changeCompanyPicture).not.toHaveBeenCalled();
		expect(opened).toHaveBeenCalled();
	});

	it("leaves it to Foundry for a player, since only the Referee chooses the picture", () => {
		game.user.isGM = false;
		token({ company: true })._onClickLeft2(click());
		expect(changeCompanyPicture).not.toHaveBeenCalled();
		expect(opened).toHaveBeenCalled();
	});

	it("keeps the click off the Realm underneath", () => {
		const event = click();
		token({ company: true })._onClickLeft2(event);
		expect(event.stopPropagation).toHaveBeenCalled();
	});
});

// Foundry asks _canView before it lets a double click through, and warns
// "this Token references an Actor which no longer exists" when there is none.
describe("what Foundry asks before the double click", () => {
	beforeEach(() => {
		warned.mockClear();
		game.user = { isGM: true };
	});

	it("lets the Referee through to the Company's picture, with no warning about a missing Actor", () => {
		expect(token({ company: true })._canView(game.user)).toBe(true);
		expect(warned).not.toHaveBeenCalled();
	});

	it("says no to a player, and still doesn't warn them", () => {
		const user = { isGM: false };
		expect(token({ company: true })._canView(user)).toBe(false);
		expect(warned).not.toHaveBeenCalled();
	});

	it("says no while the Company is being dragged, or off the Token layer", () => {
		const dragged = token({ company: true });
		dragged.layer._draggedToken = dragged;
		expect(dragged._canView(game.user)).toBe(false);

		const away = token({ company: true });
		away.layer.active = false;
		expect(away._canView(game.user)).toBe(false);
	});

	it("leaves every other Token to Foundry, warning and all", () => {
		expect(token()._canView(game.user)).toBe(undefined);
		expect(warned).toHaveBeenCalled();
	});
});
