import { describe, it, expect } from "vitest";
import {
	buildActionPrompt,
	getBlockActionPrompt,
	DEVELOPER_PROMPT_EN_FALLBACK,
	DEVELOPER_PROMPT_ZH_FALLBACK,
} from "../src/prompts";

describe("developer prompt fallback constants", () => {
	it("EN fallback contains expected content", () => {
		expect(DEVELOPER_PROMPT_EN_FALLBACK).toContain(
			"knowledgeable assistant",
		);
		expect(DEVELOPER_PROMPT_EN_FALLBACK).not.toContain("简体中文");
	});

	it("ZH fallback contains expected content", () => {
		expect(DEVELOPER_PROMPT_ZH_FALLBACK).toContain("简体中文");
		expect(DEVELOPER_PROMPT_ZH_FALLBACK).toContain(
			"knowledgeable assistant",
		);
	});
});

describe("getBlockActionPrompt", () => {
	it('returns English prompt for "en"', () => {
		const result = getBlockActionPrompt("en");
		expect(result).toContain("plain text only");
		expect(result).not.toContain("简体中文");
	});

	it('returns Chinese prompt for "zh"', () => {
		const result = getBlockActionPrompt("zh");
		expect(result).toContain("简体中文");
	});
});

describe("buildActionPrompt", () => {
	const sampleText = "  The quick brown fox  ";

	it("translate uses default language (Chinese)", () => {
		const result = buildActionPrompt("translate", sampleText);
		expect(result).toBe("Translate into Chinese:\n\nThe quick brown fox");
	});

	it("translate uses specified language", () => {
		const result = buildActionPrompt(
			"translate",
			sampleText,
			undefined,
			"Spanish",
		);
		expect(result).toBe("Translate into Spanish:\n\nThe quick brown fox");
	});

	it("example action", () => {
		const result = buildActionPrompt("example", sampleText);
		expect(result).toBe(
			"Give one concrete example of this:\n\nThe quick brown fox",
		);
	});

	it("expand action", () => {
		const result = buildActionPrompt("expand", sampleText);
		expect(result).toBe(
			"Expand on this with more detail:\n\nThe quick brown fox",
		);
	});

	it("eli5 action", () => {
		const result = buildActionPrompt("eli5", sampleText);
		expect(result).toBe(
			"Explain this like I'm five:\n\nThe quick brown fox",
		);
	});

	it("ask action with question", () => {
		const result = buildActionPrompt(
			"ask",
			sampleText,
			"  What does this mean?  ",
		);
		expect(result).toBe(
			'Text: "The quick brown fox"\n\nQuestion: What does this mean?',
		);
	});

	it("ask action without question falls back to empty", () => {
		const result = buildActionPrompt("ask", sampleText);
		expect(result).toBe('Text: "The quick brown fox"\n\nQuestion: ');
	});

	it("rewrite action incorporates phrases", () => {
		const result = buildActionPrompt(
			"rewrite",
			sampleText,
			"concept A, concept B",
		);
		expect(result).toContain(
			"Phrases to incorporate: concept A, concept B",
		);
		expect(result).toContain("Text: The quick brown fox");
	});

	it("rewrite action without prompt uses empty string", () => {
		const result = buildActionPrompt("rewrite", sampleText);
		expect(result).toContain("Phrases to incorporate: .");
	});

	it("trims block text", () => {
		const result = buildActionPrompt("example", "  \n  hello  \n  ");
		expect(result).toBe("Give one concrete example of this:\n\nhello");
	});
});
