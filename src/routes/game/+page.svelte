<script lang="ts">
	import { onMount } from 'svelte';
	import {
		gameState,
		gameLoading,
		gameError,
		startGame,
		nextRound,
		discard,
		declareTsumo,
		declareRon,
		claimPon,
		claimChi,
		passClaim
	} from '$lib/stores/game';
	import { tileLabel, suitClass } from '$lib/game/tiles';
	import { isTenpaiAfterDiscard } from '$lib/game/ai';

	let selectedTileId = $state<number | null>(null);

	onMount(async () => {
		await startGame();
	});

	async function handleTileClick(tileId: number) {
		if (!$gameState || $gameState.phase !== 'player_discard') return;
		selectedTileId = tileId;
		await discard(tileId);
		selectedTileId = null;
	}

	function wouldTriggerRiichi(tileId: number): boolean {
		const player = $gameState?.players[0];
		if (!player || player.isRiichi || player.melds.length > 0) return false;
		return isTenpaiAfterDiscard(player.hand, tileId);
	}

	const WIND_NAMES = ['East', 'South', 'West', 'North'];
	const ROUND_NAMES = ['East 1', 'East 2', 'East 3', 'East 4'];

	// Dev panel — only compiled in dev builds
	const isDev = import.meta.env.DEV;
	let devPanelOpen = $state(false);
	let devSetTenpai: (() => Promise<void>) | null = null;
	let devSetWinningHand: (() => Promise<void>) | null = null;
	let devSetRonClaim: (() => Promise<void>) | null = null;
	let devSetPonClaim: (() => Promise<void>) | null = null;
	let devSetChiClaim: (() => Promise<void>) | null = null;

	if (isDev) {
		import('$lib/game/devCheats').then((m) => {
			devSetTenpai = m.devSetTenpai;
			devSetWinningHand = m.devSetWinningHand;
			devSetRonClaim = m.devSetRonClaim;
			devSetPonClaim = m.devSetPonClaim;
			devSetChiClaim = m.devSetChiClaim;
		});
	}

	let seatNames = $derived(
		$gameState
			? ([0, 1, 2, 3] as const).map((seat) => {
					const windIdx = (seat - $gameState!.dealer + 4) % 4;
					return seat === 0 ? `You (${WIND_NAMES[windIdx]})` : WIND_NAMES[windIdx];
				})
			: ['You', 'South', 'West', 'North']
	);
</script>

