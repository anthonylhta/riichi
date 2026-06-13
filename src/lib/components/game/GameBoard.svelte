<script lang="ts">
	import Tile from '$lib/components/Tile.svelte';
	import type { GameState } from '$lib/game/types';

	// The table: each seat's hand at its edge, the four discard rivers ringing the
	// central board (round/wall/dora/sticks). Presentational — the page owns state;
	// hoveredCode (set by the player's own hand) lights up matching river tiles.
	let {
		state,
		seatNames,
		hoveredCode,
		roundWindKanji,
		roundNumber
	}: {
		state: GameState;
		seatNames: string[];
		hoveredCode: number | null;
		roundWindKanji: string;
		roundNumber: number;
	} = $props();

	const WIND_KANJI = ['東', '南', '西', '北'];
	function windIndex(seat: number, dealer: number): number {
		return (seat - dealer + 4) % 4;
	}
</script>

<!-- A seat's hand block: wind/name/score chip, concealed hand, melds.
     Sits at that seat's outer edge; side seats are oriented vertically via CSS. -->
{#snippet seatHand(seat: number)}
	{@const p = state.players[seat]}
	<div class="seat-chip" class:active={state.currentSeat === seat}>
		<span class="wind-mark">{WIND_KANJI[windIndex(seat, state.dealer)]}</span>
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
	{@const p = state.players[seat]}
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
			{#if state.honba > 0}
				<div class="center-honba">{state.honba} 本場</div>
			{/if}
			<div class="center-wall">
				<span class="wall-num">{state.wallEnd - state.wallPos}</span>
				<span class="wall-unit">tiles left</span>
			</div>
			<div class="center-dora">
				<span class="dora-label">ドラ</span>
				{#each state.doraIndicators as t (t.id)}
					<Tile tile={t} variant="dora" />
				{/each}
			</div>
			{#if state.riichiBets > 0}
				<div class="center-sticks">
					<span class="stick-dot"></span>
					{state.riichiBets} riichi {state.riichiBets === 1 ? 'stick' : 'sticks'}
				</div>
			{/if}
		</div>

		<div class="river-slot river-right">{@render seatRiver(1)}</div>
		<div class="river-slot river-bottom">{@render seatRiver(0)}</div>
	</div>

	<div class="hand-slot hand-right">{@render seatHand(1)}</div>

	<!-- Bottom: your seat chip (your face-up hand sits below the table) -->
	<div class="hand-slot hand-bottom">
		<div class="seat-chip" class:active={state.currentSeat === 0}>
			<span class="wind-mark">{WIND_KANJI[windIndex(0, state.dealer)]}</span>
			<span class="seat-name">{seatNames[0]}</span>
			<span class="seat-score">{state.players[0].score.toLocaleString()}</span>
			{#if state.players[0].isRiichi}<span class="riichi-badge">立直</span>{/if}
			{#if state.players[0].isFuriten || state.players[0].isTempFuriten}
				<span class="furiten-badge">振聴</span>
			{/if}
		</div>
	</div>
</div>

<style>
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

	.seat-melds {
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
</style>
