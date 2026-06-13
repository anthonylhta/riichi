<script lang="ts">
	import { limitName } from '$lib/game/scoring';
	import type { RoundResult, ExhaustiveDrawResult, AbortReason } from '$lib/game/types';

	// Round-end overlay: a win (one block per winner — two on a double ron), or a
	// draw (ordinary exhaustive / nagashi mangan / abortive).
	let {
		winners,
		combinedDeltas,
		exhaustiveDrawResult,
		abortiveDraw,
		seatNames,
		abortLabels,
		onNext
	}: {
		winners: RoundResult[];
		combinedDeltas: number[];
		exhaustiveDrawResult: ExhaustiveDrawResult | null;
		abortiveDraw: AbortReason | null;
		seatNames: string[];
		abortLabels: Record<string, string>;
		onNext: () => void;
	} = $props();

	const nagashi = $derived((exhaustiveDrawResult?.nagashiSeats ?? []).length > 0);
</script>

<div class="overlay">
	<div class="result-card">
		{#if winners.length > 0}
			<div class="win-announcement">
				{winners[0].winType === 'tsumo' ? '自摸' : winners.length > 1 ? 'ダブロン' : '栄和'}
			</div>

			<!-- One block per winner (two on a double ron) -->
			{#each winners as w (w.winner)}
				{@const lim = limitName(w.han, w.fu)}
				<p class="winner-name">{seatNames[w.winner]} wins!</p>
				<div class="yaku-list">
					{#each w.yaku as y (y.name)}
						<div class="yaku-row">
							<span class="yaku-name">{y.name}</span>
							<span class="yaku-han">{y.han} han</span>
						</div>
					{/each}
				</div>
				<p class="score-detail">
					{#if lim}<span class="limit-name">{lim}</span> ·
					{/if}{w.han} han / {w.fu} fu → {w.score.toLocaleString()} pts
					<span class="win-type">({w.winType})</span>
				</p>
			{/each}

			<div class="score-changes">
				{#each combinedDeltas as change, i (i)}
					<div class="score-row" class:winner={winners.some((w) => w.winner === i)}>
						<span>{seatNames[i]}</span>
						<span class:positive={change > 0} class:negative={change < 0}>
							{change > 0 ? '+' : ''}{change.toLocaleString()}
						</span>
					</div>
				{/each}
			</div>
		{:else}
			<div class="win-announcement">
				{abortiveDraw ? '途中流局' : nagashi ? '流し満貫' : '流局'}
			</div>
			<p class="winner-name">
				{#if abortiveDraw}{abortLabels[abortiveDraw]}{:else if nagashi}Nagashi mangan{:else}Draw —
					wall exhausted{/if}
			</p>
			{#if exhaustiveDrawResult && !abortiveDraw}
				{@const edr = exhaustiveDrawResult}
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
		<button class="action-btn" onclick={onNext}>Next Round</button>
	</div>
</div>

<style>
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
		max-height: calc(100dvh - 2rem);
		overflow-y: auto;
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
</style>
