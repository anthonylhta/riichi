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
		passClaim,
		gameLog
	} from '$lib/stores/game';
	import { tileLabel } from '$lib/game/tiles';
	import { limitName } from '$lib/game/scoring';
	import { isTenpaiAfterDiscard } from '$lib/game/ai';
	import { getPlayerKanOptions } from '$lib/game/engine';
	import { buildReviewPayload, type RoundRecord } from '$lib/game/review';
	import { buildHelperView, type HelperAdvice } from '$lib/game/helper';
	import Tile from '$lib/components/Tile.svelte';

	// Post-game overview (Claude) — generated on demand from the flagged moments.
	interface Overview {
		narrative: string;
		lessons: string[];
	}
	let overview = $state<Overview | null>(null);
	let overviewLoading = $state(false);
	let overviewError = $state<string | null>(null);

	async function askOverview() {
		if (overviewLoading) return;
		overviewLoading = true;
		overviewError = null;
		try {
			const payload = buildReviewPayload($gameLog as RoundRecord[]);
			const res = await fetch('/api/overview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) throw new Error('overview failed');
			overview = (await res.json()) as Overview;
		} catch {
			overviewError = 'Review unavailable right now.';
		} finally {
			overviewLoading = false;
		}
	}

	let selectedTileId = $state<number | null>(null);
	let riichiArmed = $state(false);

	// In-round AI helper (off by default — the player presses for advice).
	let helperAdvice = $state<HelperAdvice | null>(null);
	let helperLoading = $state(false);
	let helperError = $state<string | null>(null);

	async function askHelper() {
		if (!$gameState || helperLoading) return;
		helperLoading = true;
		helperError = null;
		helperAdvice = null;
		try {
			const res = await fetch('/api/helper', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(buildHelperView($gameState))
			});
			if (!res.ok) throw new Error('helper failed');
			helperAdvice = (await res.json()) as HelperAdvice;
		} catch {
			helperError = 'Helper unavailable right now.';
		} finally {
			helperLoading = false;
		}
	}

	function dismissHelper() {
		helperAdvice = null;
		helperError = null;
	}
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

	// Rounds 1–4 are East (東); 5–8 are South (南) sudden-death overtime.
	let roundWindKanji = $derived(($gameState?.round ?? 1) <= 4 ? WIND_KANJI[0] : WIND_KANJI[1]);
	let roundNumber = $derived(((($gameState?.round ?? 1) - 1) % 4) + 1);
</script>

