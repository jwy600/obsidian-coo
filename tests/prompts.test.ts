import { describe, it, expect } from "vitest";
import {
	replaceLanguageTag,
	replaceTranslationLanguageTag,
	getBlockActionSystemPrompt,
	getTranslateSystemPrompt,
	getRewriteSystemPrompt,
	getEditSystemPrompt,
	getRegisterDocumentPrompt,
	buildAskInput,
	buildRewriteInput,
	buildTranslateInput,
	buildEditInput,
	parseMinorTag,
} from "../src/prompts";

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

describe("replaceTranslationLanguageTag", () => {
	const template = "You translate.\n<translationlanguage></translationlanguage>\nGo.";

	it("removes the tag for English", () => {
		const result = replaceTranslationLanguageTag(template, "English");
		expect(result).not.toContain("<translationlanguage>");
		expect(result).toContain("Go.");
	});

	it("fills the tag for Chinese", () => {
		const result = replaceTranslationLanguageTag(template, "Chinese");
		expect(result).toContain("Translate into Chinese.");
	});

	it("fills the tag for Japanese", () => {
		const result = replaceTranslationLanguageTag(template, "Japanese");
		expect(result).toContain("Translate into Japanese.");
	});
});

describe("getBlockActionSystemPrompt", () => {
	it("contains the passage scope and ask section for English", () => {
		const result = getBlockActionSystemPrompt("en");
		expect(result).toContain("<passage>");
		expect(result).toContain("<ask>");
		expect(result).not.toContain("Always respond in");
	});

	it("instructs the model to use $…$ math delimiters, not TeX \\(…\\)", () => {
		const result = getBlockActionSystemPrompt("en");
		expect(result).toContain("display math");
		// Backslashes must survive the template literal — the model should see
		// the literal \(...\) it is told to avoid, not (...).
		expect(result).toContain("\\(...\\)");
		expect(result).toContain("\\[...\\]");
	});

	it("applies language directive for Chinese", () => {
		const result = getBlockActionSystemPrompt("zh");
		expect(result).toContain("Always respond in Simplified Chinese.");
		expect(result).toContain("<passage>");
	});

	it("applies language directive for Japanese", () => {
		const result = getBlockActionSystemPrompt("ja");
		expect(result).toContain("Always respond in Japanese.");
	});
});

describe("getTranslateSystemPrompt", () => {
	it("includes translate directive for Chinese", () => {
		const result = getTranslateSystemPrompt("Chinese");
		expect(result).toContain("Translate into Chinese.");
		expect(result).toContain("<passage>");
	});

	it("removes the translate tag for English", () => {
		const result = getTranslateSystemPrompt("English");
		expect(result).not.toContain("<translationlanguage>");
		expect(result).not.toContain("Translate into");
	});
});

describe("getRewriteSystemPrompt", () => {
	it("contains rewrite rules for English", () => {
		const result = getRewriteSystemPrompt("en");
		expect(result).toContain("revise a passage");
		expect(result).not.toContain("Always respond in");
	});

	it("tells rewrite to keep math in $…$ / $$…$$ form", () => {
		const result = getRewriteSystemPrompt("en");
		expect(result).toContain("$$…$$");
		expect(result).toContain("\\(...\\)");
	});

	it("applies language directive for Chinese", () => {
		const result = getRewriteSystemPrompt("zh");
		expect(result).toContain("Always respond in Simplified Chinese.");
	});
});

describe("getRegisterDocumentPrompt", () => {
	it("returns the registration prompt", () => {
		const result = getRegisterDocumentPrompt();
		expect(result).toContain("shared a document");
		expect(result).toContain("Store it in context");
	});
});

describe("buildAskInput", () => {
	const passage = "  The quick brown fox jumps.  ";

	it("leads with the preamble and question, passage last (no selection)", () => {
		const result = buildAskInput(passage, undefined, "What?");
		expect(result).toContain("Answer this question about the passage.");
		expect(result).toContain("Question: What?");
		expect(result).toContain("<passage>");
		expect(result).toContain("The quick brown fox jumps.");
		expect(result).not.toContain("highlighted");
		// Question framing comes before the passage (matches coo-app-next).
		expect(result.indexOf("Question:")).toBeLessThan(result.indexOf("<passage>"));
	});

	it("appends the highlighted selection after the passage", () => {
		const result = buildAskInput(passage, "brown fox", "What?");
		expect(result).toContain('The user highlighted this part: "brown fox"');
		expect(result).toContain("Question: What?");
		// Highlight comes after the passage.
		expect(result.indexOf("<passage>")).toBeLessThan(result.indexOf("highlighted"));
	});

	it("ignores a blank selection", () => {
		const result = buildAskInput(passage, "   ", "What?");
		expect(result).not.toContain("highlighted");
	});

	it("trims the question", () => {
		const result = buildAskInput(passage, undefined, "  What?  ");
		expect(result).toContain("Question: What?");
	});
});

describe("parseMinorTag", () => {
	it("detects and strips a bold Minor prefix with em-dash", () => {
		const { isMinor, body } = parseMinorTag("**Minor** — GCC is a C compiler.");
		expect(isMinor).toBe(true);
		expect(body).toBe("GCC is a C compiler.");
	});

	it("detects a plain 'Minor:' prefix", () => {
		const { isMinor, body } = parseMinorTag("Minor: a passing example.");
		expect(isMinor).toBe(true);
		expect(body).toBe("a passing example.");
	});

	it("is case-insensitive", () => {
		expect(parseMinorTag("**minor** — foo").isMinor).toBe(true);
	});

	it("returns the text unchanged when there is no Minor tag", () => {
		const { isMinor, body } = parseMinorTag("表达力 means expressivity…");
		expect(isMinor).toBe(false);
		expect(body).toBe("表达力 means expressivity…");
	});

	it("does not false-positive on 'Minority'", () => {
		const { isMinor, body } = parseMinorTag("Minority carriers recombine…");
		expect(isMinor).toBe(false);
		expect(body).toBe("Minority carriers recombine…");
	});

	it("preserves a multi-line body after the tag", () => {
		const { isMinor, body } = parseMinorTag("**Minor** — line one\nline two");
		expect(isMinor).toBe(true);
		expect(body).toBe("line one\nline two");
	});
});

