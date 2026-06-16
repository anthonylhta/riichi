<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import GameBoard from '$lib/components/game/GameBoard.svelte';
	import Tile from '$lib/components/Tile.svelte';
	import { groupMovesByRound, type ReplayStep } from '$lib/game/replayView';
	import type { Seat } from '$lib/game/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let steps = $state<ReplayStep[] | null>(null);
	let index = $state(0);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let playing = $state(false);
	let revealAll = $state(false);
	let showMoves = $state(true);
	let listEl = $state<HTMLElement | null>(null);

	const WIND_NAMES = ['East', 'South', 'West', 'North'];
	const windIndex = (seat: Seat, dealer: Seat) => (seat - dealer + 4) % 4;

	const step = $derived(steps && steps.length > 0 ? steps[index] : null);
	const seatNames = $derived.by(() => {
		const dealer = (step?.view.dealer ?? 0) as Seat;
		return ([0, 1, 2, 3] as const).map((s) => (s === 0 ? 'You' : WIND_NAMES[windIndex(s, dealer)]));
	});
	const atEnd = $derived(!steps || index >= steps.length - 1);
	const atStart = $derived(index <= 0);
	const lastIndex = $derived(steps ? steps.length - 1 : 0);

	const moveGroups = $derived(groupMovesByRound(steps ?? []));

	// Keep the active move scrolled into view as playback / stepping moves on.
	$effect(() => {
		void index;
		if (!showMoves || !listEl) return;
		listEl.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
	});

	onMount(async () => {
		if (!data.signedIn || !data.hasReplay) {
			loading = false;
			return;
		}
		try {
			const [res, { replayGame }, { buildReplaySteps }] = await Promise.all([
				fetch(`/api/games/${data.gameId}/replay`),
				import('$lib/game/replay'),
				import('$lib/game/replayView')
			]);
			if (!res.ok) throw new Error(`replay fetch failed (${res.status})`);
			const { final } = await replayGame(await res.json());
			const built = buildReplaySteps(final.events);
			if (built.length === 0) throw new Error('no steps');
			steps = built;
			index = 0;
		} catch (e) {
			loadError = 'The replay could not be loaded.';
			console.error('replay viewer:', e);
		} finally {
			loading = false;
		}
	});

	function go(to: number) {
		if (!steps) return;
		index = Math.max(0, Math.min(steps.length - 1, to));
	}
	function next() {
		go(index + 1);
	}
	function prev() {
		go(index - 1);
	}
	function togglePlay() {
		if (atEnd) {
			go(0);
			playing = true;
		} else {
			playing = !playing;
		}
	}

	// Autoplay: advance on a timer while `playing`, stopping at the last step.
	let timer: ReturnType<typeof setInterval> | null = null;
	$effect(() => {
		if (playing && steps) {
			timer = setInterval(() => {
				if (atEnd) {
					playing = false;
				} else {
					index = index + 1;
				}
			}, 850);
		}
		return () => {
			if (timer) clearInterval(timer);
			timer = null;
		};
	});

	function onKey(e: KeyboardEvent) {
		if (!steps) return;
		switch (e.key) {
			case 'ArrowRight':
			case ' ':
				e.preventDefault();
				playing = false;
				next();
				break;
			case 'ArrowLeft':
				e.preventDefault();
				playing = false;
				prev();
				break;
			case 'Home':
				e.preventDefault();
				go(0);
				break;
			case 'End':
				e.preventDefault();
				go(steps.length - 1);
				break;
		}
	}
	onDestroy(() => {
		if (timer) clearInterval(timer);
	});
</script>

<svelte:window on:keydown={onKey} />

