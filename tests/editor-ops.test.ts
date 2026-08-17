import { describe, it, expect } from "vitest";
import type { Editor, EditorPosition } from "obsidian";
import {
	findParagraphBounds,
	findSelectionSpan,
	resolveEditBounds,
	extractMarkdownPrefix,
	extractInlineGuidelines,
	getParagraphText,
	findCalloutBlocks,
	findCalloutContaining,
	getCalloutQaPairs,
	getCalloutBody,
	appendCallout,
	appendCalloutAfter,
	replaceParagraphAndRemoveCallouts,
	insertTranslationAfter,
	highlightSelection,
	normalizeMathDelimiters,
	gatherEditContext,
	getSurroundingParagraphs,
	nextRevisionNumber,
} from "../src/editor-ops";

/**
 * A mock Editor that faithfully implements replaceRange via a flat-string
 * model, so annotation CRUD and translation insertion can be unit-tested.
 */
class MockEditor {
	lines: string[];
	cursorFrom: EditorPosition;
	cursorTo: EditorPosition;
	selectedText: string;

	constructor(opts: {
		lines: string[];
		cursor?: EditorPosition;
		selection?: { from: EditorPosition; to: EditorPosition; text: string };
	}) {
		this.lines = [...opts.lines];
		if (opts.selection) {
			this.cursorFrom = opts.selection.from;
			this.cursorTo = opts.selection.to;
			this.selectedText = opts.selection.text;
		} else {
			this.cursorFrom = opts.cursor ?? { line: 0, ch: 0 };
			this.cursorTo = this.cursorFrom;
			this.selectedText = "";
		}
	}

	getLine(n: number): string {
		return this.lines[n] ?? "";
	}
	lineCount(): number {
		return this.lines.length;
	}
	getValue(): string {
		return this.lines.join("\n");
	}
	getSelection(): string {
		return this.selectedText;
	}
	somethingSelected(): boolean {
		return this.selectedText.length > 0;
	}
	getCursor(which: "from" | "to" | "head" = "from"): EditorPosition {
		return which === "to" ? this.cursorTo : this.cursorFrom;
	}

	private toIndex(pos: EditorPosition): number {
		let idx = 0;
		for (let i = 0; i < pos.line && i < this.lines.length; i++) {
			idx += (this.lines[i]?.length ?? 0) + 1;
		}
		return idx + pos.ch;
	}

	replaceRange(text: string, from: EditorPosition, to?: EditorPosition): void {
		const flat = this.lines.join("\n");
		const fromIdx = this.toIndex(from);
		const toIdx = this.toIndex(to ?? from);
		const newFlat = flat.slice(0, fromIdx) + text + flat.slice(toIdx);
		this.lines = newFlat.split("\n");
	}
}

const asEditor = (e: MockEditor): Editor => e as unknown as Editor;

