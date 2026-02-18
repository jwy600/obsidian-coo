import { describe, it, expect, vi } from "vitest";
import {
	migratePromptFolders,
	ensureDefaultPrompts,
	listPromptFiles,
	loadPromptFile,
	loadDeveloperPrompt,
	migratePromptFilename,
} from "../src/prompt-loader";
import { DEVELOPER_PROMPT_FALLBACK } from "../src/prompts";

interface MockAdapter {
	exists: ReturnType<typeof vi.fn>;
	read: ReturnType<typeof vi.fn>;
	write: ReturnType<typeof vi.fn>;
	mkdir: ReturnType<typeof vi.fn>;
	list: ReturnType<typeof vi.fn>;
	remove: ReturnType<typeof vi.fn>;
	rmdir: ReturnType<typeof vi.fn>;
}

/** Create an in-memory mock of app.vault.adapter for testing. */
function createMockApp(files: Record<string, string> = {}): {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	app: any;
	adapter: MockAdapter;
	fs: Map<string, string>;
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
			const matchedFiles: string[] = [];
			const matchedFolders: string[] = [];
			for (const key of fs.keys()) {
				if (
					key.startsWith(folder + "/") &&
					!key.includes("/", folder.length + 1)
				) {
					if (fs.get(key) === "__DIR__") {
						matchedFolders.push(key);
					} else {
						matchedFiles.push(key);
					}
				}
			}
			return { files: matchedFiles, folders: matchedFolders };
		}),
		remove: vi.fn(async (path: string) => {
			fs.delete(path);
		}),
		rmdir: vi.fn(async (path: string) => {
			fs.delete(path);
		}),
	};

	return { app: { vault: { adapter } }, adapter, fs };
}

const PLUGIN_DIR = ".obsidian/plugins/obsidian-coo";
const PROMPTS_DIR = `${PLUGIN_DIR}/prompts`;

describe("migratePromptFolders", () => {
	it("moves files from en/ and zh/ into flat prompts/ and renames developer.md", async () => {
		const { app, fs } = createMockApp({
			[`${PROMPTS_DIR}`]: "__DIR__",
			[`${PROMPTS_DIR}/en`]: "__DIR__",
			[`${PROMPTS_DIR}/zh`]: "__DIR__",
			[`${PROMPTS_DIR}/en/developer.md`]: "EN content",
			[`${PROMPTS_DIR}/zh/developer.md`]: "ZH content",
		});

		await migratePromptFolders(app, PLUGIN_DIR);

		// developer.md is first moved to flat, then renamed to knowledgeassistant.md
		expect(fs.has(`${PROMPTS_DIR}/knowledgeassistant.md`)).toBe(true);
		// Old files should be removed
		expect(fs.has(`${PROMPTS_DIR}/en/developer.md`)).toBe(false);
		expect(fs.has(`${PROMPTS_DIR}/zh/developer.md`)).toBe(false);
	});

	it("renames developer.md to knowledgeassistant.md", async () => {
		const { app, fs } = createMockApp({
			[`${PROMPTS_DIR}`]: "__DIR__",
			[`${PROMPTS_DIR}/developer.md`]: "Old content",
		});

		await migratePromptFolders(app, PLUGIN_DIR);

		expect(fs.has(`${PROMPTS_DIR}/knowledgeassistant.md`)).toBe(true);
		expect(fs.has(`${PROMPTS_DIR}/developer.md`)).toBe(false);
	});

	it("does not overwrite existing knowledgeassistant.md", async () => {
		const { app, fs } = createMockApp({
			[`${PROMPTS_DIR}`]: "__DIR__",
			[`${PROMPTS_DIR}/developer.md`]: "Old content",
			[`${PROMPTS_DIR}/knowledgeassistant.md`]: "User's custom prompt",
		});

		await migratePromptFolders(app, PLUGIN_DIR);

		expect(fs.get(`${PROMPTS_DIR}/knowledgeassistant.md`)).toBe(
			"User's custom prompt",
		);
	});

	it("does nothing when language folders don't exist", async () => {
		const { app, adapter } = createMockApp({
			[`${PROMPTS_DIR}`]: "__DIR__",
		});

		await migratePromptFolders(app, PLUGIN_DIR);

		expect(adapter.remove).not.toHaveBeenCalled();
	});

	it("skips moving if target file already exists in flat folder", async () => {
		const { app, fs } = createMockApp({
			[`${PROMPTS_DIR}`]: "__DIR__",
			[`${PROMPTS_DIR}/en`]: "__DIR__",
			[`${PROMPTS_DIR}/en/custom.md`]: "EN custom",
			[`${PROMPTS_DIR}/custom.md`]: "Existing flat custom",
		});

		await migratePromptFolders(app, PLUGIN_DIR);

		// Flat file is preserved, not overwritten
		expect(fs.get(`${PROMPTS_DIR}/custom.md`)).toBe("Existing flat custom");
	});
});

