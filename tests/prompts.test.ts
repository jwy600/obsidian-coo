import { describe, it, expect } from "vitest";
import {
	buildActionPrompt,
	replaceLanguageTag,
	prependLanguageDirective,
	getBlockActionSystemPrompt,
	getTranslateSystemPrompt,
	DEVELOPER_PROMPT_FALLBACK,
} from "../src/prompts";

describe("DEVELOPER_PROMPT_FALLBACK", () => {
	it("contains the language tag placeholder", () => {
		expect(DEVELOPER_PROMPT_FALLBACK).toContain("<language></language>");
	});

	it("contains expected content", () => {
		expect(DEVELOPER_PROMPT_FALLBACK).toContain("knowledgeable assistant");
	});
});

describe("replaceLanguageTag", () => {
	const template = "Hello.\n<language></language>\nWorld.";

	it("removes the tag entirely for English", () => {
		const result = replaceLanguageTag(template, "en");
		expect(result).not.toContain("<language>");
		expect(result).not.toContain("</language>");
		expect(result).toContain("Hello.");
		expect(result).toContain("World.");
	});

	it("fills the tag for Chinese", () => {
		const result = replaceLanguageTag(template, "zh");
		expect(result).toContain("Always respond in Simplified Chinese.");
		expect(result).toContain("<language>");
	});

	it("fills the tag for Japanese", () => {
		const result = replaceLanguageTag(template, "ja");
		expect(result).toContain("Always respond in Japanese.");
	});

	it("fills the tag for Spanish", () => {
		const result = replaceLanguageTag(template, "es");
		expect(result).toContain("Always respond in Spanish.");
	});

	it("fills the tag for French", () => {
		const result = replaceLanguageTag(template, "fr");
		expect(result).toContain("Always respond in French.");
	});
});

describe("prependLanguageDirective", () => {
	const prompt = "Some system prompt.";

	it("returns prompt unchanged for English", () => {
		expect(prependLanguageDirective(prompt, "en")).toBe(prompt);
	});

	it("prepends directive for Chinese", () => {
		const result = prependLanguageDirective(prompt, "zh");
		expect(result).toBe(
			"Always respond in Simplified Chinese.\n\nSome system prompt.",
		);
	});

	it("prepends directive for Japanese", () => {
		const result = prependLanguageDirective(prompt, "ja");
		expect(result).toMatch(/^Always respond in Japanese\./);
		expect(result).toContain(prompt);
	});
});

describe("getBlockActionSystemPrompt", () => {
	it("returns the block action prompt without directive for English", () => {
		const result = getBlockActionSystemPrompt("en");
		expect(result).toContain("plain text only");
		expect(result).not.toContain("Always respond in");
	});

	it("prepends language directive for Chinese", () => {
		const result = getBlockActionSystemPrompt("zh");
		expect(result).toContain("Always respond in Simplified Chinese.");
		expect(result).toContain("plain text only");
	});

	it("prepends language directive for Japanese", () => {
		const result = getBlockActionSystemPrompt("ja");
		expect(result).toContain("Always respond in Japanese.");
		expect(result).toContain("plain text only");
	});

	it("prepends language directive for Spanish", () => {
		const result = getBlockActionSystemPrompt("es");
		expect(result).toContain("Always respond in Spanish.");
	});

	it("prepends language directive for French", () => {
		const result = getBlockActionSystemPrompt("fr");
		expect(result).toContain("Always respond in French.");
	});
});

describe("getTranslateSystemPrompt", () => {
	it("includes translate language name for Chinese", () => {
		const result = getTranslateSystemPrompt("Chinese");
		expect(result).toContain("Always respond in Chinese.");
		expect(result).toContain("plain text only");
	});

	it("includes translate language name for English", () => {
		const result = getTranslateSystemPrompt("English");
		expect(result).toContain("Always respond in English.");
	});

	it("includes translate language name for Japanese", () => {
		const result = getTranslateSystemPrompt("Japanese");
		expect(result).toContain("Always respond in Japanese.");
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

	it("inspire action with instruction includes bullet formatting", () => {
		const result = buildActionPrompt(
			"inspire",
			sampleText,
			"  explain from bayesian perspective  ",
		);
		expect(result).toContain('Text: "The quick brown fox"');
		expect(result).toContain(
			"Instruction: explain from bayesian perspective",
		);
		expect(result).toContain(
			"Provide 2-5 related insights as bullet points",
		);
	});

	it("inspire action without instruction uses empty string", () => {
		const result = buildActionPrompt("inspire", sampleText);
		expect(result).toContain("Instruction: ");
		expect(result).toContain("bullet points");
	});

	it("inspire action includes document context when provided", () => {
		const result = buildActionPrompt(
			"inspire",
			sampleText,
			"explain this",
			undefined,
			"## My Section\nSome surrounding text",
		);
		expect(result).toContain("Document context:");
		expect(result).toContain("## My Section");
		expect(result).toContain("Some surrounding text");
	});

	it("inspire action omits context section when not provided", () => {
		const result = buildActionPrompt("inspire", sampleText, "explain");
		expect(result).not.toContain("Document context:");
	});
});
