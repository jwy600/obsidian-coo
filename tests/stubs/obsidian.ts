// Minimal runtime stub of the "obsidian" module for unit tests.
//
// Source modules import type-only symbols (e.g. `import type { App }`) which
// are erased and never reach here. Only runtime values actually imported by
// code under test need to exist — currently just `requestUrl`, used by
// ai-client.ts. None of the tested code paths call it, so it throws if invoked.
export function requestUrl(): Promise<unknown> {
	throw new Error(
		"obsidian.requestUrl is stubbed and must not be called in unit tests.",
	);
}