describe("ensureDefaultPrompts", () => {
	it("creates prompts/ folder and default files when they do not exist", async () => {
		const { app, adapter } = createMockApp();

		await ensureDefaultPrompts(app, PLUGIN_DIR);

		expect(adapter.mkdir).toHaveBeenCalledWith(PROMPTS_DIR);
		expect(adapter.write).toHaveBeenCalledTimes(2);
		expect(adapter.write).toHaveBeenCalledWith(
			`${PROMPTS_DIR}/knowledgeassistant.md`,
			expect.stringContaining("knowledgeable assistant"),
		);
		expect(adapter.write).toHaveBeenCalledWith(
			`${PROMPTS_DIR}/atomic.md`,
			expect.stringContaining("atomic"),
		);
	});

	it("does not overwrite existing files", async () => {
		const { app, adapter } = createMockApp({
			[PROMPTS_DIR]: "__DIR__",
			[`${PROMPTS_DIR}/knowledgeassistant.md`]: "My custom prompt",
		});

		await ensureDefaultPrompts(app, PLUGIN_DIR);

		// Should only write the missing atomic.md
		expect(adapter.write).toHaveBeenCalledTimes(1);
		expect(adapter.write).toHaveBeenCalledWith(
			`${PROMPTS_DIR}/atomic.md`,
			expect.any(String),
		);
	});

	it("does nothing when all defaults exist", async () => {
		const { app, adapter } = createMockApp({
			[PROMPTS_DIR]: "__DIR__",
			[`${PROMPTS_DIR}/knowledgeassistant.md`]: "custom",
			[`${PROMPTS_DIR}/atomic.md`]: "custom",
		});

		await ensureDefaultPrompts(app, PLUGIN_DIR);

		expect(adapter.write).not.toHaveBeenCalled();
	});
});

describe("listPromptFiles", () => {
	it("returns sorted .md filenames from flat prompts/", async () => {
		const { app } = createMockApp({
			[PROMPTS_DIR]: "__DIR__",
			[`${PROMPTS_DIR}/knowledgeassistant.md`]: "content",
			[`${PROMPTS_DIR}/atomic.md`]: "content",
			[`${PROMPTS_DIR}/custom.md`]: "content",
		});

		const files = await listPromptFiles(app, PLUGIN_DIR);

		expect(files).toEqual([
			"atomic.md",
			"custom.md",
			"knowledgeassistant.md",
		]);
	});

	it("returns empty array when prompts folder does not exist", async () => {
		const { app } = createMockApp();

		const files = await listPromptFiles(app, PLUGIN_DIR);

		expect(files).toEqual([]);
	});

	it("filters out non-.md files", async () => {
		const { app } = createMockApp({
			[PROMPTS_DIR]: "__DIR__",
			[`${PROMPTS_DIR}/prompt.md`]: "content",
			[`${PROMPTS_DIR}/notes.txt`]: "content",
		});

		const files = await listPromptFiles(app, PLUGIN_DIR);

		expect(files).toEqual(["prompt.md"]);
	});
});