describe("findParagraphBounds", () => {
	it("finds single-line paragraph", () => {
		const editor = new MockEditor({ lines: ["", "Hello world", ""] });
		expect(findParagraphBounds(asEditor(editor), 1)).toEqual({
			startLine: 1,
			endLine: 1,
		});
	});

	it("finds multi-line paragraph", () => {
		const editor = new MockEditor({ lines: ["Line one", "Line two", "Line three"] });
		expect(findParagraphBounds(asEditor(editor), 1)).toEqual({
			startLine: 0,
			endLine: 2,
		});
	});

	it("stops at empty lines", () => {
		const editor = new MockEditor({
			lines: ["Para one", "", "Para two line 1", "Para two line 2", "", "Para three"],
		});
		expect(findParagraphBounds(asEditor(editor), 2)).toEqual({
			startLine: 2,
			endLine: 3,
		});
	});

	it("stops at annotation lines", () => {
		const editor = new MockEditor({ lines: ["Paragraph text", "%%some annotation%%", "Next paragraph"] });
		expect(findParagraphBounds(asEditor(editor), 0)).toEqual({
			startLine: 0,
			endLine: 0,
		});
	});

	it("returns null for empty line", () => {
		const editor = new MockEditor({ lines: ["Hello", "", "World"] });
		expect(findParagraphBounds(asEditor(editor), 1)).toBeNull();
	});

	it("returns null for annotation line", () => {
		const editor = new MockEditor({ lines: ["Hello", "%%annotation%%", "World"] });
		expect(findParagraphBounds(asEditor(editor), 1)).toBeNull();
	});

	it("treats list items as individual paragraphs", () => {
		const editor = new MockEditor({ lines: ["- item 1", "- item 2", "- item 3"] });
		expect(findParagraphBounds(asEditor(editor), 1)).toEqual({
			startLine: 1,
			endLine: 1,
		});
	});

	it("stops at a heading immediately after the paragraph (no blank line)", () => {
		const editor = new MockEditor({
			lines: ["Para text", "### Next heading", "content"],
		});
		expect(findParagraphBounds(asEditor(editor), 0)).toEqual({
			startLine: 0,
			endLine: 0,
		});
	});

	it("stops at a heading immediately before the paragraph", () => {
		const editor = new MockEditor({
			lines: ["### Heading", "Para text"],
		});
		expect(findParagraphBounds(asEditor(editor), 1)).toEqual({
			startLine: 1,
			endLine: 1,
		});
	});

	it("returns null for a heading line", () => {
		const editor = new MockEditor({ lines: ["## Heading"] });
		expect(findParagraphBounds(asEditor(editor), 0)).toBeNull();
	});
});

describe("findSelectionSpan", () => {
	it("returns the single paragraph when selection is within one paragraph", () => {
		const editor = new MockEditor({ lines: ["P1", "", "P2", "", "P3"] });
		expect(
			findSelectionSpan(asEditor(editor), { line: 2, ch: 0 }, { line: 2, ch: 2 }),
		).toEqual({ startLine: 2, endLine: 2 });
	});

	it("spans from first to last paragraph for a multi-paragraph selection", () => {
		const editor = new MockEditor({ lines: ["P1", "", "P2", "", "P3"] });
		expect(
			findSelectionSpan(asEditor(editor), { line: 0, ch: 0 }, { line: 4, ch: 2 }),
		).toEqual({ startLine: 0, endLine: 4 });
	});

	it("falls back to the first paragraph when the end is on an empty line", () => {
		const editor = new MockEditor({ lines: ["P1", "", "P2", ""] });
		expect(
			findSelectionSpan(asEditor(editor), { line: 0, ch: 0 }, { line: 3, ch: 0 }),
		).toEqual({ startLine: 0, endLine: 2 });
	});

	it("returns null when the start is on an empty line", () => {
		const editor = new MockEditor({ lines: ["P1", "", "P2"] });
		expect(
			findSelectionSpan(asEditor(editor), { line: 1, ch: 0 }, { line: 2, ch: 0 }),
		).toBeNull();
	});
});

describe("extractMarkdownPrefix", () => {
	it("extracts unordered list marker", () => {
		expect(extractMarkdownPrefix("- some item")).toEqual({ prefix: "- ", content: "some item" });
	});

	it("extracts heading prefix", () => {
		expect(extractMarkdownPrefix("## My heading")).toEqual({ prefix: "## ", content: "My heading" });
	});

	it("extracts blockquote prefix", () => {
		expect(extractMarkdownPrefix("> quoted text")).toEqual({ prefix: "> ", content: "quoted text" });
	});

	it("returns empty prefix for plain text", () => {
		expect(extractMarkdownPrefix("Just regular text")).toEqual({ prefix: "", content: "Just regular text" });
	});
});

describe("getParagraphText", () => {
	it("returns multiple lines joined", () => {
		const editor = new MockEditor({ lines: ["Line 1", "Line 2", "Line 3"] });
		expect(getParagraphText(asEditor(editor), 0, 2)).toBe("Line 1\nLine 2\nLine 3");
	});
});

