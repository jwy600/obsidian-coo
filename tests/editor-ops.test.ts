import { describe, it, expect, vi } from "vitest";
import type { Editor } from "obsidian";
import {
	parseAnnotations,
	formatAnnotations,
	findParagraphBounds,
	findParagraphBoundsNear,
	extractMarkdownPrefix,
	findAnnotationLine,
	getParagraphText,
	extractInstruction,
	gatherSurroundingContext,
	formatInspireResponse,
	replaceParagraphWithInspiration,
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

	it("treats unordered list item as individual paragraph", () => {
		const editor = createMockEditor(["- item 1", "- item 2", "- item 3"]);
		expect(findParagraphBounds(editor, 1)).toEqual({
			startLine: 1,
			endLine: 1,
		});
	});

	it("treats ordered list item as individual paragraph", () => {
		const editor = createMockEditor(["1. first", "2. second", "3. third"]);
		expect(findParagraphBounds(editor, 0)).toEqual({
			startLine: 0,
			endLine: 0,
		});
	});

	it("treats indented list item as individual paragraph", () => {
		const editor = createMockEditor(["- parent", "  - child", "- sibling"]);
		expect(findParagraphBounds(editor, 1)).toEqual({
			startLine: 1,
			endLine: 1,
		});
	});

	it("treats * and + list markers as list items", () => {
		const editor = createMockEditor(["* star item", "+ plus item"]);
		expect(findParagraphBounds(editor, 0)).toEqual({
			startLine: 0,
			endLine: 0,
		});
		expect(findParagraphBounds(editor, 1)).toEqual({
			startLine: 1,
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

	it("finds list item above annotation line", () => {
		const editor = createMockEditor([
			"- item 1",
			"- item 2",
			"%%notes%%",
			"- item 3",
		]);
		expect(findParagraphBoundsNear(editor, 2)).toEqual({
			startLine: 1,
			endLine: 1,
		});
	});
});

describe("extractMarkdownPrefix", () => {
	it("extracts unordered list marker '- '", () => {
		const result = extractMarkdownPrefix("- some item");
		expect(result).toEqual({ prefix: "- ", content: "some item" });
	});

	it("extracts '* ' list marker", () => {
		const result = extractMarkdownPrefix("* star item");
		expect(result).toEqual({ prefix: "* ", content: "star item" });
	});

	it("extracts '+ ' list marker", () => {
		const result = extractMarkdownPrefix("+ plus item");
		expect(result).toEqual({ prefix: "+ ", content: "plus item" });
	});

	it("extracts ordered list marker", () => {
		const result = extractMarkdownPrefix("1. first item");
		expect(result).toEqual({ prefix: "1. ", content: "first item" });
	});

	it("extracts indented list marker", () => {
		const result = extractMarkdownPrefix("  - nested item");
		expect(result).toEqual({ prefix: "  - ", content: "nested item" });
	});

	it("extracts heading prefix", () => {
		const result = extractMarkdownPrefix("## My heading");
		expect(result).toEqual({ prefix: "## ", content: "My heading" });
	});

	it("extracts blockquote prefix", () => {
		const result = extractMarkdownPrefix("> quoted text");
		expect(result).toEqual({ prefix: "> ", content: "quoted text" });
	});

	it("returns empty prefix for plain text", () => {
		const result = extractMarkdownPrefix("Just regular text");
		expect(result).toEqual({ prefix: "", content: "Just regular text" });
	});

	it("returns empty prefix for empty string", () => {
		const result = extractMarkdownPrefix("");
		expect(result).toEqual({ prefix: "", content: "" });
	});

	it("does not match mid-line dashes", () => {
		const result = extractMarkdownPrefix("some - text");
		expect(result).toEqual({ prefix: "", content: "some - text" });
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

describe("gatherSurroundingContext", () => {
	it("includes heading and lines before paragraph", () => {
		const editor = createMockEditor([
			"## My Section",
			"Some intro text.",
			"Target paragraph",
			"After text",
		]);
		const result = gatherSurroundingContext(editor, 2, 2);
		expect(result).toContain("## My Section");
		expect(result).toContain("Some intro text.");
		expect(result).toContain("After text");
		expect(result).not.toContain("Target paragraph");
	});

	it("returns empty string when paragraph is alone", () => {
		const editor = createMockEditor(["Only line"]);
		const result = gatherSurroundingContext(editor, 0, 0);
		expect(result).toBe("");
	});

	it("includes heading even when far above (beyond 10-line window)", () => {
		const lines = ["## Far Heading"];
		for (let i = 0; i < 15; i++) lines.push(`Line ${i}`);
		lines.push("Target paragraph");
		const editor = createMockEditor(lines);
		const result = gatherSurroundingContext(
			editor,
			lines.length - 1,
			lines.length - 1,
		);
		expect(result).toContain("## Far Heading");
	});

	it("includes lines after paragraph up to 5 lines", () => {
		const lines = [
			"Target paragraph",
			"After 1",
			"After 2",
			"After 3",
			"After 4",
			"After 5",
			"After 6",
			"After 7",
		];
		const editor = createMockEditor(lines);
		const result = gatherSurroundingContext(editor, 0, 0);
		expect(result).toContain("After 5");
		expect(result).not.toContain("After 6");
	});

	it("does not duplicate heading when within 10-line window", () => {
		const editor = createMockEditor([
			"## Heading",
			"Before text",
			"Target paragraph",
		]);
		const result = gatherSurroundingContext(editor, 2, 2);
		const headingCount = (result.match(/## Heading/g) ?? []).length;
		expect(headingCount).toBe(1);
	});
});

describe("extractInstruction", () => {
	it("extracts instruction from end of text", () => {
		const result = extractInstruction("Some text {explain this}");
		expect(result).toEqual({
			cleanedText: "Some text",
			instruction: "explain this",
		});
	});

	it("extracts last instruction when multiple present", () => {
		const result = extractInstruction("A {first} B {second}");
		expect(result).toEqual({
			cleanedText: "A {first} B",
			instruction: "second",
		});
	});

	it("returns null when no instruction present", () => {
		expect(extractInstruction("No braces here")).toBeNull();
	});

	it("returns null for empty braces", () => {
		expect(extractInstruction("Text {}")).toBeNull();
	});

	it("returns null for whitespace-only braces", () => {
		expect(extractInstruction("Text {   }")).toBeNull();
	});

	it("preserves list item prefix", () => {
		const result = extractInstruction("* Item text {do something}");
		expect(result).toEqual({
			cleanedText: "* Item text",
			instruction: "do something",
		});
	});

	it("preserves indented list item prefix", () => {
		const result = extractInstruction("  - Nested item {explain}");
		expect(result).toEqual({
			cleanedText: "  - Nested item",
			instruction: "explain",
		});
	});

	it("preserves ordered list prefix", () => {
		const result = extractInstruction("1. First item {expand}");
		expect(result).toEqual({
			cleanedText: "1. First item",
			instruction: "expand",
		});
	});

	it("trims instruction whitespace", () => {
		const result = extractInstruction("Text {  spaces inside  }");
		expect(result).toEqual({
			cleanedText: "Text",
			instruction: "spaces inside",
		});
	});

	it("trims trailing whitespace from cleaned text", () => {
		const result = extractInstruction("Word   {instruction}   ");
		expect(result).toEqual({
			cleanedText: "Word",
			instruction: "instruction",
		});
	});
});

describe("formatInspireResponse", () => {
	it("formats bullet lines with zero indent", () => {
		const result = formatInspireResponse("- Point one\n- Point two", 0);
		expect(result).toEqual(["- Point one", "- Point two"]);
	});

	it("adds indentation to bullet lines", () => {
		const result = formatInspireResponse("- Point one\n- Point two", 2);
		expect(result).toEqual(["  - Point one", "  - Point two"]);
	});

	it("adds '- ' prefix to lines missing it", () => {
		const result = formatInspireResponse("No marker\n- With marker", 0);
		expect(result).toEqual(["- No marker", "- With marker"]);
	});

	it("filters empty lines", () => {
		const result = formatInspireResponse("- One\n\n- Two\n\n", 0);
		expect(result).toEqual(["- One", "- Two"]);
	});

	it("trims whitespace from each line", () => {
		const result = formatInspireResponse("  - Spaced  \n  - Also  ", 0);
		expect(result).toEqual(["- Spaced", "- Also"]);
	});

	it("returns empty array for empty response", () => {
		expect(formatInspireResponse("", 0)).toEqual([]);
	});

	it("uses correct indent for ordered list prefix length", () => {
		const result = formatInspireResponse("- Bullet", 3);
		expect(result).toEqual(["   - Bullet"]);
	});
});

describe("replaceParagraphWithInspiration", () => {
	it("replaces paragraph and appends bullet lines", () => {
		const lines = ["Original text", "Next line"];
		const editor = createMockEditor(lines);
		const replaceRangeSpy = vi.fn();
		(editor as unknown as Record<string, unknown>).replaceRange =
			replaceRangeSpy;

		replaceParagraphWithInspiration(editor, 0, 0, "Cleaned text", [
			"- Bullet one",
			"- Bullet two",
		]);

		expect(replaceRangeSpy).toHaveBeenCalledOnce();
		expect(replaceRangeSpy).toHaveBeenCalledWith(
			"Cleaned text\n- Bullet one\n- Bullet two",
			{ line: 0, ch: 0 },
			{ line: 0, ch: "Original text".length },
		);
	});

	it("handles multi-line paragraph replacement", () => {
		const lines = ["Line one", "Line two", "Next para"];
		const editor = createMockEditor(lines);
		const replaceRangeSpy = vi.fn();
		(editor as unknown as Record<string, unknown>).replaceRange =
			replaceRangeSpy;

		replaceParagraphWithInspiration(editor, 0, 1, "New text", [
			"  - Nested bullet",
		]);

		expect(replaceRangeSpy).toHaveBeenCalledWith(
			"New text\n  - Nested bullet",
			{ line: 0, ch: 0 },
			{ line: 1, ch: "Line two".length },
		);
	});
});