<div class="game-wrapper">
	{#if $gameLoading}
		<div class="loading">Shuffling tiles...</div>
	{:else if $gameError}
		<div class="error-screen">
			<p>Something went wrong starting the game.</p>
			<pre>{$gameError}</pre>
			<button class="action-btn" onclick={startGame}>Retry</button>
		</div>
	{:else if $gameState}
		<!-- Header -->
		<header class="game-header">
			<span class="round-label">{ROUND_NAMES[($gameState.round ?? 1) - 1]}</span>
			{#if $gameState.honba > 0}
				<span class="honba">{$gameState.honba} Honba</span>
			{/if}
			<span class="wall-count">Wall: {$gameState.liveWall.length - $gameState.wallPos} tiles</span>
			{#if isDev}
				<button class="dev-toggle" onclick={() => (devPanelOpen = !devPanelOpen)}>
					{devPanelOpen ? '✕ Dev' : '⚙ Dev'}
				</button>
			{/if}
		</header>

		<!-- Dev cheat panel -->
		{#if isDev && devPanelOpen}
			<div class="dev-panel">
				<span class="dev-label">Dev scenarios</span>
				<button class="dev-btn" onclick={() => devSetTenpai?.()}>Tenpai hand</button>
				<button class="dev-btn" onclick={() => devSetWinningHand?.()}>Winning → Tsumo</button>
				<button class="dev-btn" onclick={() => devSetRonClaim?.()}>Ron claim</button>
				<button class="dev-btn" onclick={() => devSetPonClaim?.()}>Pon claim</button>
				<button class="dev-btn" onclick={() => devSetChiClaim?.()}>Chi claim</button>
			</div>
		{/if}

		<!-- Opponent info row -->
		<div class="opponents">
			{#each [1, 2, 3] as seat (seat)}
				<div class="opponent-panel" class:riichi={$gameState.players[seat].isRiichi}>
					<div class="opponent-name">
						{seatNames[seat]}
						{#if $gameState.players[seat].isRiichi}<span class="riichi-badge">立直</span>{/if}
					</div>
					<div class="opponent-score">{$gameState.players[seat].score.toLocaleString()}</div>
					<div class="opponent-tiles">
						{#each $gameState.players[seat].hand as tile (tile.id)}
							<div class="tile tile-back" data-id={tile.id}></div>
						{/each}
					</div>
					{#if $gameState.players[seat].melds.length > 0}
						<div class="meld-row">
							{#each $gameState.players[seat].melds as meld, mi (mi)}
								<span class="meld-group">
									{#each meld.tiles as tile (tile.id)}
										<div class="tile tile-small tile-{suitClass(tile.code)}">
											{tileLabel(tile.code)}
										</div>
									{/each}
								</span>
							{/each}
						</div>
					{/if}
					<div class="discard-row">
						{#each $gameState.players[seat].discards as tile (tile.id)}
							<div class="tile tile-small tile-{suitClass(tile.code)}">{tileLabel(tile.code)}</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		<!-- Dora indicator -->
		<div class="dora-row">
			<span class="dora-label">Dora indicator:</span>
			{#each $gameState.doraIndicators as tile (tile.id)}
				<div class="tile tile-small tile-{suitClass(tile.code)}">{tileLabel(tile.code)}</div>
			{/each}
		</div>

		<!-- Player hand -->
		<div class="player-area">
			<div class="player-meta">
				<span class="player-name">
					{seatNames[0]}
					{#if $gameState.players[0].isRiichi}<span class="riichi-badge">立直</span>{/if}
					{#if $gameState.players[0].isFuriten || $gameState.players[0].isTempFuriten}
						<span class="furiten-badge">振聴</span>
					{/if}
				</span>
				<span class="player-score">{$gameState.players[0].score.toLocaleString()} pts</span>
			</div>

			<div class="player-discards">
				{#each $gameState.players[0].discards as tile (tile.id)}
					<div class="tile tile-small tile-{suitClass(tile.code)}">{tileLabel(tile.code)}</div>
				{/each}
			</div>

			<div class="player-hand-row">
				<div class="player-hand">
					{#each $gameState.players[0].hand as tile (tile.id)}
						<button
							class="tile tile-large tile-{suitClass(tile.code)}"
							class:selected={selectedTileId === tile.id}
							class:clickable={$gameState.phase === 'player_discard'}
							class:riichi-trigger={$gameState.phase === 'player_discard' &&
								wouldTriggerRiichi(tile.id)}
							disabled={$gameState.phase !== 'player_discard'}
							onclick={() => handleTileClick(tile.id)}
						>
							{tileLabel(tile.code)}
						</button>
					{/each}
				</div>

				{#if $gameState.players[0].melds.length > 0}
					<div class="player-melds">
						{#each $gameState.players[0].melds as meld, mi (mi)}
							<div class="meld-group">
								{#each meld.tiles as tile (tile.id)}
									<div class="tile tile-large tile-{suitClass(tile.code)}">
										{tileLabel(tile.code)}
									</div>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="player-actions">
				{#if $gameState.phase === 'player_discard'}
					{#if $gameState.pendingTsumo}
						<button class="action-btn tsumo-btn" onclick={declareTsumo}>Tsumo 自摸</button>
					{:else}
						<p class="action-hint">
							Click a tile to discard{$gameState.players[0].isRiichi
								? ' (Riichi — draw tile only)'
								: ''}
						</p>
					{/if}
				{/if}
			</div>
		</div>

		<!-- Claim decision overlay -->
		{#if $gameState.phase === 'claim_decision'}
			<div class="overlay">
				<div class="claim-card">
					<div class="claim-title">Your turn to claim</div>
					{#if $gameState.lastDiscard}
						<div class="claim-tile-display">
							<div class="tile tile-large tile-{suitClass($gameState.lastDiscard.code)}">
								{tileLabel($gameState.lastDiscard.code)}
							</div>
							<span class="claim-from"
								>discarded by {seatNames[$gameState.lastDiscardSeat ?? 0]}</span
							>
						</div>
					{/if}
					<div class="claim-actions">
						{#if $gameState.pendingRon}
							<button class="claim-btn btn-ron" onclick={declareRon}>Ron 栄和</button>
						{/if}
						{#each $gameState.claimOptions ?? [] as option, oi (oi)}
							{#if option.type === 'pon'}
								<button class="claim-btn btn-pon" onclick={() => claimPon(option.handTiles)}>
									Pon ポン
								</button>
							{:else if option.type === 'chi'}
								<button class="claim-btn btn-chi" onclick={() => claimChi(option.handTiles)}>
									Chi チー
									<span class="chi-tiles"
										>{tileLabel(option.handTiles[0].code)}·{tileLabel(
											option.handTiles[1].code
										)}</span
									>
								</button>
							{/if}
						{/each}
						<button class="claim-btn btn-pass" onclick={passClaim}>Pass スキップ</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Round end overlay -->
		{#if $gameState.phase === 'round_end'}
			<div class="overlay">
				<div class="result-card">
					{#if $gameState.roundResult}
						<div class="win-announcement">
							{$gameState.roundResult.winType === 'tsumo' ? '自摸' : '栄和'}
						</div>
						<p class="winner-name">
							{seatNames[$gameState.roundResult.winner]} wins!
						</p>
						<p class="score-detail">
							{$gameState.roundResult.han} han / {$gameState.roundResult.fu} fu —
							{$gameState.roundResult.score.toLocaleString()} pts
						</p>
						<div class="score-changes">
							{#each $gameState.roundResult.pointChanges as change, i (i)}
								<div class="score-row" class:winner={$gameState.roundResult.winner === i}>
									<span>{seatNames[i]}</span>
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
					<button class="action-btn" onclick={nextRound}>Next Round</button>
				</div>
			</div>
		{/if}

		<!-- Game end overlay -->
		{#if $gameState.phase === 'game_end'}
			<div class="overlay">
				<div class="result-card">
					<div class="win-announcement">終了</div>
					<p class="winner-name">Game Over</p>
					<div class="score-changes">
						{#each [...$gameState.players]
							.map((p, i) => ({ ...p, seat: i }))
							.sort((a, b) => b.score - a.score) as player, rank (player.seat)}
							<div class="score-row" class:winner={rank === 0}>
								<span>#{rank + 1} {seatNames[player.seat]}</span>
								<span>{player.score.toLocaleString()}</span>
							</div>
						{/each}
					</div>
					<button class="action-btn" onclick={startGame}>New Game</button>
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

	.furiten-badge {
		color: #888;
		font-size: 0.75rem;
		border: 1px solid #444;
		border-radius: 3px;
		padding: 0 4px;
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

	.meld-row {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 0.4rem;
	}

	.meld-group {
		display: flex;
		gap: 1px;
		background: #222;
		border-radius: 3px;
		padding: 2px;
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

	.player-hand-row {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 0.5rem;
	}

	.player-hand {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.player-melds {
		display: flex;
		gap: 6px;
		align-items: flex-end;
	}

	.player-actions {
		min-height: 2rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
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
		transition:
			transform 0.1s,
			border-color 0.1s;
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

	.tile-large.riichi-trigger {
		border-color: #c8a020;
	}

	.tile-large.riichi-trigger:hover {
		border-color: #f0c030;
	}

	/* Suit colours */
	.tile-man {
		color: #e05050;
	}
	.tile-pin {
		color: #4a9eff;
	}
	.tile-sou {
		color: #4caf50;
	}
	.tile-wind {
		color: #ccc;
	}
	.tile-dragon {
		color: #e8d080;
	}
	.tile-dragon-chun {
		color: #c41e3a;
	}

	.action-hint {
		font-size: 0.8rem;
		color: #555;
		margin: 0;
	}

	.action-btn {
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

	.tsumo-btn {
		background: #1a7a3a;
	}

	.tsumo-btn:hover {
		background: #155f2d;
	}

	/* Claim card */
	.claim-card {
		background: #181818;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 1.5rem 2rem;
		text-align: center;
		min-width: 300px;
	}

	.claim-title {
		font-size: 0.8rem;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 1rem;
	}

	.claim-tile-display {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 1.25rem;
	}

	.claim-from {
		font-size: 0.75rem;
		color: #666;
	}

	.claim-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: center;
	}

	.claim-btn {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 600;
		transition: opacity 0.15s;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
	}

	.claim-btn:hover {
		opacity: 0.85;
	}

	.btn-ron {
		background: #c41e3a;
		color: #fff;
		min-width: 80px;
	}

	.btn-pon {
		background: #b87820;
		color: #fff;
		min-width: 80px;
	}

	.btn-chi {
		background: #1a6e30;
		color: #fff;
		min-width: 80px;
	}

	.chi-tiles {
		font-size: 0.7rem;
		opacity: 0.85;
	}

	.btn-pass {
		background: #333;
		color: #aaa;
		min-width: 80px;
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

	.positive {
		color: #4caf50;
	}
	.negative {
		color: #c41e3a;
	}

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

	/* Dev panel */
	.dev-toggle {
		margin-left: auto;
		padding: 0.2rem 0.6rem;
		background: #1a1a1a;
		border: 1px solid #444;
		border-radius: 4px;
		color: #888;
		font-size: 0.75rem;
		cursor: pointer;
	}

	.dev-toggle:hover {
		border-color: #666;
		color: #bbb;
	}

	.dev-panel {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.5rem 0.75rem;
		background: #0d0d0d;
		border: 1px dashed #333;
		border-radius: 6px;
		font-size: 0.75rem;
	}

	.dev-label {
		color: #555;
		white-space: nowrap;
	}

	.dev-btn {
		padding: 0.3rem 0.7rem;
		background: #1e1e1e;
		border: 1px solid #444;
		border-radius: 4px;
		color: #aaa;
		font-size: 0.75rem;
		cursor: pointer;
		transition: border-color 0.1s;
	}

	.dev-btn:hover {
		border-color: #888;
		color: #e8e0d5;
	}
</style>