describe("findCalloutBlocks", () => {
	it("finds a callout block below the paragraph", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!coo]- Q?", "> answer"],
		});
		expect(findCalloutBlocks(asEditor(editor), 0)).toEqual([
			{ startLine: 2, endLine: 3 },
		]);
	});

	it("finds multiple callout blocks", () => {
		const editor = new MockEditor({
			lines: [
				"P",
				"",
				"> [!coo]- Q1?",
				"> a1",
				"",
				"> [!coo]- Q2?",
				"> a2",
			],
		});
		expect(findCalloutBlocks(asEditor(editor), 0)).toEqual([
			{ startLine: 2, endLine: 3 },
			{ startLine: 5, endLine: 6 },
		]);
	});

	it("returns empty when there are no callouts", () => {
		const editor = new MockEditor({ lines: ["P", "", "next"] });
		expect(findCalloutBlocks(asEditor(editor), 0)).toEqual([]);
	});

	it("stops at non-callout content after a blank", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!coo]- Q?", "> a", "", "next"],
		});
		expect(findCalloutBlocks(asEditor(editor), 0)).toEqual([
			{ startLine: 2, endLine: 3 },
		]);
	});

	it("ignores non-coo callouts", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!note]- other", "> x"],
		});
		expect(findCalloutBlocks(asEditor(editor), 0)).toEqual([]);
	});
});

describe("getCalloutQaPairs", () => {
	it("returns the question (title) and answer (body) of each callout", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!coo]- What is X?", "> The answer with **markdown**."],
		});
		expect(getCalloutQaPairs(asEditor(editor), 0)).toEqual([
			{ question: "What is X?", answer: "The answer with **markdown**." },
		]);
	});

	it("strips the callout prefix (and extra spaces) from the question", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!coo]-  Why?", "> because"],
		});
		expect(getCalloutQaPairs(asEditor(editor), 0)).toEqual([
			{ question: "Why?", answer: "because" },
		]);
	});

	it("joins multi-line answers", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!coo]- Q?", "> line one.", "> line two."],
		});
		expect(getCalloutQaPairs(asEditor(editor), 0)).toEqual([
			{ question: "Q?", answer: "line one.\nline two." },
		]);
	});

	it("returns empty when there are no callouts", () => {
		const editor = new MockEditor({ lines: ["P"] });
		expect(getCalloutQaPairs(asEditor(editor), 0)).toEqual([]);
	});

	it("skips empty bodies", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!coo]- Q?", ">"],
		});
		expect(getCalloutQaPairs(asEditor(editor), 0)).toEqual([]);
	});
});

describe("appendCallout", () => {
	it("appends a collapsed callout with a blank-line separator", () => {
		const editor = new MockEditor({ lines: ["Paragraph text"] });
		appendCallout(asEditor(editor), 0, "What is X?", "The answer.");
		expect(editor.lines).toEqual([
			"Paragraph text",
			"",
			"> [!coo]- What is X?",
			"> The answer.",
		]);
	});

	it("appends a second callout after the first", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!coo]- Q1?", "> a1"],
		});
		appendCallout(asEditor(editor), 0, "Q2?", "a2");
		expect(editor.lines).toEqual([
			"P",
			"",
			"> [!coo]- Q1?",
			"> a1",
			"",
			"> [!coo]- Q2?",
			"> a2",
		]);
	});

	it("preserves multi-line content as callout body", () => {
		const editor = new MockEditor({ lines: ["P"] });
		appendCallout(asEditor(editor), 0, "Q?", "line one.\nline two.");
		expect(editor.lines).toEqual([
			"P",
			"",
			"> [!coo]- Q?",
			"> line one.",
			"> line two.",
		]);
	});

	it("collapses newlines in the title", () => {
		const editor = new MockEditor({ lines: ["P"] });
		appendCallout(asEditor(editor), 0, "multi\nline question", "a");
		expect(editor.lines[2]).toBe("> [!coo]- multi line question");
	});

	it("ignores a whitespace-only answer", () => {
		const editor = new MockEditor({ lines: ["P"] });
		appendCallout(asEditor(editor), 0, "Q?", "   ");
		expect(editor.lines).toEqual(["P"]);
	});

	it("appends at the bottom when paragraphEndLine is the last line (whole-doc mode)", () => {
		const editor = new MockEditor({ lines: ["Line 1", "Line 2"] });
		appendCallout(asEditor(editor), 1, "Summarize?", "The summary.");
		expect(editor.lines).toEqual([
			"Line 1",
			"Line 2",
			"",
			"> [!coo]- Summarize?",
			"> The summary.",
		]);
	});

	it("stacks a follow-up callout below the first at the bottom (whole-doc chaining)", () => {
		const editor = new MockEditor({
			lines: ["Line 1", "Line 2", "", "> [!coo]- Q1?", "> a1"],
		});
		appendCallout(asEditor(editor), 1, "Q2?", "a2");
		expect(editor.lines).toEqual([
			"Line 1",
			"Line 2",
			"",
			"> [!coo]- Q1?",
			"> a1",
			"",
			"> [!coo]- Q2?",
			"> a2",
		]);
	});

	it("leaves a blank line after the callout when the next line is a tight list item", () => {
		const editor = new MockEditor({ lines: ["1. one", "2. two weird", "3. three"] });
		appendCallout(asEditor(editor), 1, "What is weird?", "the answer.");
		expect(editor.lines).toEqual([
			"1. one",
			"2. two weird",
			"",
			"> [!coo]- What is weird?",
			"> the answer.",
			"",
			"3. three",
		]);
	});

	it("normalizes TeX math delimiters in the callout body so formulas render", () => {
		const editor = new MockEditor({ lines: ["P"] });
		appendCallout(asEditor(editor), 0, "Q?", "The synthetic \\(y\\) is a reserve.");
		expect(editor.lines).toEqual([
			"P",
			"",
			"> [!coo]- Q?",
			"> The synthetic $y$ is a reserve.",
		]);
	});
});

