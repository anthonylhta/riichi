<script lang="ts">
	import Tile from '$lib/components/Tile.svelte';
	import { tileLabel } from '$lib/game/tiles';
	import type { TileCode } from '$lib/game/tiles';
	import type {
		PublicPuzzle,
		PuzzleAnswer,
		StreakInfo,
		DayResult,
		AnswerResponse
	} from '$lib/game/hotd';
	import { SignInButton } from 'svelte-clerk';
	import { untrack } from 'svelte';

	interface TodayData {
		date: string;
		puzzle: PublicPuzzle;
		answer: PuzzleAnswer | null; // present only if the signed-in user already answered today
	}

	let {
		today,
		result,
		streak,
		signedIn
	}: {
		today: TodayData;
		result: DayResult | null;
		streak: StreakInfo | null;
		signedIn: boolean;
	} = $props();

	let puzzle = $derived(today.puzzle);
	// One synthetic GameTile per hand position (no red fives in puzzles for now).
	let handTiles = $derived(puzzle.hand.map((code, id) => ({ code, id, isRed: false })));

	// Props are fixed for the component's life (the page loads once per day), so we
	// intentionally seed local state from their initial values — untrack() makes
	// that explicit and silences the state_referenced_locally warning.
	let answer = $state<PuzzleAnswer | null>(untrack(() => today.answer));
	let correct = $state<boolean | null>(untrack(() => result?.correct ?? null));
	let liveStreak = $state<StreakInfo | null>(untrack(() => streak));
	let selectedIndex = $state<number | null>(
		untrack(() => (result ? handTiles.findIndex((t) => t.code === result.choiceCode) : null))
	);
	let submitting = $state(false);
	let submitError = $state<string | null>(null);

	let revealed = $derived(answer !== null);
	let acceptTiles = $derived(
		(answer?.ukeireTiles ?? []).map((code, id) => ({ code, id, isRed: false }))
	);

	function isBest(code: TileCode): boolean {
		return answer?.bestDiscards.includes(code) ?? false;
	}

	// Submit a tile for server-side grading (the answer isn't in the page payload).
	async function pick(i: number) {
		if (revealed || submitting) return;
		submitting = true;
		submitError = null;
		selectedIndex = i;
		try {
			const res = await fetch('/api/hand-of-the-day/answer', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ choiceCode: handTiles[i].code })
			});
			if (!res.ok) throw new Error('grade failed');
			const data = (await res.json()) as AnswerResponse;
			correct = data.correct;
			liveStreak = data.streak;
			answer = data.answer; // flips `revealed`
		} catch {
			submitError = 'Could not check your answer. Try again.';
			selectedIndex = null;
		} finally {
			submitting = false;
		}
	}
</script>

<span class="date">{today.date}</span>

{#if signedIn && liveStreak}
	<div class="streak" class:lit={liveStreak.current > 0}>
		<span class="flame">🔥</span>
		<span class="streak-n">{liveStreak.current}</span>
		<span class="streak-lbl">day streak</span>
		<span class="streak-best">· best {liveStreak.best}</span>
	</div>
{/if}

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
			class:wrong={revealed && i === selectedIndex && !correct}
			disabled={revealed || submitting}
			onclick={() => pick(i)}
		>
			<Tile
				tile={t}
				variant="hand"
				selected={i === selectedIndex}
				highlight={revealed && isBest(t.code)}
				dimmed={revealed && !isBest(t.code) && i !== selectedIndex}
			/>
		</button>
	{/each}
</div>

{#if submitError}
	<p class="submit-error">{submitError}</p>
{/if}

{#if revealed && answer}
	<div class="result" class:ok={correct}>
		<div class="verdict">
			{correct ? '正解 — Correct!' : '惜しい — Not the best'}
		</div>
		<p class="answer">
			Best discard:
			<strong>{answer.bestDiscards.map((c) => tileLabel(c)).join(' / ')}</strong>
			— leaves {answer.bestShanten}-shanten, accepts <strong>{answer.ukeire}</strong> tiles.
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
		<p class="explanation">{answer.explanation}</p>
	</div>

	{#if !signedIn}
		<div class="signin-nudge">
			<p>Sign in to save your progress and build a daily streak.</p>
			<SignInButton mode="modal" class="signin-btn">Sign in</SignInButton>
		</div>
	{/if}
{:else if submitting}
	<p class="hint">Checking…</p>
{:else}
	<p class="hint">Tap the tile you'd discard.</p>
{/if}

<p class="shared">Everyone gets the same puzzle today.</p>

<style>
	.date {
		color: #6a6258;
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
	}

	.streak {
		display: inline-flex;
		align-items: baseline;
		gap: 0.4rem;
		padding: 0.35rem 0.8rem;
		border: 1px solid #2a2724;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.3);
		color: #8a8278;
	}
	.streak.lit {
		border-color: #c8a020;
		color: #e8e0d5;
	}
	.flame {
		font-size: 1rem;
		filter: grayscale(1) opacity(0.5);
	}
	.streak.lit .flame {
		filter: none;
	}
	.streak-n {
		font-size: 1.25rem;
		font-weight: 700;
		color: #e8e0d5;
	}
	.streak-lbl {
		font-size: 0.8rem;
		letter-spacing: 0.03em;
	}
	.streak-best {
		font-size: 0.78rem;
		color: #6a6258;
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
	.submit-error {
		color: #c41e3a;
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

	.signin-nudge {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		text-align: center;
	}
	.signin-nudge p {
		margin: 0;
		font-size: 0.9rem;
		color: #8a8278;
	}
	:global(.signin-btn) {
		padding: 0.5rem 1.4rem;
		background: #c41e3a;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
	}
	:global(.signin-btn:hover) {
		background: #a01830;
	}

	.shared {
		color: #6a6258;
		font-size: 0.78rem;
		margin: 0;
	}
</style>
