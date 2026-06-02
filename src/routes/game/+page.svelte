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
		claimDaiminkan,
		declareAnkan,
		declareKakan,
		passClaim
	} from '$lib/stores/game';
	import { tileLabel } from '$lib/game/tiles';
	import { isTenpaiAfterDiscard } from '$lib/game/ai';
	import { getPlayerKanOptions } from '$lib/game/engine';
	import Tile from '$lib/components/Tile.svelte';

	let selectedTileId = $state<number | null>(null);
	let riichiArmed = $state(false);
	// Hovering a hand tile lights up every matching tile in the rivers and your own
	// discards — a reading aid (and furiten cue: a wait you've already discarded).
	let hoveredCode = $state<number | null>(null);

	onMount(async () => {
		await startGame();
	});

	async function handleTileClick(tileId: number) {
		if (!$gameState || $gameState.phase !== 'player_discard') return;
		const declaring = riichiActive && wouldTriggerRiichi(tileId);
		selectedTileId = tileId;
		await discard(tileId, declaring);
		selectedTileId = null;
		riichiArmed = false;
	}

	function wouldTriggerRiichi(tileId: number): boolean {
		const player = $gameState?.players[0];
		if (!player || player.isRiichi || player.melds.length > 0) return false;
		return isTenpaiAfterDiscard(player.hand, tileId);
	}

	// Riichi is opt-in: shown only when it is legal to declare (closed hand, 1000+
	// points, and at least one discard keeps the hand tenpai).
	let canRiichi = $derived(
		$gameState?.phase === 'player_discard' &&
			$gameState.currentSeat === 0 &&
			!$gameState.players[0].isRiichi &&
			$gameState.players[0].melds.length === 0 &&
			$gameState.players[0].score >= 1000 &&
			$gameState.players[0].hand.some((t) => wouldTriggerRiichi(t.id))
	);
	// Armed only counts while declaring is actually legal, so a stale armed flag
	// (e.g. after an intervening claim) never blocks normal discards.
	let riichiActive = $derived(riichiArmed && canRiichi);

	const WIND_NAMES = ['East', 'South', 'West', 'North'];
	const WIND_KANJI = ['東', '南', '西', '北'];

	function windIndex(seat: number, dealer: number): number {
		return (seat - dealer + 4) % 4;
	}

	// Dev panel — only compiled in dev builds
	const isDev = import.meta.env.DEV;
	let devPanelOpen = $state(false);
	let devSetTenpai: (() => Promise<void>) | null = null;
	let devSetWinningHand: (() => Promise<void>) | null = null;
	let devSetRonClaim: (() => Promise<void>) | null = null;
	let devSetPonClaim: (() => Promise<void>) | null = null;
	let devSetChiClaim: (() => Promise<void>) | null = null;
	let devSetFuriten: (() => Promise<void>) | null = null;
	let devSetAnkan: (() => Promise<void>) | null = null;
	let devSetKakan: (() => Promise<void>) | null = null;
	let devSetDaiminkan: (() => Promise<void>) | null = null;
	let devSetTenpaiToRon: (() => Promise<void>) | null = null;

	if (isDev) {
		import('$lib/game/devCheats').then((m) => {
			devSetTenpai = m.devSetTenpai;
			devSetWinningHand = m.devSetWinningHand;
			devSetRonClaim = m.devSetRonClaim;
			devSetPonClaim = m.devSetPonClaim;
			devSetChiClaim = m.devSetChiClaim;
			devSetFuriten = m.devSetFuriten;
			devSetAnkan = m.devSetAnkan;
			devSetKakan = m.devSetKakan;
			devSetDaiminkan = m.devSetDaiminkan;
			devSetTenpaiToRon = m.devSetTenpaiToRon;
		});
	}

	let kanOptions = $derived(
		$gameState?.phase === 'player_discard' && $gameState.currentSeat === 0
			? getPlayerKanOptions($gameState)
			: { ankan: [], kakan: [] }
	);

	let seatNames = $derived(
		$gameState
			? ([0, 1, 2, 3] as const).map((seat) => {
					const windIdx = windIndex(seat, $gameState!.dealer);
					return seat === 0 ? `You (${WIND_NAMES[windIdx]})` : WIND_NAMES[windIdx];
				})
			: ['You', 'South', 'West', 'North']
	);