describe("findCalloutContaining", () => {
	it("finds the callout whose body contains the position", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!coo]- Q?", "> the answer mentions Y"],
		});
		expect(findCalloutContaining(asEditor(editor), { line: 3, ch: 5 })).toEqual({
			startLine: 2,
			endLine: 3,
		});
	});

	it("finds the containing callout in a stack", () => {
		const editor = new MockEditor({
			lines: [
				"P",
				"",
				"> [!coo]- Q1?",
				"> a1",
				"",
				"> [!coo]- Q2?",
				"> a2",
			],
		});
		expect(findCalloutContaining(asEditor(editor), { line: 6, ch: 2 })).toEqual({
			startLine: 5,
			endLine: 6,
		});
	});

	it("finds the callout for a position in a multi-line body", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!coo]- Q?", "> line one.", "> line two."],
		});
		expect(findCalloutContaining(asEditor(editor), { line: 4, ch: 0 })).toEqual({
			startLine: 2,
			endLine: 4,
		});
	});

	it("returns null when the position is on the title line", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!coo]- Q?", "> a"],
		});
		expect(findCalloutContaining(asEditor(editor), { line: 2, ch: 3 })).toBeNull();
	});

	it("returns null for a non-blockquote line", () => {
		const editor = new MockEditor({ lines: ["P", "", "> [!coo]- Q?", "> a"] });
		expect(findCalloutContaining(asEditor(editor), { line: 0, ch: 0 })).toBeNull();
	});

	it("returns null inside a non-coo callout", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!note]- other", "> body"],
		});
		expect(findCalloutContaining(asEditor(editor), { line: 3, ch: 0 })).toBeNull();
	});

	it("returns null for a blockquote line with no preceding coo start", () => {
		const editor = new MockEditor({ lines: ["> loose quote", "> more"] });
		expect(findCalloutContaining(asEditor(editor), { line: 1, ch: 0 })).toBeNull();
	});
});

describe("getCalloutBody", () => {
	it("returns the body of a single callout block", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!coo]- Q?", "> the answer"],
		});
		expect(getCalloutBody(asEditor(editor), { startLine: 2, endLine: 3 })).toBe(
			"the answer",
		);
	});

	it("joins a multi-line body and strips the > prefix", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!coo]- Q?", "> line one.", "> line two."],
		});
		expect(getCalloutBody(asEditor(editor), { startLine: 2, endLine: 4 })).toBe(
			"line one.\nline two.",
		);
	});

	it("returns empty string for a body-less callout", () => {
		const editor = new MockEditor({ lines: ["> [!coo]- Q?"] });
		expect(getCalloutBody(asEditor(editor), { startLine: 0, endLine: 0 })).toBe("");
	});
});

