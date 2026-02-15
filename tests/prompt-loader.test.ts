import { describe, it, expect, vi } from "vitest";
import {
	ensureDefaultPrompts,
	listPromptFiles,
	loadPromptFile,
	loadDeveloperPrompt,
	migratePromptFilename,
} from "../src/prompt-loader";
import {
	DEVELOPER_PROMPT_EN_FALLBACK,
	DEVELOPER_PROMPT_ZH_FALLBACK,
} from "../src/prompts";

interface MockAdapter {
	exists: ReturnType<typeof vi.fn>;
	read: ReturnType<typeof vi.fn>;
	write: ReturnType<typeof vi.fn>;
	mkdir: ReturnType<typeof vi.fn>;
	list: ReturnType<typeof vi.fn>;
}

/** Create an in-memory mock of app.vault.adapter for testing. */
function createMockApp(files: Record<string, string> = {}): {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	app: any;
	adapter: MockAdapter;
} {
	const fs = new Map(Object.entries(files));

	const adapter: MockAdapter = {
		exists: vi.fn(async (path: string) => fs.has(path)),
		read: vi.fn(async (path: string) => {
			const content = fs.get(path);
			if (content === undefined)
				throw new Error(`File not found: ${path}`);
			return content;
		}),
		write: vi.fn(async (path: string, content: string) => {
			fs.set(path, content);
		}),
		mkdir: vi.fn(async (path: string) => {
			fs.set(path, "__DIR__");
		}),
		list: vi.fn(async (folder: string) => {
			const matched: string[] = [];
			for (const key of fs.keys()) {
				if (
					key.startsWith(folder + "/") &&
					!key.includes("/", folder.length + 1) &&
					fs.get(key) !== "__DIR__"
				) {
					matched.push(key);
				}
			}
			return { files: matched, folders: [] };
		}),
	};

	return { app: { vault: { adapter } }, adapter };
}

const PLUGIN_DIR = ".obsidian/plugins/obsidian-coo";
const EN_DIR = `${PLUGIN_DIR}/prompts/en`;
const ZH_DIR = `${PLUGIN_DIR}/prompts/zh`;

describe("ensureDefaultPrompts", () => {
	it("creates language folders and default files when they do not exist", async () => {
		const { app, adapter } = createMockApp();

		await ensureDefaultPrompts(app, PLUGIN_DIR);

		expect(adapter.mkdir).toHaveBeenCalledWith(`${PLUGIN_DIR}/prompts`);
		expect(adapter.mkdir).toHaveBeenCalledWith(EN_DIR);
		expect(adapter.mkdir).toHaveBeenCalledWith(ZH_DIR);
		expect(adapter.write).toHaveBeenCalledTimes(2);
		expect(adapter.write).toHaveBeenCalledWith(
			`${EN_DIR}/developer.md`,
			expect.stringContaining("knowledgeable assistant"),
		);
		expect(adapter.write).toHaveBeenCalledWith(
			`${ZH_DIR}/developer.md`,
			expect.stringContaining("简体中文"),
		);
	});

	it("does not overwrite existing files", async () => {
		const { app, adapter } = createMockApp({
			[`${PLUGIN_DIR}/prompts`]: "__DIR__",
			[EN_DIR]: "__DIR__",
			[`${EN_DIR}/developer.md`]: "My custom prompt",
		});

		await ensureDefaultPrompts(app, PLUGIN_DIR);

		// Should only write the missing zh file
		expect(adapter.write).toHaveBeenCalledTimes(1);
		expect(adapter.write).toHaveBeenCalledWith(
			`${ZH_DIR}/developer.md`,
			expect.any(String),
		);
	});

	it("does nothing when all defaults exist", async () => {
		const { app, adapter } = createMockApp({
			[`${PLUGIN_DIR}/prompts`]: "__DIR__",
			[EN_DIR]: "__DIR__",
			[ZH_DIR]: "__DIR__",
			[`${EN_DIR}/developer.md`]: "custom en",
			[`${ZH_DIR}/developer.md`]: "custom zh",
		});

		await ensureDefaultPrompts(app, PLUGIN_DIR);

		expect(adapter.write).not.toHaveBeenCalled();
	});
});

