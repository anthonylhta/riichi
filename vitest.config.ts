import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	plugins: [wasm()],
	// SvelteKit's $lib alias, so store modules (src/lib/stores/*) are testable.
	resolve: {
		alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) }
	},
	test: {
		environment: 'node',
		// riichi-rs-bundlers ships a bundler-target WASM build; inline it so the
		// vite-plugin-wasm transform handles the .wasm import instead of Node's
		// native ESM loader (which rejects ".wasm" extensions).
		server: {
			deps: {
				inline: ['riichi-rs-bundlers']
			}
		}
	}
});
