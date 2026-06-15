<script lang="ts">
	import { tileFaceSvg } from '$lib/game/tileFace';
	import type { TileCode } from '$lib/game/tiles';

	let { code, red = false }: { code: TileCode; red?: boolean } = $props();

	const svg = $derived(tileFaceSvg(code, red));
</script>

<!-- Trusted, code-derived SVG markup (no user input) -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html svg}