<!-- A seat's hand block: wind/name/score chip, concealed hand, melds.
     Sits at that seat's outer edge; side seats are oriented vertically via CSS. -->
{#snippet seatHand(seat: number)}
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
{/snippet}

<!-- A seat's discard river — rings the centre board, rotated to face the seat. -->
{#snippet seatRiver(seat: number)}
	{@const p = $gameState!.players[seat]}
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
{/snippet}

<div class="viewport">
	{#if $gameLoading}
		<div class="loading">Shuffling tiles...</div>
	{:else if $gameError}
		<div class="error-screen">
			<p>Something went wrong starting the game.</p>
			<pre>{$gameError}</pre>
			<button class="action-btn" onclick={startGame}>Retry</button>
		</div>
	{:else if $gameState}
		<!-- Fixed-aspect stage: everything inside scales together via cq units -->
		<div class="stage">
			<!-- Header -->
			<header class="game-header">
				<span class="round-label">{roundWindKanji} {roundNumber}</span>
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

			<!-- The table: hands at the four edges, rivers ringing the central board -->
			<div class="board">
				<div class="hand-slot hand-top">{@render seatHand(2)}</div>
				<div class="hand-slot hand-left">{@render seatHand(3)}</div>

				<!-- Centre cluster: the four rivers hug the central board on each side -->
				<div class="center-cluster">
					<div class="river-slot river-top">{@render seatRiver(2)}</div>
					<div class="river-slot river-left">{@render seatRiver(3)}</div>

					<div class="center-board">
						<div class="center-round">{roundWindKanji}{roundNumber}</div>
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

					<div class="river-slot river-right">{@render seatRiver(1)}</div>
					<div class="river-slot river-bottom">{@render seatRiver(0)}</div>
				</div>

				<div class="hand-slot hand-right">{@render seatHand(1)}</div>

				<!-- Bottom: your seat chip (your face-up hand sits below the table) -->
				<div class="hand-slot hand-bottom">
					<div class="seat-chip" class:active={$gameState.currentSeat === 0}>
						<span class="wind-mark">{WIND_KANJI[windIndex(0, $gameState.dealer)]}</span>
						<span class="seat-name">{seatNames[0]}</span>
						<span class="seat-score">{$gameState.players[0].score.toLocaleString()}</span>
						{#if $gameState.players[0].isRiichi}<span class="riichi-badge">立直</span>{/if}
						{#if $gameState.players[0].isFuriten || $gameState.players[0].isTempFuriten}
							<span class="furiten-badge">振聴</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Your hand + melds + actions -->
			<div class="player-area">
				{#if $gameState.phase === 'player_discard'}
					<!-- Helper sits off to the side so it never breaks the centred discard hint -->
					<div class="helper-launch">
						<button class="action-btn helper-btn" onclick={askHelper} disabled={helperLoading}>
							{helperLoading ? 'Thinking…' : 'Helper 助言'}
						</button>
					</div>
				{/if}
				<div class="player-hand-row">
					<div class="player-hand">
						{#each $gameState.players[0].hand as t, i (t.id)}
							{@const riichiLocked = $gameState.players[0].isRiichi}
							{@const isDrawn = i === $gameState.players[0].hand.length - 1}
							<Tile
								tile={t}
								variant="hand"
								selected={selectedTileId === t.id}
								clickable={$gameState.phase === 'player_discard' &&
									(riichiLocked ? isDrawn : !(riichiActive && !wouldTriggerRiichi(t.id)))}
								disabled={$gameState.phase !== 'player_discard' ||
									(riichiLocked ? !isDrawn : riichiActive && !wouldTriggerRiichi(t.id))}
								riichiTrigger={riichiActive && wouldTriggerRiichi(t.id)}
								dimmed={riichiActive && !wouldTriggerRiichi(t.id)}
								highlight={!riichiLocked && hoveredCode === t.code}
								onclick={() => handleTileClick(t.id)}
								onmouseenter={() => {
									if (!riichiLocked) hoveredCode = t.code;
								}}
								onmouseleave={() => {
									if (!riichiLocked) hoveredCode = null;
								}}
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
									Riichi — drawn tiles auto-discard
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

			<!-- Claim decision — non-blocking docked panel; the board stays visible -->
			{#if $gameState.phase === 'claim_decision'}
				<div class="claim-panel">
					<div class="claim-head">
						{#if $gameState.lastDiscard}
							<Tile tile={$gameState.lastDiscard} variant="meld" />
						{/if}
						<span class="claim-title">
							Claim {seatNames[$gameState.lastDiscardSeat ?? 0]}'s discard?
						</span>
					</div>
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
			{/if}

			<!-- In-round AI helper — non-blocking docked panel -->
			{#if helperAdvice || helperError}
				<div class="helper-panel">
					<div class="helper-head">
						<span class="helper-title">助言 — Coach</span>
						<button class="helper-close" onclick={dismissHelper} aria-label="Dismiss">✕</button>
					</div>
					<div class="helper-body">
						{#if helperError}
							<p class="helper-error">{helperError}</p>
						{:else if helperAdvice}
							<div class="helper-discard">
								Discard <strong>{helperAdvice.discard}</strong>
							</div>
							<p class="helper-reason">{helperAdvice.reasoning}</p>
							{#if helperAdvice.plan}
								<p class="helper-plan"><span class="helper-lbl">Plan</span> {helperAdvice.plan}</p>
							{/if}
						{/if}
					</div>
				</div>
			{/if}
		</div>
		<!-- /stage -->

		<!-- Round end overlay -->
		{#if $gameState.phase === 'round_end'}
			<div class="overlay">
				<div class="result-card">
					{#if $gameState.roundResult}
						{@const rr = $gameState.roundResult}
						{@const lim = limitName(rr.han, rr.fu)}
						<div class="win-announcement">
							{rr.winType === 'tsumo' ? '自摸' : '栄和'}
						</div>
						<p class="winner-name">
							{seatNames[rr.winner]} wins!
						</p>

						<!-- Yaku breakdown — which yaku and how the score was built -->
						<div class="yaku-list">
							{#each rr.yaku as y (y.name)}
								<div class="yaku-row">
									<span class="yaku-name">{y.name}</span>
									<span class="yaku-han">{y.han} han</span>
								</div>
							{/each}
						</div>
						<p class="score-detail">
							{#if lim}<span class="limit-name">{lim}</span> ·
							{/if}{rr.han} han / {rr.fu} fu → {rr.score.toLocaleString()} pts
							<span class="win-type">({rr.winType})</span>
						</p>

						<div class="score-changes">
							{#each rr.pointChanges as change, i (i)}
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

					<!-- Post-game overview (Claude) — on demand -->
					{#if overview}
						<div class="overview">
							<p class="overview-narrative">{overview.narrative}</p>
							{#if overview.lessons.length}
								<ul class="overview-lessons">
									{#each overview.lessons as lesson, li (li)}
										<li>{lesson}</li>
									{/each}
								</ul>
							{/if}
						</div>
					{:else if overviewError}
						<p class="overview-error">{overviewError}</p>
					{:else}
						<button class="action-btn review-btn" onclick={askOverview} disabled={overviewLoading}>
							{overviewLoading ? 'Reviewing…' : 'Review this game 講評'}
						</button>
					{/if}

					<button class="action-btn" onclick={startGame}>New Game</button>
				</div>
			</div>
		{/if}

		<!-- Dev cheat panel — floats over the viewport, outside the scaled stage -->
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
	{/if}
</div>

<style>
	:global(body) {
		background: #0b0a0a;
		color: #e8e0d5;
		font-family: 'Inter', system-ui, sans-serif;
		margin: 0;
	}

	/* Full-viewport letterbox area that centres the stage */
	.viewport {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #050505;
		overflow: hidden;
	}

	/* Fixed 16:9 stage that scales to fit. Everything inside is sized in cq units
	   (--u = 1% of stage height) so the whole table scales together. */
	.stage {
		position: relative;
		width: min(100vw, calc(100vh * 16 / 9));
		height: min(100vh, calc(100vw * 9 / 16));
		container-type: size;
		--u: 1cqh;
		display: flex;
		flex-direction: column;
		gap: calc(var(--u) * 1);
		padding: calc(var(--u) * 1.5) calc(var(--u) * 2);
		box-sizing: border-box;
		background: #0b0a0a;
		overflow: hidden;
	}

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100vh;
		font-size: 1.2rem;
		color: #888;
	}

	/* Tile sizes scale with the stage (cq units), overriding Tile.svelte's px
	   defaults. One place to tune the whole table's tile scale. */
	.stage :global(.variant-hand) {
		width: calc(var(--u) * 7.5);
		height: calc(var(--u) * 10);
		font-size: calc(var(--u) * 3);
	}
	/* River/discard tiles are small (≈⅓ of the hand tile, Mahjong-Soul style) so a
	   full 6-wide river stays compact and readable instead of bloating into the centre. */
	.stage :global(.variant-pond) {
		width: calc(var(--u) * 2.8);
		height: calc(var(--u) * 3.7);
		font-size: calc(var(--u) * 1.45);
	}
	.stage :global(.variant-meld) {
		width: calc(var(--u) * 3);
		height: calc(var(--u) * 4);
		font-size: calc(var(--u) * 1.5);
	}
	.stage :global(.variant-dora) {
		width: calc(var(--u) * 3.4);
		height: calc(var(--u) * 4.5);
		font-size: calc(var(--u) * 1.7);
	}
	.stage :global(.tile-back.variant-pond) {
		width: calc(var(--u) * 2.6);
		height: calc(var(--u) * 3.6);
	}

	.game-header {
		display: flex;
		gap: calc(var(--u) * 1.5);
		align-items: center;
		padding: 0 calc(var(--u) * 0.5) calc(var(--u) * 0.5);
		border-bottom: 1px solid #1e1c1a;
		font-size: calc(var(--u) * 1.8);
		color: #8a8278;
		flex: none;
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
	/* Outer grid: each player's hand sits at their own edge; the centre cluster
	   (rivers ringing the board) fills the middle. */
	.board {
		flex: 1;
		min-height: 0;
		width: 100%;
		display: grid;
		grid-template-columns: auto 1fr auto;
		grid-template-rows: auto 1fr auto;
		grid-template-areas:
			'.     htop   .'
			'hleft center hright'
			'.     hbot   .';
		gap: calc(var(--u) * 1);
		align-items: center;
		justify-items: center;
		padding: calc(var(--u) * 1.5);
		border-radius: calc(var(--u) * 1.6);
		border: 1px solid #1b1916;
		/* faint cool-dark felt with a centre glow + edge vignette */
		background: radial-gradient(ellipse 64% 60% at 50% 50%, #15191b 0%, #101315 60%, #0c0e0f 100%);
		box-shadow:
			inset 0 0 60px rgba(0, 0, 0, 0.6),
			inset 0 0 0 1px rgba(255, 255, 255, 0.015);
	}

	.hand-top {
		grid-area: htop;
	}
	.hand-left {
		grid-area: hleft;
	}
	.hand-right {
		grid-area: hright;
	}
	.hand-bottom {
		grid-area: hbot;
	}
	.center-cluster {
		grid-area: center;
	}

	.hand-slot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(var(--u) * 0.6);
	}

	/* Side hands run vertically down their edge: a column of sideways (landscape)
	   back tiles, so the opponent reads as seated on that side. */
	.hand-left .concealed,
	.hand-right .concealed {
		flex-direction: column;
		flex-wrap: nowrap;
		max-width: none;
	}
	.hand-left .concealed :global(.tile-back.variant-pond),
	.hand-right .concealed :global(.tile-back.variant-pond) {
		width: calc(var(--u) * 3.6);
		height: calc(var(--u) * 2.6);
	}

	/* Side open melds match the vertical hand: groups stack top→down and each tile
	   is landscape with its glyph rotated to face the centre (no transform on the
	   tile box, so the column reflows cleanly). */
	.hand-left .seat-melds,
	.hand-right .seat-melds {
		flex-direction: column;
		flex-wrap: nowrap;
		align-items: center;
	}
	.hand-left .meld-group,
	.hand-right .meld-group {
		flex-direction: column;
	}
	.hand-left .seat-melds :global(.tile.variant-meld),
	.hand-right .seat-melds :global(.tile.variant-meld) {
		width: calc(var(--u) * 4);
		height: calc(var(--u) * 3);
	}
	.hand-left .seat-melds :global(.tile.variant-meld .label) {
		transform: rotate(90deg);
	}
	.hand-right .seat-melds :global(.tile.variant-meld .label) {
		transform: rotate(-90deg);
	}

	/* Centre cluster: a 3×3 ring of rivers around the central board. */
	.center-cluster {
		display: grid;
		grid-template-columns: auto auto auto;
		grid-template-rows: auto auto auto;
		grid-template-areas:
			'.      rtop   .'
			'rleft  cboard rright'
			'.      rbot   .';
		align-items: center;
		justify-items: center;
		gap: calc(var(--u) * 0.8);
	}
	.river-top {
		grid-area: rtop;
	}
	.river-left {
		grid-area: rleft;
	}
	.river-right {
		grid-area: rright;
	}
	.river-bottom {
		grid-area: rbot;
	}
	.center-board {
		grid-area: cboard;
	}

	/* Seat info chip */
	.seat-chip {
		display: inline-flex;
		align-items: center;
		gap: calc(var(--u) * 0.8);
		padding: calc(var(--u) * 0.4) calc(var(--u) * 1);
		background: #15140f;
		border: 1px solid #262320;
		border-radius: 999px;
		font-size: calc(var(--u) * 1.5);
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
		font-size: calc(var(--u) * 1.8);
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
		font-size: calc(var(--u) * 1.6);
	}

	.furiten-badge {
		color: #888;
		font-size: calc(var(--u) * 1.5);
		border: 1px solid #444;
		border-radius: 3px;
		padding: 0 calc(var(--u) * 0.5);
	}

	.concealed {
		display: flex;
		gap: calc(var(--u) * 0.2);
		flex-wrap: nowrap;
		justify-content: center;
	}

	.seat-melds,
	.player-melds {
		display: flex;
		gap: calc(var(--u) * 0.7);
		flex-wrap: wrap;
		justify-content: center;
	}

	.meld-group {
		display: flex;
		gap: calc(var(--u) * 0.2);
		background: rgba(0, 0, 0, 0.25);
		border-radius: 3px;
		padding: calc(var(--u) * 0.3);
	}

	/* Discard pond — 6 per row, growing downward (left→right from the seat's view) */
	.pond {
		display: grid;
		grid-template-columns: repeat(6, auto);
		gap: calc(var(--u) * 0.4);
		justify-content: center;
	}

	/* Each river hugs the centre board and is rotated to face its seat. The side
	   slots reserve the rotated bounding box (fixed width / generous min-height) so
	   the transformed pond doesn't shove the central board around. */
	.river-top .pond {
		transform: rotate(180deg);
	}
	.river-left,
	.river-right {
		display: flex;
		align-items: center;
		justify-content: center;
		width: calc(var(--u) * 17);
		min-height: calc(var(--u) * 20);
	}
	.river-left .pond {
		transform: rotate(90deg);
	}
	.river-right .pond {
		transform: rotate(-90deg);
	}

	/* Centre board */
	.center-board {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(var(--u) * 0.5);
		padding: calc(var(--u) * 0.8) calc(var(--u) * 1.1);
		border-radius: calc(var(--u) * 1.2);
		background: rgba(0, 0, 0, 0.28);
		border: 1px solid #1c1a17;
		min-width: calc(var(--u) * 14);
	}

	.center-round {
		font-family: 'Noto Serif JP', serif;
		font-size: calc(var(--u) * 2.8);
		font-weight: 700;
		color: #e8e0d5;
		line-height: 1;
	}

	.center-honba {
		font-size: calc(var(--u) * 1.5);
		color: #c41e3a;
	}

	.center-wall {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin: calc(var(--u) * 0.2) 0;
	}

	.wall-num {
		font-size: calc(var(--u) * 2.6);
		font-weight: 700;
		color: #cfc7bb;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.wall-unit {
		font-size: calc(var(--u) * 1.2);
		color: #6a6258;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.center-dora {
		display: flex;
		align-items: center;
		gap: calc(var(--u) * 0.6);
	}

	.dora-label {
		font-family: 'Noto Serif JP', serif;
		font-size: calc(var(--u) * 1.5);
		color: #8a8278;
	}

	.center-sticks {
		display: flex;
		align-items: center;
		gap: calc(var(--u) * 0.6);
		font-size: calc(var(--u) * 1.4);
		color: #b7ada0;
	}

	.stick-dot {
		width: calc(var(--u) * 2.6);
		height: calc(var(--u) * 0.6);
		border-radius: 2px;
		background: #d8d2c6;
		box-shadow: 0 0 0 1px #c41e3a inset;
		position: relative;
	}

	/* ── Your hand ─────────────────────────────────────────────────────── */
	.player-area {
		position: relative;
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(var(--u) * 1);
	}

	/* Helper button floats to the left of the hand so the centred "click to
	   discard" hint in .player-actions stays symmetric. */
	.helper-launch {
		position: absolute;
		left: calc(var(--u) * 2);
		top: 50%;
		transform: translateY(-50%);
		z-index: 2;
	}

	.player-hand-row {
		display: flex;
		align-items: flex-end;
		gap: calc(var(--u) * 1.6);
		flex-wrap: wrap;
		justify-content: center;
	}

	.player-hand {
		display: flex;
		gap: calc(var(--u) * 0.7);
		padding-top: calc(var(--u) * 1.4); /* room for hover/selected lift */
	}

	.player-actions {
		min-height: calc(var(--u) * 4.5);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: calc(var(--u) * 0.8);
		flex-wrap: wrap;
	}

	.action-hint {
		font-size: calc(var(--u) * 1.7);
		color: #6a6258;
		margin: 0;
	}

	.action-btn {
		padding: calc(var(--u) * 0.9) calc(var(--u) * 2.4);
		background: #c41e3a;
		color: #fff;
		border: none;
		border-radius: calc(var(--u) * 0.6);
		cursor: pointer;
		font-size: calc(var(--u) * 1.8);
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

	.helper-btn {
		background: #2a4d6e;
	}
	.helper-btn:hover {
		background: #21405c;
	}
	.helper-btn:disabled {
		opacity: 0.7;
		cursor: default;
	}

	/* ── In-round helper panel — non-blocking, docked bottom-left of the stage ── */
	.helper-panel {
		position: absolute;
		left: calc(var(--u) * 3);
		bottom: calc(var(--u) * 18);
		z-index: 40;
		width: calc(var(--u) * 36);
		max-width: 90vw;
		/* Cap the height so a long response can never grow the panel past the close
		   button — the head stays pinned and the body scrolls inside (see UI_09). */
		max-height: calc(var(--u) * 40);
		display: flex;
		flex-direction: column;
		gap: calc(var(--u) * 0.8);
		padding: calc(var(--u) * 1.4) calc(var(--u) * 1.6);
		background: rgba(16, 20, 26, 0.97);
		border: 1px solid #2f3b4c;
		border-left: 3px solid #3f6f9e;
		border-radius: calc(var(--u) * 1.2);
		box-shadow: 0 calc(var(--u) * 1) calc(var(--u) * 3) rgba(0, 0, 0, 0.6);
	}
	.helper-head {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: calc(var(--u) * 1);
	}
	.helper-body {
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: calc(var(--u) * 0.8);
		min-height: 0;
	}
	.helper-title {
		font-family: 'Noto Serif JP', serif;
		font-size: calc(var(--u) * 1.6);
		color: #9fc3e6;
	}
	.helper-close {
		background: none;
		border: none;
		color: #6a7686;
		cursor: pointer;
		font-size: calc(var(--u) * 1.6);
		line-height: 1;
		padding: 0;
	}
	.helper-close:hover {
		color: #cfd8e2;
	}
	.helper-discard {
		font-size: calc(var(--u) * 1.7);
		color: #cfc7bb;
	}
	.helper-discard strong {
		color: #fff;
		font-size: calc(var(--u) * 2);
	}
	.helper-reason {
		margin: 0;
		font-size: calc(var(--u) * 1.5);
		line-height: 1.45;
		color: #b7ada0;
	}
	.helper-plan {
		margin: 0;
		font-size: calc(var(--u) * 1.45);
		color: #97b8d6;
	}
	.helper-lbl {
		font-size: calc(var(--u) * 1.2);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #6a7686;
	}
	.helper-error {
		margin: 0;
		font-size: calc(var(--u) * 1.5);
		color: #c41e3a;
	}

	/* ── Claim panel — non-blocking, docked bottom-right of the stage ───── */
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
		max-width: 30rem;
	}

	/* Post-game overview */
	.review-btn {
		background: #2a4d6e;
		margin-bottom: 0.75rem;
	}
	.review-btn:hover {
		background: #21405c;
	}
	.review-btn:disabled {
		opacity: 0.7;
		cursor: default;
	}
	.overview {
		text-align: left;
		border: 1px solid #2a2724;
		border-left: 3px solid #3f6f9e;
		border-radius: 6px;
		background: rgba(0, 0, 0, 0.3);
		padding: 0.9rem 1.1rem;
		margin-bottom: 1rem;
	}
	.overview-narrative {
		margin: 0 0 0.6rem;
		font-size: 0.92rem;
		line-height: 1.5;
		color: #cfc7bb;
	}
	.overview-lessons {
		margin: 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.overview-lessons li {
		font-size: 0.88rem;
		line-height: 1.4;
		color: #b7ada0;
	}
	.overview-error {
		color: #c41e3a;
		font-size: 0.9rem;
		margin: 0 0 1rem;
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

	/* Yaku breakdown — the list of yaku that scored, each with its han */
	.yaku-list {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		margin: 0.75rem 0 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid #2a2724;
		border-radius: 6px;
		text-align: left;
	}

	.yaku-row {
		display: flex;
		justify-content: space-between;
		gap: 1.5rem;
		font-size: 0.85rem;
	}

	.yaku-name {
		color: #cfc7bb;
	}

	.yaku-han {
		color: #8a8278;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.score-detail {
		color: #888;
		font-size: 0.9rem;
		margin: 0.25rem 0 1rem;
	}

	.limit-name {
		color: #c41e3a;
		font-weight: 600;
	}

	.win-type {
		opacity: 0.7;
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
		position: fixed;
		top: 0.5rem;
		left: 0.5rem;
		z-index: 200;
		max-width: 60vw;
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
