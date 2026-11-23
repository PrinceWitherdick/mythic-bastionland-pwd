import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/actions/realm.js", () => ({ isRealmScene: (scene) => Boolean(scene?.realm) }));
vi.mock("../../module/actions/company.js", () => ({ findCompanyToken: (scene) => scene.company ?? null }));
vi.mock("../../module/apps/map-screen.js", async (importOriginal) => ({ rectOnScreen: (await importOriginal()).rectOnScreen, panelScreen: () => ({ left: 60, top: 40, right: 1620, bottom: 1000 }) }));
vi.mock("../../module/apps/ui.js", () => ({ viewport: () => ({ width: 1920, height: 1080 }) }));

const { clearOfToken, companyOnScreen, keepClearOfCompany } = await import("../../module/apps/clear-of-company.js");

const room = { left: 60, top: 40, right: 1620, bottom: 1000 };
const screen = { width: 1920, height: 1080 };
/** A Token's box on the screen, 100 across, at `left`. */
const token = (left, top = 500) => ({ left, top, right: left + 100, bottom: top + 100 });

describe("clearOfToken", () => {
	it("leaves a window that doesn't cover the Token where it opened", () => {
		expect(clearOfToken({ left: 700, top: 200, width: 800, height: 640 }, token(200), room, screen)).toBeNull();
		expect(clearOfToken({ left: 100, top: 700, width: 800, height: 300 }, token(200), room, screen)).toBeNull();
	});

	it("sets a window opened over the Token beside it, to whichever side moves it least", () => {
		// Opened centred over a Token left of the middle: its right has room.
		expect(clearOfToken({ left: 400, top: 200, width: 800, height: 640 }, token(500), room, screen)).toEqual({ left: 612 });
		// A Token right of the middle: its left.
		expect(clearOfToken({ left: 700, top: 200, width: 800, height: 640 }, token(1300), room, screen)).toEqual({ left: 488 });
	});

	it("keeps it short of the sidebar where it fits there, or else anywhere on the screen", () => {
		// Places for a Referee, 960 across, over a Token near the middle of a 1920 screen: only past the sidebar's edge.
		expect(clearOfToken({ left: 480, top: 220, width: 960, height: 640 }, token(800), room, screen)).toEqual({ left: 912 });
	});

	it("stays where it opened where it fits beside the Token nowhere", () => {
		expect(clearOfToken({ left: 100, top: 80, width: 1700, height: 900 }, token(900), room, screen)).toBeNull();
	});
});

describe("companyOnScreen", () => {
	beforeEach(() => {
		globalThis.game = { user: { isGM: false } };
		globalThis.canvas = {
			ready: true,
			scene: { realm: true, company: { hidden: false, object: { bounds: { x: 1000, y: 400, width: 100, height: 100 } } } },
			primary: { getGlobalPosition: () => ({ x: -200, y: 50 }) },
			stage: { scale: { x: 0.5 } }
		};
	});

	it("reads the Company's Token on the screen as the canvas is panned and zoomed", () => {
		expect(companyOnScreen()).toEqual({ left: 300, top: 250, right: 350, bottom: 300 });
	});

	it("is none off a Realm, with no Company, off the screen, or hidden from a player", () => {
		canvas.scene.company.hidden = true;
		expect(companyOnScreen()).toBeNull();
		game.user.isGM = true;
		expect(companyOnScreen()).not.toBeNull();
		canvas.scene.company.object.bounds.x = 5000;
		expect(companyOnScreen()).toBeNull();
		canvas.scene.company = null;
		expect(companyOnScreen()).toBeNull();
		canvas.scene = { realm: false };
		expect(companyOnScreen()).toBeNull();
	});

	it("moves a window just opened over the Token", () => {
		const app = { element: { getBoundingClientRect: () => ({ left: 0, top: 100, width: 400, height: 600 }) }, setPosition: vi.fn() };
		keepClearOfCompany(app);
		expect(app.setPosition).toHaveBeenCalledWith({ left: 362 });
	});
});
