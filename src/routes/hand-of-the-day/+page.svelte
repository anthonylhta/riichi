<script lang="ts">
	import Tile from '$lib/components/Tile.svelte';
	import { tileLabel } from '$lib/game/tiles';
	import type { TileCode } from '$lib/game/tiles';

	let { data } = $props();
	let puzzle = $derived(data.today?.puzzle ?? null);

	// One synthetic GameTile per hand position (no red fives in puzzles for now).
	let handTiles = $derived(
		(puzzle?.hand ?? []).map((code: TileCode, id: number) => ({ code, id, isRed: false }))
	);
	let acceptTiles = $derived(
		(puzzle?.ukeireTiles ?? []).map((code: TileCode, id: number) => ({ code, id, isRed: false }))
	);

	let selected = $state<number | null>(null);
	let revealed = $derived(selected !== null);
	let chosenCode = $derived(selected === null ? null : handTiles[selected].code);
	let isCorrect = $derived(
		chosenCode !== null && (puzzle?.bestDiscards ?? []).includes(chosenCode)
	);

	function pick(i: number) {
		if (selected === null) selected = i;
	}

	function isBest(code: TileCode): boolean {
		return (puzzle?.bestDiscards ?? []).includes(code);
	}
</script>

<div class="hotd">
	<header class="hotd-head">
		<a class="back" href="/">← Menu</a>
		<div class="title-block">
			<span class="jp">今日の手牌</span>
			<h1>Hand of the Day</h1>
			{#if data.today}<span class="date">{data.today.date}</span>{/if}
		</div>
	</header>

	{#if data.error || !puzzle}
		<p class="error">{data.error ?? 'No puzzle available.'}</p>
	{:else}
		<div class="context">
			<span class="ctx"><span class="lbl">Round</span> {tileLabel(puzzle.roundWind)}</span>
			<span class="ctx"><span class="lbl">Seat</span> {tileLabel(puzzle.seatWind)}</span>
			<span class="ctx dora">
				<span class="lbl">ドラ表示</span>
				<Tile tile={{ code: puzzle.doraIndicator, id: -1, isRed: false }} variant="meld" />
			</span>
		</div>

		<p class="question">{puzzle.question}</p>

		<div class="hand">
			{#each handTiles as t, i (t.id)}
				<button
					class="tile-btn"
					class:wrong={revealed && i === selected && !isCorrect}
					disabled={revealed}
					onclick={() => pick(i)}
				>
					<Tile
						tile={t}
						variant="hand"
						selected={i === selected}
						highlight={revealed && isBest(t.code)}
						dimmed={revealed && !isBest(t.code) && i !== selected}
					/>
				</button>
			{/each}
		</div>

		{#if revealed}
			<div class="result" class:ok={isCorrect}>
				<div class="verdict">
					{isCorrect ? '正解 — Correct!' : '惜しい — Not the best'}
				</div>
				<p class="answer">
					Best discard:
					<strong>{puzzle.bestDiscards.map((c: TileCode) => tileLabel(c)).join(' / ')}</strong>
					— leaves {puzzle.bestShanten}-shanten, accepts <strong>{puzzle.ukeire}</strong> tiles.
				</p>
				{#if acceptTiles.length}
					<div class="accepts">
						<span class="lbl">Accepts</span>
						<div class="accept-tiles">
							{#each acceptTiles as t (t.id)}
								<Tile tile={t} variant="meld" />
							{/each}
						</div>
					</div>
				{/if}
				<p class="explanation">{puzzle.explanation}</p>
			</div>
		{:else}
			<p class="hint">Tap the tile you'd discard.</p>
		{/if}

		<p class="shared">Everyone gets the same puzzle today.</p>
	{/if}
</div>

<style>
	:global(body) {
		background: #0b0a0a;
		color: #e8e0d5;
		font-family: 'Inter', system-ui, sans-serif;
		margin: 0;
	}

	.hotd {
		max-width: 760px;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
	}

	.hotd-head {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.back {
		color: #8a8278;
		text-decoration: none;
		font-size: 0.85rem;
		white-space: nowrap;
	}
	.back:hover {
		color: #e8e0d5;
	}

	.title-block {
		flex: 1;
		text-align: center;
	}
	.title-block .jp {
		font-family: 'Noto Serif JP', serif;
		color: #c41e3a;
		font-size: 0.9rem;
		letter-spacing: 0.1em;
	}
	.title-block h1 {
		margin: 0.1rem 0 0;
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}
	.date {
		color: #6a6258;
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
	}

	.context {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		flex-wrap: wrap;
		justify-content: center;
	}
	.ctx {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 1rem;
		color: #cfc7bb;
	}
	.ctx.dora {
		gap: 0.5rem;
	}
	.lbl {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #6a6258;
	}

	.question {
		text-align: center;
		font-size: 1.05rem;
		color: #e8e0d5;
		margin: 0;
		max-width: 38rem;
	}

	.hand {
		display: flex;
		gap: 5px;
		flex-wrap: wrap;
		justify-content: center;
		padding-top: 9px;
	}

	.tile-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		border-radius: 6px;
	}
	.tile-btn:disabled {
		cursor: default;
	}
	.tile-btn.wrong {
		outline: 2px solid #c41e3a;
		outline-offset: 1px;
		border-radius: 6px;
	}

	.hint {
		color: #6a6258;
		font-size: 0.85rem;
		margin: 0;
	}

	.result {
		width: 100%;
		max-width: 40rem;
		border: 1px solid #2a2724;
		border-left: 3px solid #c41e3a;
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.3);
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.result.ok {
		border-left-color: #4caf50;
	}

	.verdict {
		font-family: 'Noto Serif JP', serif;
		font-size: 1.2rem;
		color: #c41e3a;
	}
	.result.ok .verdict {
		color: #4caf50;
	}

	.answer {
		margin: 0;
		font-size: 0.95rem;
		color: #cfc7bb;
	}
	.answer strong {
		color: #e8e0d5;
	}

	.accepts {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.accept-tiles {
		display: flex;
		gap: 3px;
		flex-wrap: wrap;
	}

	.explanation {
		margin: 0;
		font-size: 0.95rem;
		line-height: 1.5;
		color: #b7ada0;
	}

	.shared {
		color: #6a6258;
		font-size: 0.78rem;
		margin: 0;
	}

	.error {
		color: #c41e3a;
	}
</style>
