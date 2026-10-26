import { describe, expect, it } from "vitest";
import { keyedSerialWrites, serialWrites } from "../../module/rules/queue.js";

/** A write that finishes when it's told to, noting when it ran. */
function deferred(log, name) {
	let release;
	const started = [];
	const gate = new Promise((resolve) => { release = resolve; });
	return {
		write: () => { log.push(`${name}:start`); started.push(1); return gate.then(() => log.push(`${name}:end`)); },
		release
	};
}

describe("serialWrites", () => {
	it("runs each write only once the one before it has finished", async () => {
		const log = [];
		const queue = serialWrites();
		const first = deferred(log, "a");
		const second = deferred(log, "b");

		const running = [queue(first.write), queue(second.write)];
		// The second hasn't begun while the first is still going.
		await Promise.resolve();
		expect(log).toEqual(["a:start"]);

		first.release();
		second.release();
		await Promise.all(running);
		expect(log).toEqual(["a:start", "a:end", "b:start", "b:end"]);
	});

	it("lets a write that throws through to its caller, and keeps going", async () => {
		const queue = serialWrites();
		const failed = queue(async () => { throw new Error("no"); });
		await expect(failed).rejects.toThrow("no");
		await expect(queue(async () => "after")).resolves.toBe("after");
	});

	it("gives back what the write returned", async () => {
		const queue = serialWrites();
		await expect(queue(async () => 7)).resolves.toBe(7);
	});

	it("settles once everything put in so far has finished, failed or not", async () => {
		const queue = serialWrites();
		const log = [];
		queue(async () => { log.push("one"); });
		queue(async () => { throw new Error("no"); }).catch(() => {});
		queue(async () => { log.push("two"); });

		await expect(queue.settled()).resolves.toBeUndefined();
		expect(log).toEqual(["one", "two"]);
	});

	it("settles straight away on a queue nothing has been put in", async () => {
		await expect(serialWrites().settled()).resolves.toBeUndefined();
	});

	it("keeps separate queues apart", async () => {
		const log = [];
		const [one, two] = [serialWrites(), serialWrites()];
		const held = deferred(log, "held");
		const other = one(held.write);
		await two(async () => log.push("free"));
		// The second queue ran without waiting on the first.
		expect(log).toEqual(["held:start", "free"]);
		held.release();
		await other;
	});
});

describe("keyedSerialWrites", () => {
	it("gives each key one queue of its own", async () => {
		const queueFor = keyedSerialWrites();
		expect(queueFor("a")).toBe(queueFor("a"));
		expect(queueFor("a")).not.toBe(queueFor("b"));
		const log = [];
		const held = deferred(log, "held");
		const first = queueFor("a")(held.write);
		await queueFor("b")(async () => log.push("other key"));
		const second = queueFor("a")(async () => log.push("same key"));
		expect(log).toEqual(["held:start", "other key"]);
		held.release();
		await Promise.all([first, second]);
		expect(log.at(-1)).toBe("same key");
	});
});
