import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

/** The calendar now, and the hexes the world keeps as come into this Phase. */
let calendar;
let said;

vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({ ...calendar }) }));
vi.mock("../../module/actions/journey.js", () => ({ movesAsCompany: (token) => Boolean(token.company) }));
vi.mock("../../module/actions/realm.js", () => ({ isRealmScene: (scene) => Boolean(scene?.realm) }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));

const { PACE_COLOURS, WAYPOINT_LABEL_TEMPLATE, realmTokenRuler, registerRealmTokenRuler, rulerPace } = await import("../../module/canvas/realm-token-ruler.js");

const realm = { realm: true, grid: { distance: 1 } };
const company = { parent: realm, company: true };

/** Foundry's ruler, as far as the Realm's asks it anything. */
class CoreRuler {
	static WAYPOINT_LABEL_TEMPLATE = "templates/hud/waypoint-label.hbs";
	constructor(token) {
		this.token = token;
	}
	_getWaypointLabelContext() {
		return { distance: { total: "2" } };
	}
	_getGridHighlightStyle() {
		return { color: 0xffffff, alpha: 0.5 };
	}
}

const RealmRuler = realmTokenRuler(CoreRuler);
/** A waypoint dragged so far, the last unless another follows. */
const waypoint = (distance, next = null) => ({ measurement: { distance }, next });

beforeEach(() => {
	calendar = { age: 1, year: 1, season: "spring", day: 1, phase: "morning" };
	said = null;
	globalThis.game = { settings: { get: (scope, key) => (scope === SYSTEM_ID && key === "companyPace" ? said : null) } };
});

describe("rulerPace", () => {
	it("calls one hex a Trek, two a Gallop, three a Cruise and more too far (p18)", () => {
		expect([1, 2, 3, 4].map((hexes) => rulerPace(company, hexes).key)).toEqual(["trek", "gallop", "cruise", "beyond"]);
		expect(rulerPace(company, 2).label).toBe("realm.ruler.gallop");
	});

	it("counts the hexes already come into this Phase, and not another Phase's", () => {
		said = { when: { ...calendar }, count: 1 };
		expect(rulerPace(company, 1).key).toBe("gallop");
		said = { when: { ...calendar, phase: "night", day: 0 }, count: 2 };
		expect(rulerPace(company, 1).key).toBe("trek");
	});

	it("tells nothing of a Token that isn't the Company, off a Realm, or still in its hex", () => {
		expect(rulerPace({ parent: realm }, 1)).toBeNull();
		expect(rulerPace({ parent: {}, company: true }, 1)).toBeNull();
		expect(rulerPace(company, 0)).toBeNull();
		expect(rulerPace(undefined, 1)).toBeNull();
	});
});

describe("the Realm's Token ruler", () => {
	it("tells the pace where the drag ends, and only there", () => {
		const ruler = new RealmRuler({ document: company });
		expect(ruler._getWaypointLabelContext(waypoint(2), {})).toEqual({ distance: { total: "2" }, pace: { key: "gallop", label: "realm.ruler.gallop", ink: "#9a6a20" } });
		expect(ruler._getWaypointLabelContext(waypoint(1, {}), {})).toEqual({ distance: { total: "2" } });
		expect(new RealmRuler({ document: { parent: realm } })._getWaypointLabelContext(waypoint(2), {})).toEqual({ distance: { total: "2" } });
	});

	it("draws the Company's path in the ink of its pace", () => {
		const ruler = new RealmRuler({ document: company });
		expect(ruler._getGridHighlightStyle(waypoint(3), {})).toEqual({ color: PACE_COLOURS.cruise, alpha: 0.5 });
		expect(new RealmRuler({ document: { parent: realm } })._getGridHighlightStyle(waypoint(3), {})).toEqual({ color: 0xffffff, alpha: 0.5 });
	});

	it("is Foundry's ruler with the system's label, put in place at init", () => {
		expect(RealmRuler.WAYPOINT_LABEL_TEMPLATE).toBe(WAYPOINT_LABEL_TEMPLATE);
		globalThis.CONFIG = { Token: { rulerClass: CoreRuler } };
		registerRealmTokenRuler();
		expect(Object.getPrototypeOf(CONFIG.Token.rulerClass)).toBe(CoreRuler);
		delete globalThis.CONFIG;
	});

	it("keeps core's label whole, with the pace as a pill beside the distance", () => {
		const template = readFileSync(join(import.meta.dirname, "../..", "templates/hud/waypoint-label.hbs"), "utf8");
		for (const part of ["{{distance.total}} {{units}}", "{{cost.total}} {{cost.units}}", "{{elevation.total}}", "fa-eye-slash"]) expect(template).toContain(part);
		expect(template).toContain('class="bastionland-pill bastionland-ruler-pace" data-pace="{{pace.key}}" style="--pace-ink: {{pace.ink}}">{{pace.label}}');
	});
});
