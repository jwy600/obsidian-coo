import { describe, it, expect } from "vitest";
import { parseResponse, CooApiError } from "../src/ai-client";

describe("parseResponse", () => {
	it("extracts responseId from top-level id and text from output_text", () => {
		const response = JSON.stringify({
			id: "resp_abc123",
			output_text: "  Hello world  ",
		});
		const result = parseResponse(response);
		expect(result.responseId).toBe("resp_abc123");
		expect(result.text).toBe("Hello world");
	});

	it("extracts text from output array when output_text is missing", () => {
		const response = JSON.stringify({
			id: "resp_1",
			output: [
				{
					type: "message",
					content: [
						{ type: "output_text", text: "  Nested response  " },
					],
				},
			],
		});
		const result = parseResponse(response);
		expect(result.responseId).toBe("resp_1");
		expect(result.text).toBe("Nested response");
	});

	it("prefers output_text over output array", () => {
		const response = JSON.stringify({
			id: "resp_2",
			output_text: "Top level",
			output: [
				{
					type: "message",
					content: [{ type: "output_text", text: "Nested" }],
				},
			],
		});
		expect(parseResponse(response).text).toBe("Top level");
	});

	it("skips non-message items in output array", () => {
		const response = JSON.stringify({
			id: "resp_3",
			output: [
				{ type: "tool_call", content: [] },
				{
					type: "message",
					content: [{ type: "output_text", text: "Found it" }],
				},
			],
		});
		expect(parseResponse(response).text).toBe("Found it");
	});

	it("skips non-output_text content blocks", () => {
		const response = JSON.stringify({
			id: "resp_4",
			output: [
				{
					type: "message",
					content: [
						{ type: "refusal", text: "No" },
						{ type: "output_text", text: "Actual text" },
					],
				},
			],
		});
		expect(parseResponse(response).text).toBe("Actual text");
	});

	it("returns empty text (not throw) when no text is found", () => {
		const response = JSON.stringify({ id: "resp_5", output: [] });
		const result = parseResponse(response);
		expect(result.text).toBe("");
		expect(result.responseId).toBe("resp_5");
	});

	it("returns empty text when output_text is only whitespace", () => {
		const response = JSON.stringify({ id: "resp_6", output_text: "   " });
		expect(parseResponse(response).text).toBe("");
	});

	it("still returns responseId when text is empty", () => {
		const response = JSON.stringify({
			id: "resp_7",
			output: [
				{
					type: "message",
					content: [{ type: "output_text", text: "   " }],
				},
			],
		});
		const result = parseResponse(response);
		expect(result.text).toBe("");
		expect(result.responseId).toBe("resp_7");
	});

	it("returns empty responseId when id is missing", () => {
		const response = JSON.stringify({ output_text: "Hi" });
		expect(parseResponse(response).responseId).toBe("");
	});

	it("throws on invalid JSON", () => {
		expect(() => parseResponse("not json")).toThrow();
	});
});

describe("CooApiError", () => {
	it("carries the HTTP status", () => {
		const err = new CooApiError(400, "Bad request: nope");
		expect(err.status).toBe(400);
		expect(err.message).toContain("Bad request");
		expect(err).toBeInstanceOf(Error);
	});
});