describe("appendCalloutAfter", () => {
	it("stacks a new callout immediately after the drilled callout (mid-stack)", () => {
		const editor = new MockEditor({
			lines: [
				"P",
				"",
				"> [!coo]- Q1?",
				"> a1",
				"",
				"> [!coo]- Q2?",
				"> a2",
			],
		});
		appendCalloutAfter(asEditor(editor), 3, "Q3?", "a3");
		expect(editor.lines).toEqual([
			"P",
			"",
			"> [!coo]- Q1?",
			"> a1",
			"",
			"> [!coo]- Q3?",
			"> a3",
			"",
			"> [!coo]- Q2?",
			"> a2",
		]);
	});

	it("appends after the last callout when drilling the final one", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!coo]- Q1?", "> a1", "", "> [!coo]- Q2?", "> a2"],
		});
		appendCalloutAfter(asEditor(editor), 6, "Q3?", "a3");
		expect(editor.lines).toEqual([
			"P",
			"",
			"> [!coo]- Q1?",
			"> a1",
			"",
			"> [!coo]- Q2?",
			"> a2",
			"",
			"> [!coo]- Q3?",
			"> a3",
		]);
	});

	it("ignores a whitespace-only answer", () => {
		const editor = new MockEditor({ lines: ["P", "", "> [!coo]- Q?", "> a"] });
		appendCalloutAfter(asEditor(editor), 3, "Q2?", "   ");
		expect(editor.lines).toEqual(["P", "", "> [!coo]- Q?", "> a"]);
	});

	it("leaves a blank line after the callout when the next line is non-blank", () => {
		const editor = new MockEditor({ lines: ["> [!coo]- Q?", "> a", "3. three"] });
		appendCalloutAfter(asEditor(editor), 1, "Q2?", "a2");
		expect(editor.lines).toEqual([
			"> [!coo]- Q?",
			"> a",
			"",
			"> [!coo]- Q2?",
			"> a2",
			"",
			"3. three",
		]);
	});
});

describe("replaceParagraphAndRemoveCallouts", () => {
	it("replaces the paragraph and removes the callout block", () => {
		const editor = new MockEditor({
			lines: ["P", "", "> [!coo]- Q?", "> a", "after"],
		});
		replaceParagraphAndRemoveCallouts(
			asEditor(editor),
			0,
			0,
			[{ startLine: 2, endLine: 3 }],
			"rewritten",
		);
		expect(editor.lines).toEqual(["rewritten", "after"]);
	});

	it("removes the paragraph, blank separator, and multiple callouts", () => {
		const editor = new MockEditor({
			lines: [
				"P",
				"",
				"> [!coo]- Q1?",
				"> a1",
				"",
				"> [!coo]- Q2?",
				"> a2",
				"after",
			],
		});
		replaceParagraphAndRemoveCallouts(
			asEditor(editor),
			0,
			0,
			[
				{ startLine: 2, endLine: 3 },
				{ startLine: 5, endLine: 6 },
			],
			"new",
		);
		expect(editor.lines).toEqual(["new", "after"]);
	});

	it("replaces only the paragraph when there are no callouts", () => {
		const editor = new MockEditor({ lines: ["P", "next"] });
		replaceParagraphAndRemoveCallouts(asEditor(editor), 0, 0, [], "rewritten");
		expect(editor.lines).toEqual(["rewritten", "next"]);
	});
});

describe("insertTranslationAfter", () => {
	it("inserts a bracketed translation after the position", () => {
		const editor = new MockEditor({ lines: ["hello world"] });
		insertTranslationAfter(asEditor(editor), { line: 0, ch: 5 }, "你好");
		expect(editor.lines).toEqual(["hello (你好) world"]);
	});

	it("inserts at end of line", () => {
		const editor = new MockEditor({ lines: ["hello"] });
		insertTranslationAfter(asEditor(editor), { line: 0, ch: 5 }, "hola");
		expect(editor.lines).toEqual(["hello (hola)"]);
	});

	it("collapses newlines in the translation", () => {
		const editor = new MockEditor({ lines: ["hello"] });
		insertTranslationAfter(asEditor(editor), { line: 0, ch: 5 }, "a\nb");
		expect(editor.lines).toEqual(["hello (a b)"]);
	});
});

