import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/**/*.test.js"],
		// The default forks pool crashes on Node 24 under Windows.
		pool: "threads"
	}
});
