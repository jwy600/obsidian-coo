import { describe, it, expect, vi } from "vitest";
import type { Editor } from "obsidian";
import {
	parseAnnotations,
	formatAnnotations,
	findParagraphBounds,
	findParagraphBoundsNear,
	findAnnotationLine,
	getParagraphText,
} from "../src/editor-ops";

describe("parseAnnotations", () => {
	it("parses comma-separated annotations", () => {
		expect(parseAnnotations("%%a, b, c%%")).toEqual(["a", "b", "c"]);
	});

	it("trims whitespace from each annotation", () => {
		expect(parseAnnotations("%%  foo ,  bar  %%")).toEqual(["foo", "bar"]);
	});

	it("returns empty array for empty annotations", () => {
		expect(parseAnnotations("%%%%")).toEqual([]);
	});

	it("returns empty array for whitespace-only annotations", () => {
		expect(parseAnnotations("%%   %%")).toEqual([]);
	});

	it("handles single annotation", () => {
		expect(parseAnnotations("%%hello%%")).toEqual(["hello"]);
	});

	it("filters out empty entries from trailing commas", () => {
		expect(parseAnnotations("%%a, , b, %%")).toEqual(["a", "b"]);
	});

	it("handles surrounding whitespace on the line", () => {
		expect(parseAnnotations("  %%x, y%%  ")).toEqual(["x", "y"]);
	});
});

describe("formatAnnotations", () => {
	it("formats array into annotation line", () => {
		expect(formatAnnotations(["a", "b", "c"])).toBe("%%a, b, c%%");
	});

	it("formats single annotation", () => {
		expect(formatAnnotations(["hello"])).toBe("%%hello%%");
	});

	it("formats empty array", () => {
		expect(formatAnnotations([])).toBe("%%%%");
	});
});

// Helper to create a mock Editor with line data
function createMockEditor(lines: string[]): Editor {
	return {
		getLine: vi.fn((n: number) => lines[n] ?? ""),
		lineCount: vi.fn(() => lines.length),
	} as unknown as Editor;
}

describe("findParagraphBounds", () => {
	it("finds single-line paragraph", () => {
		const editor = createMockEditor(["", "Hello world", ""]);
		expect(findParagraphBounds(editor, 1)).toEqual({
			startLine: 1,
			endLine: 1,
		});
	});

	it("finds multi-line paragraph", () => {
		const editor = createMockEditor(["Line one", "Line two", "Line three"]);
		expect(findParagraphBounds(editor, 1)).toEqual({
			startLine: 0,
			endLine: 2,
		});
	});

	it("stops at empty lines", () => {
		const editor = createMockEditor([
			"Para one",
			"",
			"Para two line 1",
			"Para two line 2",
			"",
			"Para three",
		]);
		expect(findParagraphBounds(editor, 2)).toEqual({
			startLine: 2,
			endLine: 3,
		});
	});

	it("stops at annotation lines", () => {
		const editor = createMockEditor([
			"Paragraph text",
			"%%some annotation%%",
			"Next paragraph",
		]);
		expect(findParagraphBounds(editor, 0)).toEqual({
			startLine: 0,
			endLine: 0,
		});
	});

	it("returns null for empty line", () => {
		const editor = createMockEditor(["Hello", "", "World"]);
		expect(findParagraphBounds(editor, 1)).toBeNull();
	});

	it("returns null for annotation line", () => {
		const editor = createMockEditor(["Hello", "%%annotation%%", "World"]);
		expect(findParagraphBounds(editor, 1)).toBeNull();
	});

	it("handles first line of document", () => {
		const editor = createMockEditor(["First line", "Second line"]);
		expect(findParagraphBounds(editor, 0)).toEqual({
			startLine: 0,
			endLine: 1,
		});
	});

	it("handles last line of document", () => {
		const editor = createMockEditor(["First line", "Last line"]);
		expect(findParagraphBounds(editor, 1)).toEqual({
			startLine: 0,
			endLine: 1,
		});
	});
});

describe("findAnnotationLine", () => {
	it("finds annotation on next line", () => {
		const editor = createMockEditor(["Paragraph", "%%note%%"]);
		expect(findAnnotationLine(editor, 0)).toBe(1);
	});

	it("returns null when next line is not annotation", () => {
		const editor = createMockEditor(["Paragraph", "Not an annotation"]);
		expect(findAnnotationLine(editor, 0)).toBeNull();
	});

	it("returns null when paragraph is last line", () => {
		const editor = createMockEditor(["Paragraph"]);
		expect(findAnnotationLine(editor, 0)).toBeNull();
	});

	it("returns null when next line is empty", () => {
		const editor = createMockEditor(["Paragraph", "", "%%annotation%%"]);
		expect(findAnnotationLine(editor, 0)).toBeNull();
	});
});

describe("findParagraphBoundsNear", () => {
	it("returns paragraph bounds when cursor is on a paragraph", () => {
		const editor = createMockEditor(["Paragraph text", "%%annotation%%"]);
		expect(findParagraphBoundsNear(editor, 0)).toEqual({
			startLine: 0,
			endLine: 0,
		});
	});

	it("finds paragraph above when cursor is on annotation line", () => {
		const editor = createMockEditor(["Paragraph text", "%%annotation%%"]);
		expect(findParagraphBoundsNear(editor, 1)).toEqual({
			startLine: 0,
			endLine: 0,
		});
	});

	it("finds multi-line paragraph above annotation line", () => {
		const editor = createMockEditor([
			"",
			"Line one",
			"Line two",
			"%%notes%%",
			"",
		]);
		expect(findParagraphBoundsNear(editor, 3)).toEqual({
			startLine: 1,
			endLine: 2,
		});
	});

	it("returns null for empty line (no annotation fallback)", () => {
		const editor = createMockEditor(["Hello", "", "World"]);
		expect(findParagraphBoundsNear(editor, 1)).toBeNull();
	});

	it("returns null for annotation on first line (no line above)", () => {
		const editor = createMockEditor(["%%orphan annotation%%", "Text"]);
		expect(findParagraphBoundsNear(editor, 0)).toBeNull();
	});

	it("returns null when annotation has empty line above", () => {
		const editor = createMockEditor([
			"Paragraph",
			"",
			"%%detached annotation%%",
		]);
		expect(findParagraphBoundsNear(editor, 2)).toBeNull();
	});
});

describe("getParagraphText", () => {
	it("returns single line", () => {
		const editor = createMockEditor(["Hello", "World", "Foo"]);
		expect(getParagraphText(editor, 1, 1)).toBe("World");
	});

	it("returns multiple lines joined", () => {
		const editor = createMockEditor(["Line 1", "Line 2", "Line 3"]);
		expect(getParagraphText(editor, 0, 2)).toBe("Line 1\nLine 2\nLine 3");
	});
});
