import type { ResponseLanguage, TranslateLanguage } from "./types";
import { TRANSLATE_TO_RESPONSE_MAP } from "./types";

/** Map Obsidian's locale string to a ResponseLanguage code. */
export function mapLocaleToResponseLanguage(
	locale: string,
): ResponseLanguage {
	const lower = locale.toLowerCase();
	if (lower.startsWith("zh")) return "zh";
	if (lower.startsWith("ja")) return "ja";
	if (lower.startsWith("es")) return "es";
	if (lower.startsWith("fr")) return "fr";
	return "en";
}

/** Detect Obsidian's locale and map it to a ResponseLanguage. */
export function detectObsidianLocale(): ResponseLanguage {
	// moment.locale() returns the current Obsidian UI locale
	const locale =
		typeof window !== "undefined" && window.moment
			? window.moment.locale()
			: "en";
	return mapLocaleToResponseLanguage(locale);
}

/** Check if the response language and translate language conflict (same language). */
export function isLanguageConflict(
	responseLang: ResponseLanguage,
	translateLang: TranslateLanguage,
): boolean {
	return TRANSLATE_TO_RESPONSE_MAP[translateLang] === responseLang;
}

/** Get a sensible default translate language that doesn't conflict with the response language. */
export function getDefaultTranslateLanguage(
	responseLang: ResponseLanguage,
): TranslateLanguage {
	if (responseLang === "en") return "Chinese";
	return "English";
}
