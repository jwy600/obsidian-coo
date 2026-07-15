import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: [
			{
				// Alias the "obsidian" package to a minimal stub so source modules
				// that import a runtime value (e.g. requestUrl) load under vitest.
				// Type-only imports are erased and never reach here.
				find: /^obsidian$/,
				replacement: `${import.meta.dirname}/tests/stubs/obsidian.ts`,
			},
		],
	},
	test: {
		include: ['tests/**/*.test.ts'],
	},
});
