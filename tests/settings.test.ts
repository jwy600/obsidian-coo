import { describe, it, expect } from "vitest";
import {
	mapLocaleToResponseLanguage,
	isLanguageConflict,
	getDefaultTranslateLanguage,
} from "../src/settings-utils";

describe("mapLocaleToResponseLanguage", () => {
	it('maps "en" to "en"', () => {
		expect(mapLocaleToResponseLanguage("en")).toBe("en");
	});

	it('maps "en-US" to "en"', () => {
		expect(mapLocaleToResponseLanguage("en-US")).toBe("en");
	});

	it('maps "zh" to "zh"', () => {
		expect(mapLocaleToResponseLanguage("zh")).toBe("zh");
	});

	it('maps "zh-CN" to "zh"', () => {
		expect(mapLocaleToResponseLanguage("zh-CN")).toBe("zh");
	});

	it('maps "zh-TW" to "zh"', () => {
		expect(mapLocaleToResponseLanguage("zh-TW")).toBe("zh");
	});

	it('maps "ja" to "ja"', () => {
		expect(mapLocaleToResponseLanguage("ja")).toBe("ja");
	});

	it('maps "es" to "es"', () => {
		expect(mapLocaleToResponseLanguage("es")).toBe("es");
	});

	it('maps "es-MX" to "es"', () => {
		expect(mapLocaleToResponseLanguage("es-MX")).toBe("es");
	});

	it('maps "fr" to "fr"', () => {
		expect(mapLocaleToResponseLanguage("fr")).toBe("fr");
	});

	it('maps "fr-CA" to "fr"', () => {
		expect(mapLocaleToResponseLanguage("fr-CA")).toBe("fr");
	});

	it('falls back to "en" for unknown locale', () => {
		expect(mapLocaleToResponseLanguage("de")).toBe("en");
	});

	it('falls back to "en" for empty string', () => {
		expect(mapLocaleToResponseLanguage("")).toBe("en");
	});

	it("is case-insensitive", () => {
		expect(mapLocaleToResponseLanguage("ZH-CN")).toBe("zh");
		expect(mapLocaleToResponseLanguage("JA")).toBe("ja");
	});
});

describe("isLanguageConflict", () => {
	it("detects English response with English translate as conflict", () => {
		expect(isLanguageConflict("en", "English")).toBe(true);
	});

	it("detects Chinese response with Chinese translate as conflict", () => {
		expect(isLanguageConflict("zh", "Chinese")).toBe(true);
	});

	it("detects Japanese response with Japanese translate as conflict", () => {
		expect(isLanguageConflict("ja", "Japanese")).toBe(true);
	});

	it("detects Spanish response with Spanish translate as conflict", () => {
		expect(isLanguageConflict("es", "Spanish")).toBe(true);
	});

	it("detects French response with French translate as conflict", () => {
		expect(isLanguageConflict("fr", "French")).toBe(true);
	});

	it("returns false for English response with Chinese translate", () => {
		expect(isLanguageConflict("en", "Chinese")).toBe(false);
	});

	it("returns false for Chinese response with English translate", () => {
		expect(isLanguageConflict("zh", "English")).toBe(false);
	});

	it("returns false for Japanese response with French translate", () => {
		expect(isLanguageConflict("ja", "French")).toBe(false);
	});
});

describe("getDefaultTranslateLanguage", () => {
	it("returns Chinese for English response language", () => {
		expect(getDefaultTranslateLanguage("en")).toBe("Chinese");
	});

	it("returns English for Chinese response language", () => {
		expect(getDefaultTranslateLanguage("zh")).toBe("English");
	});

	it("returns English for Japanese response language", () => {
		expect(getDefaultTranslateLanguage("ja")).toBe("English");
	});

	it("returns English for Spanish response language", () => {
		expect(getDefaultTranslateLanguage("es")).toBe("English");
	});

	it("returns English for French response language", () => {
		expect(getDefaultTranslateLanguage("fr")).toBe("English");
	});
});
