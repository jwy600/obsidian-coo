import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import { getChainHead, setChainHead, clearChain } from "../src/chain";

const CHAIN_PATH = "/plugin/chain-data.json";

function makeApp(files: Record<string, string> = {}) {
	const store: Record<string, string> = { ...files };
	const adapter = {
		exists: vi.fn(async (p: string) => p in store),
		read: vi.fn(async (p: string) => store[p] ?? ""),
		write: vi.fn(async (p: string, c: string) => {
			store[p] = c;
		}),
	};
	const app = { vault: { adapter } } as unknown as App;
	return { app, store, adapter };
}

describe("chain storage", () => {
	const dir = "/plugin";

	it("returns undefined when no chain file exists", async () => {
		const { app } = makeApp({});
		expect(await getChainHead(app, dir, "note.md")).toBeUndefined();
	});

	it("stores and retrieves a chain head", async () => {
		const { app } = makeApp({});
		await setChainHead(app, dir, "note.md", "resp_1");
		expect(await getChainHead(app, dir, "note.md")).toBe("resp_1");
	});

	it("advances the chain head on subsequent sets", async () => {
		const { app } = makeApp({});
		await setChainHead(app, dir, "note.md", "resp_1");
		await setChainHead(app, dir, "note.md", "resp_2");
		expect(await getChainHead(app, dir, "note.md")).toBe("resp_2");
	});

	it("clears the chain head", async () => {
		const { app } = makeApp({});
		await setChainHead(app, dir, "note.md", "resp_1");
		await clearChain(app, dir, "note.md");
		expect(await getChainHead(app, dir, "note.md")).toBeUndefined();
	});

	it("keeps chains separate per note path", async () => {
		const { app } = makeApp({});
		await setChainHead(app, dir, "a.md", "resp_a");
		await setChainHead(app, dir, "b.md", "resp_b");
		expect(await getChainHead(app, dir, "a.md")).toBe("resp_a");
		expect(await getChainHead(app, dir, "b.md")).toBe("resp_b");
	});

	it("preserves other notes when clearing one", async () => {
		const { app } = makeApp({});
		await setChainHead(app, dir, "a.md", "resp_a");
		await setChainHead(app, dir, "b.md", "resp_b");
		await clearChain(app, dir, "a.md");
		expect(await getChainHead(app, dir, "a.md")).toBeUndefined();
		expect(await getChainHead(app, dir, "b.md")).toBe("resp_b");
	});

	it("writes a valid JSON map keyed by note path", async () => {
		const { app, store } = makeApp({});
		await setChainHead(app, dir, "note.md", "resp_1");
		const parsed = JSON.parse(store[CHAIN_PATH] ?? "{}") as Record<string, string>;
		expect(parsed["note.md"]).toBe("resp_1");
	});

	it("recovers from a corrupt chain file", async () => {
		const { app } = makeApp({ [CHAIN_PATH]: "not json" });
		expect(await getChainHead(app, dir, "note.md")).toBeUndefined();
	});

	it("ignores a non-object chain file", async () => {
		const { app } = makeApp({ [CHAIN_PATH]: "[1, 2, 3]" });
		expect(await getChainHead(app, dir, "note.md")).toBeUndefined();
	});
});
