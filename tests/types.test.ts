import { describe, it, expect } from "vitest";
import {
	DEFAULT_ASK_QUESTION,
	getDefaultAskQuestion,
} from "../src/types";

const RESPONSE_LANGUAGES = ["en", "es", "fr", "zh", "ja"] as const;

describe("DEFAULT_ASK_QUESTION", () => {
	it("has a non-empty question for every response language", () => {
		for (const lang of RESPONSE_LANGUAGES) {
			expect(DEFAULT_ASK_QUESTION[lang].trim().length).toBeGreaterThan(0);
		}
	});

	it("uses the expected localized questions", () => {
		expect(DEFAULT_ASK_QUESTION.en).toBe("What does this mean?");
		expect(DEFAULT_ASK_QUESTION.es).toBe("¿Qué significa esto?");
		expect(DEFAULT_ASK_QUESTION.fr).toBe("Qu'est-ce que ça veut dire ?");
		expect(DEFAULT_ASK_QUESTION.zh).toBe("这是什么意思？");
		expect(DEFAULT_ASK_QUESTION.ja).toBe("どういう意味？");
	});
});

describe("getDefaultAskQuestion", () => {
	it("embeds the selection in quotes when there is one", () => {
		expect(getDefaultAskQuestion("en", "entropy")).toBe(
			'What does "entropy" mean?',
		);
	});

	it("trims surrounding whitespace before embedding", () => {
		expect(getDefaultAskQuestion("en", "  entropy  ")).toBe(
			'What does "entropy" mean?',
		);
	});

	it("falls back to the generic question with no selection", () => {
		expect(getDefaultAskQuestion("en", "")).toBe("What does this mean?");
		expect(getDefaultAskQuestion("en", "   ")).toBe("What does this mean?");
	});

	it("interpolates the selection in every language", () => {
		expect(getDefaultAskQuestion("es", "entropy")).toBe(
			'¿Qué significa "entropy"?',
		);
		expect(getDefaultAskQuestion("fr", "entropy")).toBe(
			'Que signifie « entropy » ?',
		);
		expect(getDefaultAskQuestion("zh", "熵")).toBe("“熵”是什么意思？");
		expect(getDefaultAskQuestion("ja", "エントロピー")).toBe(
			"「エントロピー」はどういう意味？",
		);
	});

	it("collapses multi-line selections onto one line", () => {
		expect(getDefaultAskQuestion("en", "rough\nidea\nspread out")).toBe(
			'What does "rough idea spread out" mean?',
		);
	});

	it("truncates long selections with an ellipsis", () => {
		const long = "a".repeat(80);
		const result = getDefaultAskQuestion("en", long);
		expect(result).toBe(
			`What does "${"a".repeat(60)}…" mean?`,
		);
	});
});
