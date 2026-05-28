<script lang="ts">
	import { onMount } from 'svelte';
	import { gameState, gameLoading, gameError, startGame, discard, declareRon, canRon } from '$lib/stores/game';
	import { tileLabel, suitClass } from '$lib/game/tiles';

	let selectedTileId: number | null = null;

	onMount(async () => {
		await startGame();
	});

	async function handleTileClick(tileId: number) {
		if (!$gameState || $gameState.phase !== 'player_discard') return;
		selectedTileId = tileId;
		await discard(tileId);
		selectedTileId = null;
	}

	async function handleRon() {
		await declareRon();
	}

	async function handleNewGame() {
		loading = true;
		await game.startGame();
	}

	const SEAT_NAMES = ['You (East)', 'South', 'West', 'North'];
	const ROUND_NAMES = ['East 1', 'East 2', 'East 3', 'East 4'];
</script>

<div class="game-wrapper">
	{#if $gameLoading}
		<div class="loading">Shuffling tiles...</div>
	{:else if $gameError}
		<div class="error-screen">
			<p>Something went wrong starting the game.</p>
			<pre>{$gameError}</pre>
			<button class="action-btn" on:click={startGame}>Retry</button>
		</div>
	{:else if $gameState}
		<!-- Header -->
		<header class="game-header">
			<span class="round-label">{ROUND_NAMES[($gameState.round ?? 1) - 1]}</span>
			{#if $gameState.honba > 0}
				<span class="honba">{$gameState.honba} Honba</span>
			{/if}
			<span class="wall-count">Wall: {$gameState.liveWall.length - $gameState.wallPos} tiles</span>
		</header>

		<!-- Opponent info row -->
		<div class="opponents">
			{#each [1, 2, 3] as seat}
				<div class="opponent-panel" class:riichi={$gameState.players[seat].isRiichi}>
					<div class="opponent-name">
						{SEAT_NAMES[seat]}
						{#if $gameState.players[seat].isRiichi}<span class="riichi-badge">立直</span>{/if}
					</div>
					<div class="opponent-score">{$gameState.players[seat].score.toLocaleString()}</div>
					<div class="opponent-tiles">
						{#each $gameState.players[seat].hand as _}
							<div class="tile tile-back"></div>
						{/each}
					</div>
					<div class="discard-row">
						{#each $gameState.players[seat].discards as tile}
							<div class="tile tile-small tile-{suitClass(tile.code)}">{tileLabel(tile.code)}</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		<!-- Dora indicator -->
		<div class="dora-row">
			<span class="dora-label">Dora indicator:</span>
			{#each $gameState.doraIndicators as tile}
				<div class="tile tile-small tile-{suitClass(tile.code)}">{tileLabel(tile.code)}</div>
			{/each}
		</div>

		<!-- Player hand -->
		<div class="player-area">
			<div class="player-meta">
				<span class="player-name">
					{SEAT_NAMES[0]}
					{#if $gameState.players[0].isRiichi}<span class="riichi-badge">立直</span>{/if}
				</span>
				<span class="player-score">{$gameState.players[0].score.toLocaleString()} pts</span>
			</div>

			<div class="player-discards">
				{#each $gameState.players[0].discards as tile}
					<div class="tile tile-small tile-{suitClass(tile.code)}">{tileLabel(tile.code)}</div>
				{/each}
			</div>

			<div class="player-hand">
				{#each $gameState.players[0].hand as tile}
					<button
						class="tile tile-large tile-{suitClass(tile.code)}"
						class:selected={selectedTileId === tile.id}
						class:clickable={$gameState.phase === 'player_discard'}
						disabled={$gameState.phase !== 'player_discard'}
						on:click={() => handleTileClick(tile.id)}
					>
						{tileLabel(tile.code)}
					</button>
				{/each}
			</div>

			{#if $gameState.phase === 'player_discard'}
				<p class="action-hint">Click a tile to discard</p>
			{/if}

			{#if canRon()}
				<button class="action-btn ron-btn" on:click={handleRon}>Ron 栄和</button>
			{/if}
		</div>

		<!-- Round end overlay -->
		{#if $gameState.phase === 'round_end'}
			<div class="overlay">
				<div class="result-card">
					{#if $gameState.roundResult}
						<div class="win-announcement">
							{$gameState.roundResult.winType === 'tsumo' ? '自摸' : '栄和'}
						</div>
						<p class="winner-name">
							{SEAT_NAMES[$gameState.roundResult.winner]} wins!
						</p>
						<p class="score-detail">
							{$gameState.roundResult.han} han / {$gameState.roundResult.fu} fu —
							{$gameState.roundResult.score.toLocaleString()} pts
						</p>
						<div class="score-changes">
							{#each $gameState.roundResult.pointChanges as change, i}
								<div class="score-row" class:winner={$gameState.roundResult.winner === i}>
									<span>{SEAT_NAMES[i]}</span>
									<span class:positive={change > 0} class:negative={change < 0}>
										{change > 0 ? '+' : ''}{change.toLocaleString()}
									</span>
								</div>
							{/each}
						</div>
					{:else}
						<div class="win-announcement">流局</div>
						<p class="winner-name">Draw — wall exhausted</p>
					{/if}
					<button class="action-btn" on:click={startGame}>New Game</button>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	:global(body) {
		background: #111;
		color: #e8e0d5;
		font-family: 'Inter', system-ui, sans-serif;
		margin: 0;
	}

	.game-wrapper {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		padding: 1rem;
		gap: 1rem;
		max-width: 960px;
		margin: 0 auto;
	}

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100vh;
		font-size: 1.2rem;
		color: #888;
	}

	.game-header {
		display: flex;
		gap: 1rem;
		align-items: center;
		padding: 0.5rem 0;
		border-bottom: 1px solid #222;
		font-size: 0.9rem;
		color: #888;
	}

	.round-label {
		font-weight: 600;
		color: #e8e0d5;
	}

	.honba {
		color: #c41e3a;
	}

	.wall-count {
		margin-left: auto;
	}

	.opponents {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}

	.opponent-panel {
		background: #181818;
		border: 1px solid #222;
		border-radius: 6px;
		padding: 0.6rem;
		min-height: 80px;
	}

	.opponent-panel.riichi {
		border-color: #c41e3a;
	}

	.opponent-name {
		font-size: 0.75rem;
		color: #888;
		margin-bottom: 0.3rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.riichi-badge {
		color: #c41e3a;
		font-size: 0.8rem;
	}

	.opponent-score {
		font-size: 0.85rem;
		font-weight: 600;
		margin-bottom: 0.4rem;
	}

	.opponent-tiles {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		margin-bottom: 0.4rem;
	}

	.discard-row {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
	}

	.dora-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: #888;
	}

	.dora-label {
		white-space: nowrap;
	}

	.player-area {
		margin-top: auto;
		border-top: 1px solid #222;
		padding-top: 1rem;
	}

	.player-meta {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}

	.player-name {
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.player-score {
		color: #888;
		font-size: 0.9rem;
	}

	.player-discards {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		margin-bottom: 0.75rem;
		min-height: 28px;
	}

	.player-hand {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 0.5rem;
	}

	/* Tile styles */
	.tile {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: #1e1e1e;
		border: 1px solid #333;
		border-radius: 4px;
		font-weight: 600;
		user-select: none;
		transition: transform 0.1s, border-color 0.1s;
	}

	.tile-back {
		width: 18px;
		height: 24px;
		background: #1a1a2e;
		border-color: #2a2a4e;
	}

	.tile-small {
		width: 22px;
		height: 28px;
		font-size: 0.65rem;
	}

	.tile-large {
		width: 42px;
		height: 56px;
		font-size: 1rem;
		cursor: default;
	}

	.tile-large.clickable {
		cursor: pointer;
	}

	.tile-large.clickable:hover {
		transform: translateY(-6px);
		border-color: #555;
	}

	.tile-large.selected {
		transform: translateY(-8px);
		border-color: #c41e3a;
	}

	/* Suit colours */
	.tile-man { color: #e05050; }
	.tile-pin { color: #4a9eff; }
	.tile-sou { color: #4caf50; }
	.tile-wind { color: #ccc; }
	.tile-dragon { color: #e8d080; }
	.tile-dragon-chun { color: #c41e3a; }

	.action-hint {
		font-size: 0.8rem;
		color: #555;
		margin: 0.25rem 0;
	}

	.action-btn {
		margin-top: 0.75rem;
		padding: 0.5rem 1.5rem;
		background: #c41e3a;
		color: #fff;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 600;
		transition: background 0.15s;
	}

	.action-btn:hover {
		background: #a01830;
	}

	.ron-btn {
		margin-left: 0.5rem;
	}

	/* Overlay */
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.result-card {
		background: #181818;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 2rem;
		text-align: center;
		min-width: 280px;
	}

	.win-announcement {
		font-size: 3rem;
		font-weight: 700;
		color: #c41e3a;
		margin-bottom: 0.5rem;
		font-family: 'Noto Serif JP', serif;
	}

	.winner-name {
		font-size: 1.1rem;
		margin: 0.25rem 0;
	}

	.score-detail {
		color: #888;
		font-size: 0.9rem;
		margin: 0.25rem 0 1rem;
	}

	.score-changes {
		text-align: left;
		margin-bottom: 1rem;
	}

	.score-row {
		display: flex;
		justify-content: space-between;
		padding: 0.25rem 0;
		font-size: 0.9rem;
		color: #888;
	}

	.score-row.winner {
		color: #e8e0d5;
		font-weight: 600;
	}

	.positive { color: #4caf50; }
	.negative { color: #c41e3a; }

	.error-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		gap: 1rem;
		color: #c41e3a;
	}

	.error-screen pre {
		font-size: 0.75rem;
		color: #666;
		max-width: 500px;
		white-space: pre-wrap;
	}
</style>
