<script lang="ts">
	import type { GameTile } from '$lib/game/tiles';
	import TileFace from './TileFace.svelte';

	type Variant = 'hand' | 'pond' | 'meld' | 'dora';

	let {
		tile = null,
		variant = 'pond',
		back = false,
		selected = false,
		clickable = false,
		disabled = false,
		riichiTrigger = false,
		highlight = false,
		dimmed = false,
		recent = false,
		rotated = false,
		onclick = undefined,
		onmouseenter = undefined,
		onmouseleave = undefined
	}: {
		tile?: GameTile | null;
		variant?: Variant;
		back?: boolean;
		selected?: boolean;
		clickable?: boolean;
		disabled?: boolean;
		riichiTrigger?: boolean;
		highlight?: boolean;
		dimmed?: boolean;
		recent?: boolean;
		rotated?: boolean;
		onclick?: (() => void) | undefined;
		onmouseenter?: (() => void) | undefined;
		onmouseleave?: (() => void) | undefined;
	} = $props();
</script>

{#if back}
	<div class="tile tile-back variant-{variant}" class:rotated></div>
{:else if tile}
	{@const cls = `tile tile-face variant-${variant}`}
	{#if onclick}
		<button
			class={cls}
			class:selected
			class:clickable
			class:riichi-trigger={riichiTrigger}
			class:highlight
			class:dimmed
			class:red={tile.isRed}
			{disabled}
			{onclick}
			{onmouseenter}
			{onmouseleave}
		>
			<TileFace code={tile.code} red={tile.isRed} />
		</button>
	{:else}
		<div class={cls} class:highlight class:dimmed class:recent class:rotated class:red={tile.isRed}>
			<TileFace code={tile.code} red={tile.isRed} />
		</div>
	{/if}
{/if}

<style>
	.tile {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		border-radius: 5px;
		user-select: none;
		flex: none;
	}

	/* Ivory tile face — light surface so tiles read against the dark table */
	.tile-face {
		background: linear-gradient(168deg, #f7f2e8 0%, #efe6d4 58%, #e4d9c3 100%);
		color: #2b2b2b;
		border: 1px solid #cfc4ac;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.8),
			0 2px 0 #b9ae96,
			0 3px 5px rgba(0, 0, 0, 0.45);
		transition:
			transform 0.1s ease,
			box-shadow 0.12s ease,
			filter 0.12s ease;
	}

	/* Face-down tile (concealed opponent hands) */
	.tile-back {
		background: linear-gradient(168deg, #243042 0%, #1b2436 100%);
		border: 1px solid #313c52;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.06),
			0 2px 0 #141a28,
			0 3px 4px rgba(0, 0, 0, 0.4);
	}

	/* Sizes per variant */
	.variant-hand {
		width: 44px;
		height: 60px;
	}
	.variant-pond {
		width: 26px;
		height: 34px;
	}
	.variant-meld {
		width: 24px;
		height: 32px;
	}
	.variant-dora {
		width: 32px;
		height: 44px;
	}
	.tile-back.variant-pond {
		width: 20px;
		height: 28px;
	}

	/* Aka dora (red five) — the SVG face already renders its art in crimson; we keep a
	   small red dot in the top-right corner as a second, at-a-glance marker. */
	.red {
		position: relative;
	}
	.red::after {
		content: '';
		position: absolute;
		top: 2px;
		right: 2px;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #c41e3a;
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
	}

	/* Interaction (hand tiles) */
	button.tile {
		padding: 0;
		cursor: default;
	}
	.clickable {
		cursor: pointer;
	}
	.clickable:hover {
		transform: translateY(-7px);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.8),
			0 6px 0 #b9ae96,
			0 8px 10px rgba(0, 0, 0, 0.5);
	}
	.selected {
		transform: translateY(-9px);
		border-color: #c41e3a;
	}
	.riichi-trigger {
		border-color: #c8a020;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.8),
			0 2px 0 #b9ae96,
			0 0 8px rgba(200, 160, 32, 0.65);
	}
	button.tile:disabled {
		cursor: default;
	}

	/* Matching-tile highlight — same tile elsewhere on the table lights up */
	.highlight {
		position: relative;
		outline: 2px solid #f0c842;
		outline-offset: 1px;
		box-shadow: 0 0 8px rgba(240, 200, 66, 0.6);
		z-index: 2;
		filter: brightness(1.12);
	}
	.dimmed {
		filter: brightness(0.62) saturate(0.7);
	}

	/* Most-recent discard — nudged + ringed so the last cut is easy to spot */
	.recent {
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.8),
			0 2px 0 #b9ae96,
			0 0 0 2px rgba(196, 30, 58, 0.7),
			0 3px 5px rgba(0, 0, 0, 0.45);
	}
</style>
