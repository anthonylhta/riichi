<script lang="ts">
	import Tile from '$lib/components/Tile.svelte';
	import { tileLabel, type GameTile } from '$lib/game/tiles';
	import type { ClaimOption } from '$lib/game/types';

	// Claim decision — a non-blocking docked panel so the board stays visible while
	// the player decides whether to ron/pon/chi/kan a discard.
	let {
		discardTile,
		discarderName,
		canRon,
		claimOptions,
		onRon,
		onDaiminkan,
		onPon,
		onChi,
		onPass
	}: {
		discardTile: GameTile | null;
		discarderName: string;
		canRon: boolean;
		claimOptions: ClaimOption[];
		onRon: () => void;
		onDaiminkan: (handTiles: GameTile[]) => void;
		onPon: (handTiles: GameTile[]) => void;
		onChi: (handTiles: GameTile[]) => void;
		onPass: () => void;
	} = $props();
</script>

<div class="claim-panel">
	<div class="claim-head">
		{#if discardTile}
			<Tile tile={discardTile} variant="meld" />
		{/if}
		<span class="claim-title">Claim {discarderName}'s discard?</span>
	</div>
	<div class="claim-actions">
		{#if canRon}
			<button class="claim-btn btn-ron" onclick={onRon}>Ron 栄和</button>
		{/if}
		{#each claimOptions as option, oi (oi)}
			{#if option.type === 'kan'}
				<button class="claim-btn btn-kan" onclick={() => onDaiminkan(option.handTiles)}>
					Kan 槓
				</button>
			{:else if option.type === 'pon'}
				<button class="claim-btn btn-pon" onclick={() => onPon(option.handTiles)}>
					Pon ポン
				</button>
			{:else if option.type === 'chi'}
				<button class="claim-btn btn-chi" onclick={() => onChi(option.handTiles)}>
					Chi チー
					<span class="chi-tiles">
						{tileLabel(option.handTiles[0].code)}·{tileLabel(option.handTiles[1].code)}
					</span>
				</button>
			{/if}
		{/each}
		<button class="claim-btn btn-pass" onclick={onPass}>Pass スキップ</button>
	</div>
</div>

<style>
	.claim-panel {
		position: absolute;
		right: calc(var(--u) * 3);
		bottom: calc(var(--u) * 18);
		z-index: 40;
		display: flex;
		flex-direction: column;
		gap: calc(var(--u) * 1);
		padding: calc(var(--u) * 1.4) calc(var(--u) * 1.6);
		background: rgba(20, 18, 16, 0.96);
		border: 1px solid #3a342c;
		border-radius: calc(var(--u) * 1.2);
		box-shadow: 0 calc(var(--u) * 1) calc(var(--u) * 3) rgba(0, 0, 0, 0.6);
	}

	.claim-head {
		display: flex;
		align-items: center;
		gap: calc(var(--u) * 1);
	}

	.claim-title {
		font-size: calc(var(--u) * 1.7);
		color: #cfc7bb;
		font-weight: 600;
	}

	.claim-actions {
		display: flex;
		flex-wrap: wrap;
		gap: calc(var(--u) * 0.8);
		justify-content: flex-end;
	}

	.claim-btn {
		padding: calc(var(--u) * 0.8) calc(var(--u) * 1.4);
		border: none;
		border-radius: calc(var(--u) * 0.6);
		cursor: pointer;
		font-size: calc(var(--u) * 1.7);
		font-weight: 600;
		transition: opacity 0.15s;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(var(--u) * 0.2);
	}

	.claim-btn:hover {
		opacity: 0.85;
	}

	.btn-ron {
		background: #c41e3a;
		color: #fff;
		min-width: calc(var(--u) * 9);
	}

	.btn-pon {
		background: #b87820;
		color: #fff;
		min-width: calc(var(--u) * 9);
	}

	.btn-chi {
		background: #1a6e30;
		color: #fff;
		min-width: calc(var(--u) * 9);
	}

	.chi-tiles {
		font-size: calc(var(--u) * 1.3);
		opacity: 0.85;
	}

	.btn-kan {
		background: #4a2a80;
		color: #fff;
		min-width: calc(var(--u) * 9);
	}

	.btn-pass {
		background: #333;
		color: #aaa;
		min-width: calc(var(--u) * 9);
	}
</style>
