import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
	plugins: [wasm()],
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
