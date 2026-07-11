import type { App } from "obsidian";
import type { CooSettings } from "./types";
import {
	chatCompletion,
	registerNote,
	CooApiError,
	type ResponseResult,
} from "./ai-client";

/**
 * Per-note conversation chaining via OpenAI's stored `previous_response_id`.
 *
 * Each note's chain head (the latest response_id) is stored in a plugin-side
 * JSON file keyed by note path. On the first Ask for a note, the whole note is
 * registered (priming call, store: true) to obtain R0; each Ask then chains from
 * the stored head and advances it.
 *
 * Notes are live and editable, so the registered snapshot can go stale. The
 * "re-register" command captures a fresh snapshot and resets the chain.
 */

const CHAIN_FILE = "chain-data.json";

type ChainMap = Record<string, string>;

function chainFilePath(pluginDir: string): string {
	return `${pluginDir}/${CHAIN_FILE}`;
}

async function readMap(
	app: App,
	pluginDir: string,
): Promise<ChainMap> {
	const adapter = app.vault.adapter;
	const path = chainFilePath(pluginDir);
	if (!(await adapter.exists(path))) return {};
	try {
		const raw = await adapter.read(path);
		const parsed = JSON.parse(raw) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as ChainMap;
		}
		return {};
	} catch {
		return {};
	}
}

async function writeMap(
	app: App,
	pluginDir: string,
	map: ChainMap,
): Promise<void> {
	const path = chainFilePath(pluginDir);
	await app.vault.adapter.write(path, JSON.stringify(map, null, 2));
}

/** Get the current chain head (latest response_id) for a note, if any. */
export async function getChainHead(
	app: App,
	pluginDir: string,
	notePath: string,
): Promise<string | undefined> {
	const map = await readMap(app, pluginDir);
	return map[notePath];
}

/** Advance the chain head for a note. */
export async function setChainHead(
	app: App,
	pluginDir: string,
	notePath: string,
	responseId: string,
): Promise<void> {
	const map = await readMap(app, pluginDir);
	map[notePath] = responseId;
	await writeMap(app, pluginDir, map);
}

/** Clear the chain for a note (next Ask will re-register from scratch). */
export async function clearChain(
	app: App,
	pluginDir: string,
	notePath: string,
): Promise<void> {
	const map = await readMap(app, pluginDir);
	if (!(notePath in map)) return;
	delete map[notePath];
	await writeMap(app, pluginDir, map);
}

export interface AskChainedParams {
	app: App;
	pluginDir: string;
	notePath: string;
	/** Full note text, used to register the note on first Ask / re-register. */
	noteText: string;
	settings: CooSettings;
	systemPrompt: string;
	userPrompt: string;
}

/**
 * Run an Ask, transparently registering the note on first use and chaining
 * from the stored head. If a chained call is rejected (HTTP 400 — typically an
 * expired/invalid response_id after OpenAI evicts the stored response), the
 * chain is reset and the Ask is retried once from a fresh registration.
 */
export async function askChained(params: AskChainedParams): Promise<ResponseResult> {
	const { app, pluginDir, notePath, noteText, settings, systemPrompt, userPrompt } = params;

	let head = await getChainHead(app, pluginDir, notePath);
	if (!head) {
		head = await registerNote(settings, noteText);
		await setChainHead(app, pluginDir, notePath, head);
	}

	const askParams = {
		settings,
		systemPrompt,
		userPrompt,
		previousResponseId: head,
		// Reasoning + web search follow the user's settings (Ask only — Rewrite/Translate are pinned off).
		webSearchEnabled: settings.webSearchEnabled,
	};

	try {
		const result = await chatCompletion(askParams);
		await setChainHead(app, pluginDir, notePath, result.responseId);
		return result;
	} catch (err) {
		if (err instanceof CooApiError && err.status === 400) {
			// Stale/expired response_id — re-register and retry once.
			const newHead = await registerNote(settings, noteText);
			await setChainHead(app, pluginDir, notePath, newHead);
			const retry = await chatCompletion({ ...askParams, previousResponseId: newHead });
			await setChainHead(app, pluginDir, notePath, retry.responseId);
			return retry;
		}
		throw err;
	}
}

/**
 * Re-register the note: capture a fresh snapshot and reset the chain.
 * Used by the explicit "re-register note" command when the note has changed
 * substantially and the registered context has gone stale.
 */
export async function reRegisterNote(
	app: App,
	pluginDir: string,
	notePath: string,
	noteText: string,
	settings: CooSettings,
): Promise<string> {
	const head = await registerNote(settings, noteText);
	await setChainHead(app, pluginDir, notePath, head);
	return head;
}