describe("highlightSelection", () => {
	it("wraps a mid-line selection with == markers", () => {
		const editor = new MockEditor({ lines: ["the quantum field"] });
		highlightSelection(asEditor(editor), { line: 0, ch: 4 }, { line: 0, ch: 11 }, "quantum");
		expect(editor.lines).toEqual(["the ==quantum== field"]);
	});

	it("wraps a selection at the start of the line", () => {
		const editor = new MockEditor({ lines: ["quantum field"] });
		highlightSelection(asEditor(editor), { line: 0, ch: 0 }, { line: 0, ch: 7 }, "quantum");
		expect(editor.lines).toEqual(["==quantum== field"]);
	});
});

describe("normalizeMathDelimiters", () => {
	it("converts inline \\(…\\) to $…$", () => {
		expect(normalizeMathDelimiters("\\(y\\)")).toBe("$y$");
	});

	it("converts inline math that contains LaTeX commands", () => {
		expect(normalizeMathDelimiters("\\(r\\Delta x\\)")).toBe("$r\\Delta x$");
	});

	it("converts an inline delimiter mid-prose", () => {
		expect(normalizeMathDelimiters("synthetic \\(y\\) reserve")).toBe(
			"synthetic $y$ reserve",
		);
	});

	it("converts multiple inline delimiters in one string", () => {
		expect(normalizeMathDelimiters("\\(a\\) and \\(b\\)")).toBe("$a$ and $b$");
	});

	it("converts single-line display math \\[…\\] to $$…$$", () => {
		expect(normalizeMathDelimiters("\\[ E = mc^2 \\]")).toBe("$$ E = mc^2 $$");
	});

	it("converts multi-line display math", () => {
		expect(normalizeMathDelimiters("\\[\nx = 1\n\\]")).toBe("$$\nx = 1\n$$");
	});

	it("leaves escaped prose brackets like \\[W\\] untouched", () => {
		expect(normalizeMathDelimiters("\\[W\\]hat")).toBe("\\[W\\]hat");
	});

	it("leaves non-mathy bracketed prose untouched", () => {
		expect(normalizeMathDelimiters("see \\[TOPIC FOO\\]")).toBe("see \\[TOPIC FOO\\]");
	});

	it("leaves already-correct $…$ math as-is", () => {
		expect(normalizeMathDelimiters("$y$ and $$z$$")).toBe("$y$ and $$z$$");
	});

	it("leaves plain text without delimiters as-is", () => {
		expect(normalizeMathDelimiters("Hello world")).toBe("Hello world");
	});
});

