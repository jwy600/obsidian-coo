import { describe, it, expect } from "vitest";
import { DEFAULT_ASK_QUESTION } from "../src/types";

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