describe("buildRewriteInput", () => {
	const passage = "  Some paragraph text.  ";

	it("includes passage and Q&A notes", () => {
		const result = buildRewriteInput(passage, [
			{ question: "What is X?", answer: "note one" },
			{ question: "Why?", answer: "note two" },
		]);
		expect(result).toContain("<passage>");
		expect(result).toContain("Some paragraph text.");
		expect(result).toContain("<notes>");
		expect(result).toContain("Q: What is X?");
		expect(result).toContain("A: note one");
		expect(result).toContain("Q: Why?");
		expect(result).toContain("A: note two");
	});

	it("omits the notes block when there are no notes", () => {
		const result = buildRewriteInput(passage, []);
		expect(result).toContain("<passage>");
		expect(result).not.toContain("<notes>");
	});
});

describe("buildTranslateInput", () => {
	it("wraps the passage in <passage> tags and trims", () => {
		const result = buildTranslateInput("  entanglement  ");
		expect(result).toBe("<passage>\nentanglement\n</passage>");
	});
});

describe("getEditSystemPrompt", () => {
	it("contains the materials/guidelines scope with no language tag", () => {
		const result = getEditSystemPrompt();
		expect(result).toContain("<materials>");
		expect(result).toContain("<guidelines>");
		expect(result).toContain("<context>");
		expect(result).toContain("faithful");
		expect(result).not.toContain("<language>");
		expect(result).not.toContain("Always respond in");
	});

	it("tells the model to keep math in $…$ / $$…$$ form", () => {
		const result = getEditSystemPrompt();
		expect(result).toContain("$$…$$");
		expect(result).toContain("\\(...\\)");
	});

	it("tells the model to preserve all substance, not summarize it away", () => {
		const result = getEditSystemPrompt();
		expect(result).toContain("do not summarize away");
		expect(result).toContain("survive into the passage");
	});

	it("grounds the construction in the full document", () => {
		const result = getEditSystemPrompt();
		expect(result).toContain("full document");
		expect(result).toContain("authority");
	});

	it("instructs the model to fact-check claims (wrong/exaggerated/understated)", () => {
		const result = getEditSystemPrompt();
		expect(result).toContain("Fact-check");
		expect(result).toContain("exaggerated");
		expect(result).toContain("understated");
	});

	it("describes the optional trailing Checks section for flagged claims", () => {
		const result = getEditSystemPrompt();
		expect(result).toContain("Checks");
		expect(result).toContain("clean passage");
	});

	it("adapts effort to fragments vs finished prose", () => {
		const result = getEditSystemPrompt();
		expect(result).toContain("Match your effort");
		expect(result).toContain("rough fragments");
		expect(result).toContain("revise lightly");
	});

	it("explains the [§N] inline-note markers", () => {
		const result = getEditSystemPrompt();
		expect(result).toContain("[§N]");
		expect(result).toContain("inline guideline");
	});

	it("tells the model to strip markers and %%…%% from the output", () => {
		const result = getEditSystemPrompt();
		expect(result).toContain("Strip every [§N]");
		expect(result).toContain("scaffolding");
	});
});

describe("buildEditInput", () => {
	it("includes materials, guidelines, and the revision number", () => {
		const result = buildEditInput("fragments here", [{ note: "keep it formal" }], 2);
		expect(result).toContain("This is revision #2");
		expect(result).toContain("<materials>");
		expect(result).toContain("fragments here");
		expect(result).toContain("<guidelines>");
		expect(result).toContain("keep it formal");
	});

	it("omits the guidelines block when there are no notes", () => {
		const result = buildEditInput("fragments", [], 1);
		expect(result).toContain("<materials>");
		expect(result).toContain("This is revision #1");
		expect(result).not.toContain("<guidelines>");
	});

	it("trims materials", () => {
		const result = buildEditInput("  fragments  ", [], 1);
		expect(result).toContain("<materials>\nfragments\n</materials>");
	});

	it("tags inline notes with their [§N] marker and lists whole-passage notes plainly", () => {
		const result = buildEditInput("prose [§1] more", [
			{ marker: "[§1]", note: "tighten this" },
			{ note: "expand the whole thing" },
		], 1);
		expect(result).toContain("<guidelines>");
		expect(result).toContain("- [§1] tighten this");
		expect(result).toContain("- expand the whole thing");
	});

	it("includes surrounding context when provided", () => {
		const result = buildEditInput("materials", [{ note: "formal" }], 1, {
			before: "the previous paragraph",
			after: "the next paragraph",
		});
		expect(result).toContain("<context>");
		expect(result).toContain("Preceding paragraph:");
		expect(result).toContain("the previous paragraph");
		expect(result).toContain("Following paragraph:");
		expect(result).toContain("the next paragraph");
	});

	it("omits the context block when context is absent", () => {
		const result = buildEditInput("materials", [], 1);
		expect(result).not.toContain("<context>");
	});

	it("marks a missing side as (none)", () => {
		const result = buildEditInput("materials", [], 1, { before: "only before" });
		expect(result).toContain("Preceding paragraph:\nonly before");
		expect(result).toContain("Following paragraph:\n(none)");
	});
});