{#if loading}
	<div class="screen"><p class="muted">Loading replay…</p></div>
{:else if !data.signedIn}
	<div class="screen">
		<p class="jp">牌譜再生</p>
		<h1>Sign in to watch replays</h1>
		<a class="link" href="/profile">← Profile</a>
	</div>
{:else if !data.hasReplay}
	<div class="screen">
		<h1>No replay for this game</h1>
		<p class="muted">Games saved before replays were captured can't be played back.</p>
		<a class="link" href="/profile/games/{data.gameId}">← Back to game</a>
	</div>
{:else if loadError}
	<div class="screen">
		<h1>{loadError}</h1>
		<a class="link" href="/profile/games/{data.gameId}">← Back to game</a>
	</div>
{:else if step && steps}
	<div class="viewport">
		<div class="stage">
			<div class="stage-main">
				<!-- Top bar: back, round, the step description -->
				<header class="vh">
					<a class="back" href="/profile/games/{data.gameId}">← Game</a>
					<div class="vh-mid">
						<span class="vh-round">{step.roundWindKanji}{step.roundNumber}</span>
						<span class="vh-label">{step.label}</span>
					</div>
					<div class="vh-toggles">
						<button
							class="toggle-btn"
							class:on={showMoves}
							onclick={() => (showMoves = !showMoves)}
						>
							Moves 牌譜
						</button>
						<label class="reveal">
							<input type="checkbox" bind:checked={revealAll} />
							Reveal all
						</label>
					</div>
				</header>

				<GameBoard
					state={step.view}
					{seatNames}
					hoveredCode={null}
					roundWindKanji={step.roundWindKanji}
					roundNumber={step.roundNumber}
					{revealAll}
				/>

				<!-- Your hand, face-up and non-interactive -->
				<div class="player-area">
					{#if step.outcome}
						<div class="outcome" class:draw={step.outcome.type === 'draw'}>
							{#if step.outcome.type === 'win'}
								<span class="outcome-jp">{step.outcome.tsumo ? '自摸' : '栄和'}</span>
								<span class="outcome-main"
									>{step.outcome.winnerName}
									{step.outcome.tsumo ? 'tsumo' : 'ron'} · {step.outcome.han} han / {step.outcome
										.fu} fu · {step.outcome.score}</span
								>
								<span class="outcome-yaku">{step.outcome.yaku.map((y) => y.name).join(', ')}</span>
							{:else}
								<span class="outcome-jp">流局</span>
								<span class="outcome-main">{step.label}</span>
							{/if}
						</div>
					{/if}
					<div class="player-hand-row">
						<div class="player-hand">
							{#each step.view.players[0].hand as t (t.id)}
								<Tile tile={t} variant="hand" />
							{/each}
						</div>
						{#if step.view.players[0].melds.length > 0}
							<div class="player-melds">
								{#each step.view.players[0].melds as meld, mi (mi)}
									<div class="meld-group">
										{#each meld.tiles as t (t.id)}
											<Tile tile={t} variant="meld" />
										{/each}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<!-- Transport controls -->
				<div class="controls">
					<button class="ctrl" onclick={() => go(0)} disabled={atStart} aria-label="First"
						>⏮</button
					>
					<button class="ctrl" onclick={prev} disabled={atStart} aria-label="Previous">◀</button>
					<button class="ctrl play" onclick={togglePlay} aria-label="Play/pause">
						{playing ? '⏸' : '▶'}
					</button>
					<button class="ctrl" onclick={next} disabled={atEnd} aria-label="Next">▶</button>
					<button class="ctrl" onclick={() => go(lastIndex)} disabled={atEnd} aria-label="Last"
						>⏭</button
					>
					<input
						class="scrub"
						type="range"
						min="0"
						max={steps.length - 1}
						value={index}
						oninput={(e) => {
							playing = false;
							go(Number(e.currentTarget.value));
						}}
					/>
					<span class="counter">{index + 1} / {steps.length}</span>
				</div>
			</div>

			{#if showMoves}
				<aside class="move-list" bind:this={listEl} aria-label="Move list">
					{#each moveGroups as g (g.header + '-' + (g.items[0]?.idx ?? 0))}
						<div class="ml-round">{g.header}</div>
						{#each g.items as it (it.idx)}
							<button
								class="ml-move"
								data-kind={it.kind}
								data-active={it.idx === index}
								class:active={it.idx === index}
								onclick={() => {
									playing = false;
									go(it.idx);
								}}
							>
								{it.label}
							</button>
						{/each}
					{/each}
				</aside>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Full-screen message states */
	.screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		height: 100vh;
		text-align: center;
		padding: 0 1.5rem;
	}
	.screen h1 {
		margin: 0;
		font-size: 1.3rem;
		color: #e8e0d5;
	}
	.jp {
		font-family: 'Noto Serif JP', serif;
		color: #c41e3a;
		letter-spacing: 0.15em;
		margin: 0;
	}
	.muted {
		color: #9a9286;
	}
	.link {
		color: #c41e3a;
		text-decoration: none;
	}
	.link:hover {
		text-decoration: underline;
	}

	/* Letterboxed, fixed-aspect stage — same scaling model as the game page. */
	.viewport {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #050505;
		overflow: hidden;
	}
	.stage {
		position: relative;
		width: min(100vw, calc(100vh * 16 / 9));
		height: min(100vh, calc(100vw * 9 / 16));
		container-type: size;
		--u: 1cqh;
		display: flex;
		flex-direction: row;
		gap: calc(var(--u) * 1.5);
		padding: calc(var(--u) * 1.5) calc(var(--u) * 2);
		box-sizing: border-box;
		background: #0b0a0a;
		overflow: hidden;
	}

	/* The board column — the vertical stack (header / board / hand / controls).
	   The move-list sidebar sits beside it; min-width:0 lets the board shrink. */
	.stage-main {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: calc(var(--u) * 1);
	}

	/* Tile scaling for everything inside the stage (cq units). */
	.stage :global(.variant-hand) {
		width: calc(var(--u) * 7.5);
		height: calc(var(--u) * 10);
		font-size: calc(var(--u) * 3);
	}
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

	/* Header */
	.vh {
		flex: none;
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: calc(var(--u) * 1);
		font-size: calc(var(--u) * 1.6);
	}
	.back {
		justify-self: start;
		color: #9a9286;
		text-decoration: none;
	}
	.back:hover {
		color: #e8e0d5;
	}
	.vh-mid {
		display: flex;
		align-items: baseline;
		gap: calc(var(--u) * 1.2);
		justify-self: center;
	}
	.vh-round {
		font-family: 'Noto Serif JP', serif;
		font-size: calc(var(--u) * 2.4);
		font-weight: 700;
		color: #e8e0d5;
	}
	.vh-label {
		color: #cfc7bb;
	}
	.vh-toggles {
		justify-self: end;
		display: inline-flex;
		align-items: center;
		gap: calc(var(--u) * 1.2);
	}
	.toggle-btn {
		background: #1b1916;
		border: 1px solid #2e2a26;
		color: #9a9286;
		border-radius: calc(var(--u) * 0.6);
		padding: calc(var(--u) * 0.4) calc(var(--u) * 1);
		font: inherit;
		font-size: calc(var(--u) * 1.5);
		cursor: pointer;
		white-space: nowrap;
	}
	.toggle-btn:hover {
		color: #e8e0d5;
	}
	.toggle-btn.on {
		border-color: #c41e3a;
		color: #e8e0d5;
	}
	.reveal {
		display: inline-flex;
		align-items: center;
		gap: calc(var(--u) * 0.6);
		color: #9a9286;
		cursor: pointer;
		user-select: none;
	}
	.reveal input {
		accent-color: #c41e3a;
		cursor: pointer;
	}

	/* Move list sidebar — the readable transcript; click a line to jump there. */
	.move-list {
		flex: none;
		width: calc(var(--u) * 32);
		display: flex;
		flex-direction: column;
		gap: calc(var(--u) * 0.2);
		overflow-y: auto;
		padding: calc(var(--u) * 0.6);
		border-radius: calc(var(--u) * 1);
		background: rgba(0, 0, 0, 0.28);
		border: 1px solid #1c1a17;
		font-size: calc(var(--u) * 1.5);
	}
	.ml-round {
		position: sticky;
		top: calc(var(--u) * -0.6);
		background: #14110f;
		color: #c8a878;
		font-family: 'Noto Serif JP', serif;
		font-size: calc(var(--u) * 1.7);
		padding: calc(var(--u) * 0.5) calc(var(--u) * 0.6);
		margin-top: calc(var(--u) * 0.4);
		border-radius: calc(var(--u) * 0.5);
		z-index: 1;
	}
	.ml-move {
		text-align: left;
		background: none;
		border: none;
		color: #b7ada0;
		padding: calc(var(--u) * 0.45) calc(var(--u) * 0.8);
		border-radius: calc(var(--u) * 0.5);
		cursor: pointer;
		font: inherit;
		font-size: calc(var(--u) * 1.45);
		line-height: 1.25;
	}
	.ml-move:hover {
		background: rgba(255, 255, 255, 0.05);
		color: #e8e0d5;
	}
	.ml-move[data-kind='win'] {
		color: #d98b95;
	}
	.ml-move[data-kind='draw_end'] {
		color: #8a8278;
		font-style: italic;
	}
	.ml-move[data-kind='dora'],
	.ml-move[data-kind='kan'] {
		color: #c8a878;
	}
	.ml-move.active {
		background: rgba(196, 30, 58, 0.18);
		color: #f3ece0;
		box-shadow: inset 2px 0 0 #c41e3a;
	}

	/* Your hand */
	.player-area {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(var(--u) * 0.8);
	}
	.player-hand-row {
		display: flex;
		align-items: flex-end;
		gap: calc(var(--u) * 1.6);
	}
	.player-hand {
		display: flex;
		gap: calc(var(--u) * 0.5);
	}
	.player-melds {
		display: flex;
		gap: calc(var(--u) * 0.7);
	}
	.meld-group {
		display: flex;
		gap: calc(var(--u) * 0.2);
		background: rgba(0, 0, 0, 0.25);
		border-radius: 3px;
		padding: calc(var(--u) * 0.3);
	}

	/* Round-end outcome banner */
	.outcome {
		display: flex;
		align-items: baseline;
		gap: calc(var(--u) * 1.2);
		padding: calc(var(--u) * 0.6) calc(var(--u) * 1.6);
		border-radius: 999px;
		background: rgba(196, 30, 58, 0.12);
		border: 1px solid rgba(196, 30, 58, 0.5);
		font-size: calc(var(--u) * 1.6);
		color: #e8e0d5;
		max-width: 90%;
	}
	.outcome.draw {
		background: rgba(255, 255, 255, 0.05);
		border-color: #3a3530;
	}
	.outcome-jp {
		font-family: 'Noto Serif JP', serif;
		color: #c41e3a;
		font-size: calc(var(--u) * 2);
	}
	.outcome-yaku {
		color: #9a9286;
		font-size: calc(var(--u) * 1.4);
	}

	/* Transport bar */
	.controls {
		flex: none;
		display: flex;
		align-items: center;
		gap: calc(var(--u) * 1);
		padding-top: calc(var(--u) * 0.4);
	}
	.ctrl {
		background: #1b1916;
		border: 1px solid #2e2a26;
		color: #cfc7bb;
		border-radius: calc(var(--u) * 0.6);
		padding: calc(var(--u) * 0.5) calc(var(--u) * 1.2);
		font-size: calc(var(--u) * 1.8);
		cursor: pointer;
		line-height: 1;
	}
	.ctrl:hover:not(:disabled) {
		background: #2a2622;
		color: #e8e0d5;
	}
	.ctrl:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.ctrl.play {
		border-color: #c41e3a;
		color: #e8e0d5;
	}
	.scrub {
		flex: 1;
		accent-color: #c41e3a;
		cursor: pointer;
	}
	.counter {
		font-variant-numeric: tabular-nums;
		color: #9a9286;
		font-size: calc(var(--u) * 1.5);
		min-width: calc(var(--u) * 8);
		text-align: right;
	}
</style>