describe("listPromptFiles", () => {
	it("returns sorted .md filenames for the given language", async () => {
		const { app } = createMockApp({
			[EN_DIR]: "__DIR__",
			[`${EN_DIR}/developer.md`]: "content",
			[`${EN_DIR}/custom.md`]: "content",
		});

		const files = await listPromptFiles(app, PLUGIN_DIR, "en");

		expect(files).toEqual(["custom.md", "developer.md"]);
	});

	it("returns files for zh folder independently", async () => {
		const { app } = createMockApp({
			[ZH_DIR]: "__DIR__",
			[`${ZH_DIR}/developer.md`]: "content",
		});

		const files = await listPromptFiles(app, PLUGIN_DIR, "zh");

		expect(files).toEqual(["developer.md"]);
	});

	it("returns empty array when language folder does not exist", async () => {
		const { app } = createMockApp();

		const files = await listPromptFiles(app, PLUGIN_DIR, "en");

		expect(files).toEqual([]);
	});

	it("filters out non-.md files", async () => {
		const { app } = createMockApp({
			[EN_DIR]: "__DIR__",
			[`${EN_DIR}/prompt.md`]: "content",
			[`${EN_DIR}/notes.txt`]: "content",
		});

		const files = await listPromptFiles(app, PLUGIN_DIR, "en");

		expect(files).toEqual(["prompt.md"]);
	});
});

describe("loadPromptFile", () => {
	it("returns trimmed content for existing file", async () => {
		const { app } = createMockApp({
			[`${EN_DIR}/test.md`]: "  Hello world  \n",
		});

		const content = await loadPromptFile(app, PLUGIN_DIR, "en", "test.md");

		expect(content).toBe("Hello world");
	});

	it("returns null for missing file", async () => {
		const { app } = createMockApp();

		const content = await loadPromptFile(
			app,
			PLUGIN_DIR,
			"en",
			"missing.md",
		);

		expect(content).toBeNull();
	});

	it("returns null for empty file", async () => {
		const { app } = createMockApp({
			[`${EN_DIR}/empty.md`]: "   \n  ",
		});

		const content = await loadPromptFile(app, PLUGIN_DIR, "en", "empty.md");

		expect(content).toBeNull();
	});
});

describe("loadDeveloperPrompt", () => {
	it("returns file content when file exists", async () => {
		const { app } = createMockApp({
			[`${EN_DIR}/custom.md`]: "Custom prompt content",
		});

		const result = await loadDeveloperPrompt(
			app,
			PLUGIN_DIR,
			"en",
			"custom.md",
		);

		expect(result.content).toBe("Custom prompt content");
		expect(result.usedFallback).toBe(false);
	});

	it("falls back to EN hardcoded prompt when en file is missing", async () => {
		const { app } = createMockApp();

		const result = await loadDeveloperPrompt(
			app,
			PLUGIN_DIR,
			"en",
			"missing.md",
		);

		expect(result.content).toBe(DEVELOPER_PROMPT_EN_FALLBACK);
		expect(result.usedFallback).toBe(true);
	});

	it("falls back to ZH hardcoded prompt when zh file is missing", async () => {
		const { app } = createMockApp();

		const result = await loadDeveloperPrompt(
			app,
			PLUGIN_DIR,
			"zh",
			"missing.md",
		);

		expect(result.content).toBe(DEVELOPER_PROMPT_ZH_FALLBACK);
		expect(result.usedFallback).toBe(true);
	});

	it("falls back when file is empty", async () => {
		const { app } = createMockApp({
			[`${EN_DIR}/empty.md`]: "  \n  ",
		});

		const result = await loadDeveloperPrompt(
			app,
			PLUGIN_DIR,
			"en",
			"empty.md",
		);

		expect(result.content).toBe(DEVELOPER_PROMPT_EN_FALLBACK);
		expect(result.usedFallback).toBe(true);
	});
});

describe("migratePromptFilename", () => {
	it("strips .en from old-style English filename", () => {
		expect(migratePromptFilename("developer.en.md")).toBe("developer.md");
	});

	it("strips .zh from old-style Chinese filename", () => {
		expect(migratePromptFilename("developer.zh.md")).toBe("developer.md");
	});

	it("leaves new-style filename unchanged", () => {
		expect(migratePromptFilename("developer.md")).toBe("developer.md");
	});

	it("leaves custom filenames unchanged", () => {
		expect(migratePromptFilename("my-prompt.md")).toBe("my-prompt.md");
	});

	it("only strips .en/.zh at the end before .md", () => {
		expect(migratePromptFilename("english.notes.md")).toBe(
			"english.notes.md",
		);
	});
});
