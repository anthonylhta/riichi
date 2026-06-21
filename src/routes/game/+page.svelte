<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
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
		declareKyuushu,
		passClaim,
		gameLog,
		loadResumableReplay,
		resumeGame,
		abandonGame,
		retroSaveLastGame
	} from '$lib/stores/game';
	import { useClerkContext } from 'svelte-clerk/client';
	import type { ReplayLog } from '$lib/game/replay';
	import { tileLabel } from '$lib/game/tiles';
	import { isTenpaiAfterDiscard } from '$lib/game/ai';
	import { getPlayerKanOptions, canDeclareKyuushu } from '$lib/game/engine';
	import { buildReviewPayload, type RoundRecord } from '$lib/game/review';
	import { buildHelperView, type HelperAdvice } from '$lib/game/helper';
	import Tile from '$lib/components/Tile.svelte';
	import GameHeader from '$lib/components/game/GameHeader.svelte';
	import ExitConfirmPanel from '$lib/components/game/ExitConfirmPanel.svelte';
	import DevPanel from '$lib/components/game/DevPanel.svelte';
	import ClaimPanel from '$lib/components/game/ClaimPanel.svelte';
	import HelperPanel from '$lib/components/game/HelperPanel.svelte';
	import RoundEndOverlay from '$lib/components/game/RoundEndOverlay.svelte';
	import GameEndOverlay from '$lib/components/game/GameEndOverlay.svelte';
	import GameBoard from '$lib/components/game/GameBoard.svelte';

	// Post-game overview (Claude) — generated on demand from the flagged moments.
	interface Overview {
		narrative: string;
		lessons: string[];
	}
	let overview = $state<Overview | null>(null);
	let overviewLoading = $state(false);
	let overviewError = $state<string | null>(null);

	// Exit to menu. Mid-game this abandons the game (nothing is saved until
	// game_end — see saveFinishedGame), so it asks first; once the game is over
	// there is nothing to lose and it navigates straight away.
	let confirmExit = $state(false);
	function requestExit() {
		if (!$gameState || $gameState.phase === 'game_end') {
			goto('/');
			return;
		}
		confirmExit = true;
	}

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

	// An interrupted game found in the localStorage mirror — offer to resume it
	// before dealing fresh. Covers exit-without-leaving, tab close and F5.
	let resumeOffer = $state<ReplayLog | null>(null);

	onMount(async () => {
		const log = loadResumableReplay();
		if (log) {
			resumeOffer = log;
			return;
		}
		await startGame();
	});

	// Retro-save the last finished game once the player is signed in. Anonymous
	// players who finish a game and then sign in (via the game-end nudge) get that
	// game saved to their new account. Fires once per signed-in session — on the
	// signed-out → signed-in transition, or on load if already signed in (covering
	// a stale anonymous game from a prior session). retroSaveLastGame is idempotent,
	// so a re-fire is harmless; re-armed on sign-out.
	const clerk = useClerkContext();
	let retroAttempted = false;
	$effect(() => {
		if (!clerk.isLoaded) return;
		if (clerk.auth.userId) {
			if (!retroAttempted) {
				retroAttempted = true;
				void retroSaveLastGame();
			}
		} else {
			retroAttempted = false;
		}
	});

	async function acceptResume() {
		const log = resumeOffer;
		resumeOffer = null;
		if (log) await resumeGame(log);
	}

	async function declineResume() {
		resumeOffer = null;
		await startGame(); // overwrites the mirror — the old game is gone
	}

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

	// Kuikae: tile codes that can't be discarded on the turn right after a
	// chi/pon (the called tile + chi suji other-end). Dimmed and non-clickable.
	const kuikaeForbidden = $derived($gameState?.players[0].kuikaeForbidden ?? []);
	const isKuikae = (t: { code: number }) => kuikaeForbidden.includes(t.code);

	const WIND_NAMES = ['East', 'South', 'West', 'North'];
	const WIND_KANJI = ['東', '南', '西', '北'];

	const ABORT_LABELS: Record<string, string> = {
		kyuushu: 'Abortive draw — nine terminals/honors',
		suufon: 'Abortive draw — four winds discarded',
		'suucha-riichi': 'Abortive draw — four riichi',
		suukaikan: 'Abortive draw — four kans',
		sanchahou: 'Abortive draw — triple ron'
	};

	function windIndex(seat: number, dealer: number): number {
		return (seat - dealer + 4) % 4;
	}

	// Dev panel — only compiled in dev builds
	const isDev = import.meta.env.DEV;
	let devPanelOpen = $state(false);
	type Cheat = (() => Promise<void>) | null;
	let devSetTenpai = $state<Cheat>(null);
	let devSetWinningHand = $state<Cheat>(null);
	let devSetRonClaim = $state<Cheat>(null);
	let devSetPonClaim = $state<Cheat>(null);
	let devSetChiClaim = $state<Cheat>(null);
	let devSetFuriten = $state<Cheat>(null);
	let devSetAnkan = $state<Cheat>(null);
	let devSetKakan = $state<Cheat>(null);
	let devSetDaiminkan = $state<Cheat>(null);
	let devSetTenpaiToRon = $state<Cheat>(null);

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

	// Kyuushu kyuuhai: offered only on the first uninterrupted draw with 9+
	// distinct terminals/honors.
	let canKyuushu = $derived($gameState ? canDeclareKyuushu($gameState) : false);

	// All ron winners for the round-end overlay — usually one, two on a double ron.
	let winners = $derived(
		$gameState?.roundResult ? [$gameState.roundResult, ...$gameState.extraRons] : []
	);
	// Combined point swing across every winner (a double ron pays both).
	let combinedDeltas = $derived(
		winners.reduce((acc, w) => acc.map((v, i) => v + w.pointChanges[i]) as number[], [
			0, 0, 0, 0
		] as number[])
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

<div class="viewport">
	{#if $gameLoading}
		<div class="loading">Shuffling tiles...</div>
	{:else if resumeOffer}
		<div class="resume-screen">
			<span class="resume-jp">中断した対局</span>
			<p class="resume-title">Unfinished game found</p>
			<p class="resume-sub">
				You left a game on hand {resumeOffer.inputs.filter((i) => i.t === 'nextRound').length + 1}.
				Pick up exactly where you left off? Starting a new game discards it.
			</p>
			<div class="resume-actions">
				<button class="action-btn" onclick={acceptResume}>Resume 再開</button>
				<button class="action-btn resume-new" onclick={declineResume}>New Game</button>
			</div>
		</div>
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
			<GameHeader
				{roundWindKanji}
				{roundNumber}
				honba={$gameState.honba}
				wallLeft={$gameState.wallEnd - $gameState.wallPos}
				{isDev}
				{devPanelOpen}
				onMenu={requestExit}
				onToggleDev={() => (devPanelOpen = !devPanelOpen)}
			/>

			<!-- Exit confirmation — docked, non-blocking, same family as the claim panel -->
			{#if confirmExit}
				<ExitConfirmPanel
					onStay={() => (confirmExit = false)}
					onLeave={() => {
						abandonGame();
						goto('/');
					}}
				/>
			{/if}

			<GameBoard state={$gameState} {seatNames} {hoveredCode} {roundWindKanji} {roundNumber} />

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
									!isKuikae(t) &&
									(riichiLocked ? isDrawn : !(riichiActive && !wouldTriggerRiichi(t.id)))}
								disabled={$gameState.phase !== 'player_discard' ||
									isKuikae(t) ||
									(riichiLocked ? !isDrawn : riichiActive && !wouldTriggerRiichi(t.id))}
								riichiTrigger={riichiActive && wouldTriggerRiichi(t.id)}
								dimmed={isKuikae(t) || (riichiActive && !wouldTriggerRiichi(t.id))}
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
						{#if canKyuushu}
							<button class="action-btn kyuushu-btn" onclick={declareKyuushu}>
								Abort 九種九牌
							</button>
						{/if}
					{/if}
				</div>
			</div>

			<!-- Claim decision — non-blocking docked panel; the board stays visible -->
			{#if $gameState.phase === 'claim_decision'}
				<ClaimPanel
					discardTile={$gameState.lastDiscard}
					discarderName={seatNames[$gameState.lastDiscardSeat ?? 0]}
					canRon={!!$gameState.pendingRon}
					claimOptions={$gameState.claimOptions ?? []}
					onRon={declareRon}
					onDaiminkan={claimDaiminkan}
					onPon={claimPon}
					onChi={claimChi}
					onPass={passClaim}
				/>
			{/if}

			<!-- In-round AI helper — non-blocking docked panel -->
			{#if helperAdvice || helperError}
				<HelperPanel advice={helperAdvice} error={helperError} onDismiss={dismissHelper} />
			{/if}
		</div>
		<!-- /stage -->

		<!-- Round end overlay -->
		{#if $gameState.phase === 'round_end'}
			<RoundEndOverlay
				{winners}
				{combinedDeltas}
				exhaustiveDrawResult={$gameState.exhaustiveDrawResult}
				abortiveDraw={$gameState.abortiveDraw}
				{seatNames}
				abortLabels={ABORT_LABELS}
				onNext={nextRound}
			/>
		{/if}

		<!-- Game end overlay -->
		{#if $gameState.phase === 'game_end'}
			<GameEndOverlay
				players={$gameState.players}
				{seatNames}
				{overview}
				{overviewError}
				{overviewLoading}
				onReview={askOverview}
				onMenu={() => goto('/')}
				onNewGame={startGame}
			/>
		{/if}

		<!-- Dev cheat panel — floats over the viewport, outside the scaled stage -->
		{#if isDev && devPanelOpen}
			<DevPanel
				setTenpai={devSetTenpai}
				setWinningHand={devSetWinningHand}
				setRonClaim={devSetRonClaim}
				setPonClaim={devSetPonClaim}
				setChiClaim={devSetChiClaim}
				setFuriten={devSetFuriten}
				setAnkan={devSetAnkan}
				setKakan={devSetKakan}
				setDaiminkan={devSetDaiminkan}
				setTenpaiToRon={devSetTenpaiToRon}
			/>
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

	/* Resume offer — full-screen card shown before any game exists. */
	.resume-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		height: 100vh;
		text-align: center;
		padding: 0 1.5rem;
	}
	.resume-jp {
		font-family: 'Noto Serif JP', serif;
		color: #c41e3a;
		font-size: 1rem;
		letter-spacing: 0.15em;
	}
	.resume-title {
		margin: 0;
		font-size: 1.4rem;
		font-weight: 700;
		color: #e8e0d5;
	}
	.resume-sub {
		margin: 0 0 0.8rem;
		font-size: 0.9rem;
		color: #9a9286;
		max-width: 26rem;
		line-height: 1.5;
	}
	.resume-actions {
		display: flex;
		gap: 0.8rem;
	}
	.resume-new {
		background: #2e2a26;
		color: #cfc7bb;
	}
	.resume-new:hover {
		background: #3a342c;
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

	.kyuushu-btn {
		background: #6b5a1a;
	}

	.kyuushu-btn:hover {
		background: #50430f;
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