describe("loadPromptFile", () => {
	it("returns trimmed content for existing file", async () => {
		const { app } = createMockApp({
			[`${PROMPTS_DIR}/test.md`]: "  Hello world  \n",
		});

		const content = await loadPromptFile(app, PLUGIN_DIR, "test.md");

		expect(content).toBe("Hello world");
	});

	it("returns null for missing file", async () => {
		const { app } = createMockApp();

		const content = await loadPromptFile(app, PLUGIN_DIR, "missing.md");

		expect(content).toBeNull();
	});

	it("returns null for empty file", async () => {
		const { app } = createMockApp({
			[`${PROMPTS_DIR}/empty.md`]: "   \n  ",
		});

		const content = await loadPromptFile(app, PLUGIN_DIR, "empty.md");

		expect(content).toBeNull();
	});
});

describe("loadDeveloperPrompt", () => {
	it("returns file content with language tag replaced", async () => {
		const { app } = createMockApp({
			[`${PROMPTS_DIR}/custom.md`]:
				"Custom prompt.\n<language></language>\nMore text.",
		});

		const result = await loadDeveloperPrompt(
			app,
			PLUGIN_DIR,
			"zh",
			"custom.md",
		);

		expect(result.content).toContain(
			"Always respond in Simplified Chinese.",
		);
		expect(result.usedFallback).toBe(false);
	});

	it("removes language tag for English", async () => {
		const { app } = createMockApp({
			[`${PROMPTS_DIR}/custom.md`]:
				"Custom prompt.\n<language></language>\nMore text.",
		});

		const result = await loadDeveloperPrompt(
			app,
			PLUGIN_DIR,
			"en",
			"custom.md",
		);

		expect(result.content).not.toContain("<language>");
		expect(result.usedFallback).toBe(false);
	});

	it("falls back to hardcoded prompt when file is missing", async () => {
		const { app } = createMockApp();

		const result = await loadDeveloperPrompt(
			app,
			PLUGIN_DIR,
			"en",
			"missing.md",
		);

		// English: language tag removed from fallback
		expect(result.content).toContain("knowledgeable assistant");
		expect(result.content).not.toContain("<language></language>");
		expect(result.usedFallback).toBe(true);
	});

	it("falls back with language directive for zh", async () => {
		const { app } = createMockApp();

		const result = await loadDeveloperPrompt(
			app,
			PLUGIN_DIR,
			"zh",
			"missing.md",
		);

		expect(result.content).toContain(
			"Always respond in Simplified Chinese.",
		);
		expect(result.usedFallback).toBe(true);
	});

	it("falls back when file is empty", async () => {
		const { app } = createMockApp({
			[`${PROMPTS_DIR}/empty.md`]: "  \n  ",
		});

		const result = await loadDeveloperPrompt(
			app,
			PLUGIN_DIR,
			"en",
			"empty.md",
		);

		expect(result.content).toBe(
			DEVELOPER_PROMPT_FALLBACK.replace(
				/\n?<language><\/language>\n?/,
				"\n",
			),
		);
		expect(result.usedFallback).toBe(true);
	});
});

describe("migratePromptFilename", () => {
	it('migrates "developer.md" to "knowledgeassistant.md"', () => {
		expect(migratePromptFilename("developer.md")).toBe(
			"knowledgeassistant.md",
		);
	});

	it('migrates "developer.en.md" to "knowledgeassistant.md"', () => {
		expect(migratePromptFilename("developer.en.md")).toBe(
			"knowledgeassistant.md",
		);
	});

	it('migrates "developer.zh.md" to "knowledgeassistant.md"', () => {
		expect(migratePromptFilename("developer.zh.md")).toBe(
			"knowledgeassistant.md",
		);
	});

	it("leaves custom filenames unchanged", () => {
		expect(migratePromptFilename("my-prompt.md")).toBe("my-prompt.md");
	});

	it("leaves knowledgeassistant.md unchanged", () => {
		expect(migratePromptFilename("knowledgeassistant.md")).toBe(
			"knowledgeassistant.md",
		);
	});

	it("leaves atomic.md unchanged", () => {
		expect(migratePromptFilename("atomic.md")).toBe("atomic.md");
	});
});