</script>

<!-- Opponent seat: wind/name/score chip, concealed hand, melds, discard pond -->
{#snippet opponentSeat(seat: number)}
	{@const p = $gameState!.players[seat]}
	<div class="seat-chip" class:active={$gameState!.currentSeat === seat}>
		<span class="wind-mark">{WIND_KANJI[windIndex(seat, $gameState!.dealer)]}</span>
		<span class="seat-name">{seatNames[seat]}</span>
		<span class="seat-score">{p.score.toLocaleString()}</span>
		{#if p.isRiichi}<span class="riichi-badge">立直</span>{/if}
	</div>
	<div class="concealed">
		{#each p.hand as t (t.id)}
			<Tile back variant="pond" />
		{/each}
	</div>
	{#if p.melds.length > 0}
		<div class="seat-melds">
			{#each p.melds as meld, mi (mi)}
				<div class="meld-group">
					{#each meld.tiles as t (t.id)}
						<Tile tile={t} variant="meld" />
					{/each}
				</div>
			{/each}
		</div>
	{/if}
	<div class="pond-wrap">
		<div class="pond">
			{#each p.discards as t, di (t.id)}
				<Tile
					tile={t}
					variant="pond"
					recent={p.isRiichi ? false : di === p.discards.length - 1}
					highlight={hoveredCode === t.code}
				/>
			{/each}
		</div>
	</div>
{/snippet}

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
			<span class="round-label">{WIND_KANJI[0]} {$gameState.round}</span>
			{#if $gameState.honba > 0}
				<span class="honba">{$gameState.honba} 本場</span>
			{/if}
			<span class="wall-count">Wall {$gameState.liveWall.length - $gameState.wallPos}</span>
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
				<button class="dev-btn" onclick={() => devSetFuriten?.()}>Furiten (no ron)</button>
				<button class="dev-btn" onclick={() => devSetAnkan?.()}>Ankan (4-of-a-kind)</button>
				<button class="dev-btn" onclick={() => devSetKakan?.()}>Kakan (extend pon)</button>
				<button class="dev-btn" onclick={() => devSetDaiminkan?.()}>Daiminkan claim</button>
				<button class="dev-btn" onclick={() => devSetTenpaiToRon?.()}>Riichi → Ippatsu Ron</button>
			</div>
		{/if}

		<!-- The table: four seats around a central board -->
		<div class="board">
			<div class="seat seat-top">{@render opponentSeat(2)}</div>
			<div class="seat seat-left">{@render opponentSeat(3)}</div>

			<div class="center-board">
				<div class="center-round">{WIND_KANJI[0]}{$gameState.round}</div>
				{#if $gameState.honba > 0}
					<div class="center-honba">{$gameState.honba} 本場</div>
				{/if}
				<div class="center-wall">
					<span class="wall-num">{$gameState.liveWall.length - $gameState.wallPos}</span>
					<span class="wall-unit">tiles left</span>
				</div>
				<div class="center-dora">
					<span class="dora-label">ドラ</span>
					{#each $gameState.doraIndicators as t (t.id)}
						<Tile tile={t} variant="dora" />
					{/each}
				</div>
				{#if $gameState.riichiBets > 0}
					<div class="center-sticks">
						<span class="stick-dot"></span>
						{$gameState.riichiBets} riichi {$gameState.riichiBets === 1 ? 'stick' : 'sticks'}
					</div>
				{/if}
			</div>

			<div class="seat seat-right">{@render opponentSeat(1)}</div>

			<!-- Bottom: your discard pond + seat chip (hand sits below the table) -->
			<div class="seat seat-bottom">
				<div class="seat-chip" class:active={$gameState.currentSeat === 0}>
					<span class="wind-mark">{WIND_KANJI[windIndex(0, $gameState.dealer)]}</span>
					<span class="seat-name">{seatNames[0]}</span>
					<span class="seat-score">{$gameState.players[0].score.toLocaleString()}</span>
					{#if $gameState.players[0].isRiichi}<span class="riichi-badge">立直</span>{/if}
					{#if $gameState.players[0].isFuriten || $gameState.players[0].isTempFuriten}
						<span class="furiten-badge">振聴</span>
					{/if}
				</div>
				<div class="pond-wrap">
					<div class="pond">
						{#each $gameState.players[0].discards as t, di (t.id)}
							<Tile
								tile={t}
								variant="pond"
								recent={$gameState.players[0].isRiichi
									? false
									: di === $gameState.players[0].discards.length - 1}
								highlight={hoveredCode === t.code}
							/>
						{/each}
					</div>
				</div>
			</div>
		</div>

		<!-- Your hand + melds + actions -->
		<div class="player-area">
			<div class="player-hand-row">
				<div class="player-hand">
					{#each $gameState.players[0].hand as t (t.id)}
						<Tile
							tile={t}
							variant="hand"
							selected={selectedTileId === t.id}
							clickable={$gameState.phase === 'player_discard' &&
								!(riichiActive && !wouldTriggerRiichi(t.id))}
							disabled={$gameState.phase !== 'player_discard' ||
								(riichiActive && !wouldTriggerRiichi(t.id))}
							riichiTrigger={riichiActive && wouldTriggerRiichi(t.id)}
							highlight={hoveredCode === t.code}
							onclick={() => handleTileClick(t.id)}
							onmouseenter={() => (hoveredCode = t.code)}
							onmouseleave={() => (hoveredCode = null)}
						/>
					{/each}
				</div>

				{#if $gameState.players[0].melds.length > 0}
					<div class="player-melds">
						{#each $gameState.players[0].melds as meld, mi (mi)}
							<div class="meld-group">
								{#each meld.tiles as t (t.id)}
									<Tile tile={t} variant="meld" />
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
						{#if canRiichi}
							<button
								class="action-btn riichi-btn"
								class:armed={riichiActive}
								onclick={() => (riichiArmed = !riichiArmed)}
							>
								{riichiActive ? 'Cancel' : 'Riichi 立直'}
							</button>
						{/if}
						<p class="action-hint">
							{#if $gameState.players[0].isRiichi}
								Click a tile to discard (Riichi — draw tile only)
							{:else if riichiActive}
								Declaring riichi — click a highlighted tile
							{:else}
								Click a tile to discard
							{/if}
						</p>
					{/if}
					{#each kanOptions.ankan as code (code)}
						<button class="action-btn kan-btn" onclick={() => declareAnkan(code)}>
							Ankan 暗槓 ({tileLabel(code)}×4)
						</button>
					{/each}
					{#each kanOptions.kakan as opt (opt.meldIndex)}
						<button class="action-btn kan-btn" onclick={() => declareKakan(opt.meldIndex)}>
							Kakan 加槓 ({tileLabel(opt.code)})
						</button>
					{/each}
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
							<Tile tile={$gameState.lastDiscard} variant="hand" />
							<span class="claim-from">
								discarded by {seatNames[$gameState.lastDiscardSeat ?? 0]}
							</span>
						</div>
					{/if}
					<div class="claim-actions">
						{#if $gameState.pendingRon}
							<button class="claim-btn btn-ron" onclick={declareRon}>Ron 栄和</button>
						{/if}
						{#each $gameState.claimOptions ?? [] as option, oi (oi)}
							{#if option.type === 'kan'}
								<button class="claim-btn btn-kan" onclick={() => claimDaiminkan(option.handTiles)}>
									Kan 槓
								</button>
							{:else if option.type === 'pon'}
								<button class="claim-btn btn-pon" onclick={() => claimPon(option.handTiles)}>
									Pon ポン
								</button>
							{:else if option.type === 'chi'}
								<button class="claim-btn btn-chi" onclick={() => claimChi(option.handTiles)}>
									Chi チー
									<span class="chi-tiles">
										{tileLabel(option.handTiles[0].code)}·{tileLabel(option.handTiles[1].code)}
									</span>
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
						{#if $gameState.exhaustiveDrawResult}
							{@const edr = $gameState.exhaustiveDrawResult}
							<div class="score-changes">
								{#each edr.pointChanges as change, i (i)}
									{@const isTenpai = edr.tenpaiSeats.includes(i as 0 | 1 | 2 | 3)}
									<div class="score-row" class:tenpai={isTenpai}>
										<span>
											{seatNames[i]}
											<span class="tenpai-label">
												{isTenpai ? 'tenpai' : 'noten'}
											</span>
										</span>
										<span class:positive={change > 0} class:negative={change < 0}>
											{change > 0 ? '+' : ''}{change !== 0 ? change.toLocaleString() : '—'}
										</span>
									</div>
								{/each}
							</div>
						{/if}
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
		background: #0b0a0a;
		color: #e8e0d5;
		font-family: 'Inter', system-ui, sans-serif;
		margin: 0;
	}

	.game-wrapper {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		padding: 0.75rem 1rem 1rem;
		gap: 0.75rem;
		max-width: 1000px;
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
		padding: 0.25rem 0.25rem 0.5rem;
		border-bottom: 1px solid #1e1c1a;
		font-size: 0.9rem;
		color: #8a8278;
	}

	.round-label {
		font-weight: 600;
		color: #e8e0d5;
		letter-spacing: 0.04em;
	}

	.honba {
		color: #c41e3a;
	}

	.wall-count {
		margin-left: auto;
	}

	/* ── Table ─────────────────────────────────────────────────────────── */
	.board {
		flex: 1;
		min-height: 0;
		width: 100%;
		max-width: 860px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: minmax(110px, 1fr) minmax(220px, 1.7fr) minmax(110px, 1fr);
		grid-template-rows: auto minmax(170px, 1fr) auto;
		grid-template-areas:
			'.    top    .'
			'left center right'
			'.    bottom .';
		gap: 0.5rem;
		align-items: center;
		justify-items: center;
		padding: 1.25rem;
		border-radius: 14px;
		border: 1px solid #1b1916;
		/* faint cool-dark felt with a centre glow + edge vignette */
		background: radial-gradient(ellipse 64% 60% at 50% 50%, #15191b 0%, #101315 60%, #0c0e0f 100%);
		box-shadow:
			inset 0 0 60px rgba(0, 0, 0, 0.6),
			inset 0 0 0 1px rgba(255, 255, 255, 0.015);
	}

	.seat-top {
		grid-area: top;
	}
	.seat-left {
		grid-area: left;
	}
	.seat-right {
		grid-area: right;
	}
	.seat-bottom {
		grid-area: bottom;
	}
	.center-board {
		grid-area: center;
	}

	.seat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
	}

	/* Seat info chip */
	.seat-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.2rem 0.6rem;
		background: #15140f;
		border: 1px solid #262320;
		border-radius: 999px;
		font-size: 0.72rem;
		color: #9a9286;
		white-space: nowrap;
	}

	.seat-chip.active {
		border-color: #c41e3a;
		box-shadow: 0 0 10px rgba(196, 30, 58, 0.4);
		color: #e8e0d5;
	}

	.wind-mark {
		font-family: 'Noto Serif JP', serif;
		font-size: 0.85rem;
		color: #c41e3a;
		line-height: 1;
	}

	.seat-name {
		font-weight: 600;
		color: #cfc7bb;
	}

	.seat-score {
		color: #8a8278;
		font-variant-numeric: tabular-nums;
	}

	.riichi-badge {
		color: #c41e3a;
		font-family: 'Noto Serif JP', serif;
		font-size: 0.78rem;
	}

	.furiten-badge {
		color: #888;
		font-size: 0.72rem;
		border: 1px solid #444;
		border-radius: 3px;
		padding: 0 4px;
	}

	.concealed {
		display: flex;
		gap: 1px;
		flex-wrap: wrap;
		justify-content: center;
		max-width: 240px;
	}

	.seat-melds,
	.player-melds {
		display: flex;
		gap: 5px;
		flex-wrap: wrap;
		justify-content: center;
	}

	.meld-group {
		display: flex;
		gap: 1px;
		background: rgba(0, 0, 0, 0.25);
		border-radius: 3px;
		padding: 2px;
	}

	/* Discard pond — 6 per row, oriented toward the centre per seat */
	.pond-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.pond {
		display: grid;
		grid-template-columns: repeat(6, auto);
		gap: 3px;
		justify-content: center;
	}

	.seat-top .pond {
		transform: rotate(180deg);
	}
	/* Side ponds rotate to face centre; the wrapper reserves a tall, narrow box so
	   the rotated tiles don't overlap the concealed hand above them. */
	.seat-left .pond-wrap,
	.seat-right .pond-wrap {
		width: 124px;
		min-height: 184px;
	}
	.seat-left .pond {
		transform: rotate(90deg);
	}
	.seat-right .pond {
		transform: rotate(-90deg);
	}

	/* Centre board */
	.center-board {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		padding: 0.8rem 1rem;
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.28);
		border: 1px solid #1c1a17;
		min-width: 150px;
	}

	.center-round {
		font-family: 'Noto Serif JP', serif;
		font-size: 1.6rem;
		font-weight: 700;
		color: #e8e0d5;
		line-height: 1;
	}

	.center-honba {
		font-size: 0.72rem;
		color: #c41e3a;
	}

	.center-wall {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin: 0.1rem 0;
	}

	.wall-num {
		font-size: 1.5rem;
		font-weight: 700;
		color: #cfc7bb;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.wall-unit {
		font-size: 0.62rem;
		color: #6a6258;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.center-dora {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.dora-label {
		font-family: 'Noto Serif JP', serif;
		font-size: 0.72rem;
		color: #8a8278;
	}

	.center-sticks {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.68rem;
		color: #b7ada0;
	}

	.stick-dot {
		width: 18px;
		height: 4px;
		border-radius: 2px;
		background: #d8d2c6;
		box-shadow: 0 0 0 1px #c41e3a inset;
		position: relative;
	}

	/* ── Your hand ─────────────────────────────────────────────────────── */
	.player-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
	}

	.player-hand-row {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.player-hand {
		display: flex;
		gap: 5px;
		padding-top: 9px; /* room for hover/selected lift */
	}

	.player-actions {
		min-height: 2.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.action-hint {
		font-size: 0.8rem;
		color: #6a6258;
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

	.kan-btn {
		background: #4a2a80;
	}

	.kan-btn:hover {
		background: #3a2060;
	}

	.riichi-btn {
		background: #c8a020;
		color: #1a1a1a;
	}

	.riichi-btn:hover {
		background: #b08c18;
	}

	.riichi-btn.armed {
		background: #f0c030;
		box-shadow: 0 0 0 2px #f0c030;
	}

	/* ── Claim card ────────────────────────────────────────────────────── */
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
		gap: 0.5rem;
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

	.btn-kan {
		background: #4a2a80;
		color: #fff;
		min-width: 80px;
	}

	.btn-pass {
		background: #333;
		color: #aaa;
		min-width: 80px;
	}

	/* ── Overlays ──────────────────────────────────────────────────────── */
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

	.score-row.tenpai {
		color: #e8e0d5;
	}

	.tenpai-label {
		font-size: 0.75rem;
		margin-left: 0.4rem;
		opacity: 0.6;
		text-transform: uppercase;
		letter-spacing: 0.05em;
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

	/* ── Dev panel ─────────────────────────────────────────────────────── */
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
