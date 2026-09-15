import { describe, expect, it } from "vitest";
import {
	awaitsAttack,
	canStakeGlory,
	changeDuel,
	createDuel,
	opponentOf,
	readyToResolve,
	stakeChanges
} from "../../module/rules/duel.js";

const duelists = [{ uuid: "Actor.ada", name: "Ada", token: "Token.a" }, { uuid: "Actor.bram", name: "Bram", token: "Token.b" }];

describe("createDuel", () => {
	it("starts with neither Attack rolled", () => {
		expect(createDuel({ kind: "joust", stake: true, duelists })).toEqual({
			kind: "joust",
			stake: true,
			bloodless: false,
			duelists: [
				{ uuid: "Actor.ada", name: "Ada", token: "Token.a", attack: null },
				{ uuid: "Actor.bram", name: "Bram", token: "Token.b", attack: null }
			],
			exchanges: 0,
			victor: null,
			ended: false
		});
	});

	it("needs two different duelists, and falls back to a duel for an unknown kind", () => {
		expect(createDuel({ duelists: [duelists[0]] })).toBeNull();
		expect(createDuel({ duelists: [duelists[0], duelists[0]] })).toBeNull();
		expect(createDuel({ kind: "brawl", duelists }).kind).toBe("duel");
	});
});

describe("opponentOf", () => {
	it("finds the other duelist", () => {
		const duel = createDuel({ duelists });
		expect(opponentOf(duel, "Actor.ada").name).toBe("Bram");
		expect(opponentOf(duel, "Actor.cole")).toBeNull();
	});
});

describe("changeDuel", () => {
	it("waits for both Attacks, then resolves them together and begins the next exchange", () => {
		let duel = createDuel({ duelists });
		duel = changeDuel(duel, { type: "attack", actor: "Actor.ada", message: "m1" });
		expect(awaitsAttack(duel, "Actor.ada")).toBe(false);
		expect(awaitsAttack(duel, "Actor.bram")).toBe(true);
		expect(readyToResolve(duel)).toBe(false);
		expect(changeDuel(duel, { type: "resolved" })).toBeNull();

		duel = changeDuel(duel, { type: "attack", actor: "Actor.bram", message: "m2" });
		expect(readyToResolve(duel)).toBe(true);
		duel = changeDuel(duel, { type: "resolved" });
		expect(duel.exchanges).toBe(1);
		expect(duel.duelists.every((duelist) => duelist.attack === null)).toBe(true);
	});

	it("takes one Attack from each duelist per exchange, and none from anybody else", () => {
		const duel = changeDuel(createDuel({ duelists }), { type: "attack", actor: "Actor.ada", message: "m1" });
		expect(changeDuel(duel, { type: "attack", actor: "Actor.ada", message: "m3" })).toBeNull();
		expect(changeDuel(duel, { type: "attack", actor: "Actor.cole", message: "m3" })).toBeNull();
		expect(changeDuel(duel, { type: "attack", actor: "Actor.bram", message: "" })).toBeNull();
	});

	it("ends with a victor from the duel, or none, and then allows nothing more", () => {
		const duel = createDuel({ duelists });
		expect(changeDuel(duel, { type: "end", victor: "Actor.cole" })).toBeNull();
		const ended = changeDuel(duel, { type: "end", victor: "Actor.bram" });
		expect(ended).toMatchObject({ victor: "Actor.bram", ended: true });
		expect(changeDuel(duel, { type: "end" })).toMatchObject({ victor: null, ended: true });
		expect(changeDuel(ended, { type: "attack", actor: "Actor.ada", message: "m1" })).toBeNull();
		expect(changeDuel(ended, { type: "end", victor: null })).toBeNull();
	});

	it("ignores unknown changes", () => {
		expect(changeDuel(createDuel({ duelists }), { type: "surrender" })).toBeNull();
	});
});

describe("stakeChanges", () => {
	it("moves 1 Glory from the loser to the victor when Glory is staked", () => {
		const duel = createDuel({ stake: true, duelists });
		expect(stakeChanges(duel, "Actor.ada")).toEqual([{ uuid: "Actor.ada", amount: 1 }, { uuid: "Actor.bram", amount: -1 }]);
		expect(stakeChanges(duel, null)).toEqual([]);
		expect(stakeChanges(createDuel({ duelists }), "Actor.ada")).toEqual([]);
	});
});

describe("canStakeGlory", () => {
	it("lets only two Knights stake Glory", () => {
		expect(canStakeGlory([{ type: "knight" }, { type: "knight" }])).toBe(true);
		expect(canStakeGlory([{ type: "knight" }, { type: "npc" }])).toBe(false);
		expect(canStakeGlory([{ type: "knight" }, { type: "knight", isSquire: true }])).toBe(false);
	});
});