describe("gatherEditContext", () => {
	it("collects a single guidelines line directly below the paragraph", () => {
		const editor = new MockEditor({
			lines: ["materials here", "", "%%keep it short, formal%%"],
		});
		const result = gatherEditContext(asEditor(editor), 0);
		expect(result.guidelines).toBe("keep it short, formal");
		expect(result.insertAfter).toBe(2);
	});

	it("returns empty guidelines and insertAfter at the paragraph when nothing follows", () => {
		const editor = new MockEditor({ lines: ["materials here"] });
		const result = gatherEditContext(asEditor(editor), 0);
		expect(result.guidelines).toBe("");
		expect(result.insertAfter).toBe(0);
	});

	it("collects multiple contiguous %%…%% lines", () => {
		const editor = new MockEditor({
			lines: ["materials", "", "%%line one%%", "%%line two%%"],
		});
		const result = gatherEditContext(asEditor(editor), 0);
		expect(result.guidelines).toBe("line one\nline two");
		expect(result.insertAfter).toBe(3);
	});

	it("stops collecting guidelines at the first non-%% line", () => {
		const editor = new MockEditor({
			lines: ["materials", "", "%%real guidelines%%", "some other text"],
		});
		const result = gatherEditContext(asEditor(editor), 0);
		expect(result.guidelines).toBe("real guidelines");
		expect(result.insertAfter).toBe(2);
	});

	it("inserts after the last existing revision callout", () => {
		const editor = new MockEditor({
			lines: [
				"materials",
				"",
				"%%guidelines%%",
				"",
				"> [!coo-edit]- #1 old",
				"> first revision",
				"",
				"> [!coo-edit]- #2 newer",
				"> second revision",
			],
		});
		const result = gatherEditContext(asEditor(editor), 0);
		expect(result.guidelines).toBe("guidelines");
		expect(result.insertAfter).toBe(8);
	});

	it("ignores [!coo] (Ask) callouts when finding the insertion point", () => {
		const editor = new MockEditor({
			lines: [
				"materials",
				"",
				"%%guidelines%%",
				"",
				"> [!coo]- What is X?",
				"> an answer",
			],
		});
		const result = gatherEditContext(asEditor(editor), 0);
		expect(result.guidelines).toBe("guidelines");
		expect(result.insertAfter).toBe(2);
	});

	it("reports hasRevisions true only when [!coo-edit] revisions exist below", () => {
		const none = new MockEditor({ lines: ["materials", "", "%%g%%"] });
		expect(gatherEditContext(asEditor(none), 0).hasRevisions).toBe(false);

		const withRevisions = new MockEditor({
			lines: ["materials", "", "%%g%%", "", "> [!coo-edit]- #1 g", "> body"],
		});
		expect(gatherEditContext(asEditor(withRevisions), 0).hasRevisions).toBe(true);
	});
});

describe("nextRevisionNumber", () => {
	it("returns 1 when there are no revisions", () => {
		const editor = new MockEditor({ lines: ["just a note", "", "%%guidelines%%"] });
		expect(nextRevisionNumber(asEditor(editor))).toBe(1);
	});

	it("returns one higher than the highest existing revision number", () => {
		const editor = new MockEditor({
			lines: [
				"> [!coo-edit]- #1 a",
				"> body",
				"",
				"> [!coo-edit]- #3 c",
				"> body",
			],
		});
		expect(nextRevisionNumber(asEditor(editor))).toBe(4);
	});

	it("ignores numbers in [!coo] (Ask) callouts", () => {
		const editor = new MockEditor({
			lines: ["> [!coo]- #5 an ask answer", "> body"],
		});
		expect(nextRevisionNumber(asEditor(editor))).toBe(1);
	});
});

describe("getSurroundingParagraphs", () => {
	it("returns the prose paragraphs immediately before and after", () => {
		const editor = new MockEditor({
			lines: ["previous paragraph", "", "materials", "", "next paragraph"],
		});
		expect(
			getSurroundingParagraphs(asEditor(editor), { startLine: 2, endLine: 2 }),
		).toEqual({ before: "previous paragraph", after: "next paragraph" });
	});

	it("returns empty before when materials are at the top", () => {
		const editor = new MockEditor({ lines: ["materials", "", "next"] });
		expect(
			getSurroundingParagraphs(asEditor(editor), { startLine: 0, endLine: 0 }),
		).toEqual({ before: "", after: "next" });
	});

	it("returns empty after when materials are at the bottom", () => {
		const editor = new MockEditor({ lines: ["prev", "", "materials"] });
		expect(
			getSurroundingParagraphs(asEditor(editor), { startLine: 2, endLine: 2 }),
		).toEqual({ before: "prev", after: "" });
	});

	it("skips %%guidelines%% and [!coo-edit] revisions when finding the following paragraph", () => {
		const editor = new MockEditor({
			lines: [
				"prev",
				"",
				"materials",
				"",
				"%%guidelines%%",
				"",
				"> [!coo-edit]- #1 g",
				"> revision body",
				"",
				"the real next paragraph",
			],
		});
		expect(
			getSurroundingParagraphs(asEditor(editor), { startLine: 2, endLine: 2 }),
		).toEqual({ before: "prev", after: "the real next paragraph" });
	});

	it("skips an Ask callout above the materials when finding the preceding paragraph", () => {
		const editor = new MockEditor({
			lines: [
				"real prev",
				"",
				"> [!coo]- What is X?",
				"> an answer",
				"",
				"materials",
			],
		});
		expect(
			getSurroundingParagraphs(asEditor(editor), { startLine: 5, endLine: 5 }),
		).toEqual({ before: "real prev", after: "" });
	});
});

