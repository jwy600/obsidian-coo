import { describe, it, expect } from "vitest";
import type { Editor, EditorPosition } from "obsidian";
import {
	findParagraphBounds,
	findSelectionSpan,
	extractMarkdownPrefix,
	getParagraphText,
	findAllAnnotationLines,
	getAnnotationNotes,
	appendAnnotation,
	replaceParagraphAndRemoveAnnotations,
	insertTranslationAfter,
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
	getSelection(): string {
		return this.selectedText;
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

describe("findAllAnnotationLines", () => {
	it("finds consecutive annotation lines", () => {
		const editor = new MockEditor({ lines: ["P", "%%a%%", "%%b%%", "next"] });
		expect(findAllAnnotationLines(asEditor(editor), 0)).toEqual([1, 2]);
	});

	it("returns empty when no annotations", () => {
		const editor = new MockEditor({ lines: ["P", "next"] });
		expect(findAllAnnotationLines(asEditor(editor), 0)).toEqual([]);
	});

	it("stops at an empty line", () => {
		const editor = new MockEditor({ lines: ["P", "%%a%%", "", "%%b%%"] });
		expect(findAllAnnotationLines(asEditor(editor), 0)).toEqual([1]);
	});

	it("skips a blank line separator to find the notes block", () => {
		const editor = new MockEditor({ lines: ["P", "", "%%a%%", "%%b%%"] });
		expect(findAllAnnotationLines(asEditor(editor), 0)).toEqual([2, 3]);
	});

	it("returns empty when a blank line leads to non-annotation content", () => {
		const editor = new MockEditor({ lines: ["P", "", "next paragraph"] });
		expect(findAllAnnotationLines(asEditor(editor), 0)).toEqual([]);
	});
});

describe("getAnnotationNotes", () => {
	it("returns all notes below the paragraph", () => {
		const editor = new MockEditor({ lines: ["P", "%%a%%", "%%b%%"] });
		expect(getAnnotationNotes(asEditor(editor), 0)).toEqual(["a", "b"]);
	});

	it("returns empty when no annotations", () => {
		const editor = new MockEditor({ lines: ["P"] });
		expect(getAnnotationNotes(asEditor(editor), 0)).toEqual([]);
	});

	it("skips empty annotation lines", () => {
		const editor = new MockEditor({ lines: ["P", "%%%%", "%%real%%"] });
		expect(getAnnotationNotes(asEditor(editor), 0)).toEqual(["real"]);
	});

	it("returns one note for a legacy comma-separated annotation", () => {
		const editor = new MockEditor({ lines: ["P", "%%a, b, c%%"] });
		expect(getAnnotationNotes(asEditor(editor), 0)).toEqual(["a, b, c"]);
	});

	it("finds notes separated from the paragraph by a blank line", () => {
		const editor = new MockEditor({ lines: ["P", "", "%%a%%", "%%b%%"] });
		expect(getAnnotationNotes(asEditor(editor), 0)).toEqual(["a", "b"]);
	});
});

describe("appendAnnotation", () => {
	it("separates the first note from the paragraph with a blank line", () => {
		const editor = new MockEditor({ lines: ["Paragraph text"] });
		appendAnnotation(asEditor(editor), 0, "a note");
		expect(editor.lines).toEqual(["Paragraph text", "", "%%a note%%"]);
	});

	it("stacks a second note directly under the first", () => {
		const editor = new MockEditor({ lines: ["P", "", "%%first%%"] });
		appendAnnotation(asEditor(editor), 0, "second");
		expect(editor.lines).toEqual(["P", "", "%%first%%", "%%second%%"]);
	});

	it("appends after legacy immediate annotations (no blank line)", () => {
		const editor = new MockEditor({ lines: ["P", "%%first%%"] });
		appendAnnotation(asEditor(editor), 0, "second");
		expect(editor.lines).toEqual(["P", "%%first%%", "%%second%%"]);
	});

	it("collapses newlines in the note", () => {
		const editor = new MockEditor({ lines: ["P"] });
		appendAnnotation(asEditor(editor), 0, "line1\nline2");
		expect(editor.lines).toEqual(["P", "", "%%line1 line2%%"]);
	});

	it("ignores an empty note", () => {
		const editor = new MockEditor({ lines: ["P"] });
		appendAnnotation(asEditor(editor), 0, "   ");
		expect(editor.lines).toEqual(["P"]);
	});
});

describe("replaceParagraphAndRemoveAnnotations", () => {
	it("replaces paragraph and removes annotation lines", () => {
		const editor = new MockEditor({ lines: ["P", "%%a%%", "%%b%%"] });
		replaceParagraphAndRemoveAnnotations(asEditor(editor), 0, 0, [1, 2], "rewritten");
		expect(editor.lines).toEqual(["rewritten"]);
	});

	it("replaces only the paragraph when no annotations", () => {
		const editor = new MockEditor({ lines: ["P", "next"] });
		replaceParagraphAndRemoveAnnotations(asEditor(editor), 0, 0, [], "rewritten");
		expect(editor.lines).toEqual(["rewritten", "next"]);
	});

	it("replaces a multi-line paragraph and its annotations", () => {
		const editor = new MockEditor({ lines: ["L1", "L2", "%%a%%", "after"] });
		replaceParagraphAndRemoveAnnotations(asEditor(editor), 0, 1, [2], "new");
		expect(editor.lines).toEqual(["new", "after"]);
	});

	it("removes the paragraph, blank separator, and annotations together", () => {
		const editor = new MockEditor({ lines: ["P", "", "%%a%%", "after"] });
		replaceParagraphAndRemoveAnnotations(asEditor(editor), 0, 0, [2], "new");
		expect(editor.lines).toEqual(["new", "after"]);
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
