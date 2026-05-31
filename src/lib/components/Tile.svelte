<script lang="ts">
	import { tileLabel, getSuit, getValue } from '$lib/game/tiles';
	import type { GameTile } from '$lib/game/tiles';

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

	// Per-tile colour: number suits by colour, dragons split (white/green/red).
	function colorClass(code: number): string {
		const suit = getSuit(code as never);
		if (suit !== 'dragon') return suit;
		const v = getValue(code as never);
		return v === 1 ? 'haku' : v === 2 ? 'hatsu' : 'chun';
	}
</script>

{#if back}
	<div class="tile tile-back variant-{variant}" class:rotated></div>
{:else if tile}
	{@const cls = `tile tile-face variant-${variant} color-${colorClass(tile.code)}`}
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
			<span class="label">{tileLabel(tile.code)}</span>
		</button>
	{:else}
		<div class={cls} class:highlight class:dimmed class:recent class:rotated class:red={tile.isRed}>
			<span class="label">{tileLabel(tile.code)}</span>
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
		font-weight: 700;
		user-select: none;
		flex: none;
		font-family: 'Inter', system-ui, sans-serif;
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

	.label {
		line-height: 1;
		transform: translateY(-1px);
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
		font-size: 1.05rem;
	}
	.variant-pond {
		width: 26px;
		height: 34px;
		font-size: 0.72rem;
	}
	.variant-meld {
		width: 24px;
		height: 32px;
		font-size: 0.7rem;
	}
	.variant-dora {
		width: 32px;
		height: 44px;
		font-size: 0.85rem;
	}
	.tile-back.variant-pond {
		width: 20px;
		height: 28px;
	}

	/* Suit / honour colours, tuned for legibility on the ivory face */
	.color-man .label {
		color: #b3242b;
	}
	.color-pin .label {
		color: #1763b8;
	}
	.color-sou .label {
		color: #1f7a34;
	}
	.color-wind .label {
		color: #2b2b2b;
	}
	.color-haku .label {
		color: #2f6fae;
	}
	.color-hatsu .label {
		color: #1f7a34;
	}
	.color-chun .label {
		color: #c41e3a;
	}

	/* Aka dora (red five) — crimson tint + glow, number forced crimson */
	.red {
		background: linear-gradient(168deg, #fbeef0 0%, #f3dadf 100%);
		border-color: #c41e3a;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.7),
			0 2px 0 #a8909a,
			0 0 7px rgba(196, 30, 58, 0.6);
	}
	.red .label {
		color: #c41e3a;
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