describe("resolveEditBounds", () => {
	it("uses the selection span when text is selected (multi-paragraph)", () => {
		const editor = new MockEditor({
			lines: ["intro", "", "- one", "- two", "- three", "", "after"],
			selection: {
				from: { line: 2, ch: 0 },
				to: { line: 4, ch: 5 },
				text: "- one\n- two\n- three",
			},
		});
		expect(resolveEditBounds(asEditor(editor))).toEqual({
			startLine: 2,
			endLine: 4,
		});
	});

	it("uses the cursor paragraph when nothing is selected", () => {
		const editor = new MockEditor({
			lines: ["one", "two", "three"],
			cursor: { line: 1, ch: 0 },
		});
		expect(resolveEditBounds(asEditor(editor))).toEqual({
			startLine: 0,
			endLine: 2,
		});
	});

	it("returns null when the cursor is on a %%guidelines%% line", () => {
		const editor = new MockEditor({
			lines: ["materials", "", "%%guidelines%%"],
			cursor: { line: 2, ch: 0 },
		});
		expect(resolveEditBounds(asEditor(editor))).toBeNull();
	});

	it("walks back to the last paragraph when the selection ends on a %%…%% line", () => {
		const editor = new MockEditor({
			lines: ["- one", "- two", "", "%%guidelines%%"],
			selection: {
				from: { line: 0, ch: 0 },
				to: { line: 3, ch: 14 },
				text: "- one\n- two\n\n%%guidelines%%",
			},
		});
		// Selection ends on the %%…%% line; findSelectionSpan walks up to the last
		// real paragraph (line 1), so the guidelines line is excluded from the span.
		expect(resolveEditBounds(asEditor(editor))).toEqual({
			startLine: 0,
			endLine: 1,
		});
	});
});

describe("extractInlineGuidelines", () => {
	it("returns the text unchanged with no notes when there are no %%…%%", () => {
		const { text, notes } = extractInlineGuidelines("Just a plain sentence. Another one.");
		expect(text).toBe("Just a plain sentence. Another one.");
		expect(notes).toEqual([]);
	});

	it("extracts an inline note and leaves a [§N] marker at its spot", () => {
		const { text, notes } = extractInlineGuidelines(
			"First sentence. %%tighten this%% Second sentence.",
		);
		expect(text).toBe("First sentence. [§1] Second sentence.");
		expect(notes).toEqual([{ marker: "[§1]", note: "tighten this" }]);
	});

	it("treats a trailing note as whole-passage (no marker, removed)", () => {
		const { text, notes } = extractInlineGuidelines("A whole paragraph of prose. %%expand it%%");
		expect(text).toBe("A whole paragraph of prose.");
		expect(notes).toEqual([{ note: "expand it" }]);
	});

	it("handles inline + trailing together", () => {
		const { text, notes } = extractInlineGuidelines(
			"Its weakest link stopped being weak. %%add an example%% Having a model draft a proof was out of reach. %%expand the whole thing%%",
		);
		expect(text).toBe(
			"Its weakest link stopped being weak. [§1] Having a model draft a proof was out of reach.",
		);
		expect(notes).toEqual([
			{ marker: "[§1]", note: "add an example" },
			{ note: "expand the whole thing" },
		]);
	});

	it("numbers multiple inline markers in document order", () => {
		const { text, notes } = extractInlineGuidelines("a %%one%% b %%two%% c");
		expect(text).toBe("a [§1] b [§2] c");
		expect(notes.map((n) => n.marker)).toEqual(["[§1]", "[§2]"]);
	});

	it("collapses doubled spaces left around a removed note", () => {
		const { text } = extractInlineGuidelines("word  %%note%%  word");
		expect(text).toBe("word [§1] word");
	});

	it("preserves newlines between lines of a multi-line paragraph", () => {
		const { text } = extractInlineGuidelines("line one %%x%%\nline two");
		expect(text).toBe("line one [§1]\nline two");
	});
});
