<script lang="ts">
	import { SignInButton } from 'svelte-clerk';
	import { SEAT_NAMES, roundTag, summarize } from '$lib/game/review';
	import { placeLabel } from '$lib/game/history';
	import { tileText } from '$lib/game/tiles';
	import type { ReviewedDealIn } from '$lib/game/tileReview';

	let { data } = $props();

	// Game-log exports: fetch the stored ReplayLog, re-run it through the engine
	// in the browser (the engine + WASM are dynamic-imported so this page stays
	// light), and download the derived event log. The replay IS the game —
	// every AI move is re-derived, so the exports cover all four seats.
	// Two formats from the same event stream: MJAI (the universal, LLM-readable
	// record) and tenhou.net/6 (the Mortal review site's custom-log input).
	let exportBusy = $state<'mjai' | 'tenhou6' | null>(null);
	let exportError = $state('');
	async function downloadLog(gameId: number, kind: 'mjai' | 'tenhou6') {
		if (exportBusy) return;
		exportBusy = kind;
		exportError = '';
		try {
			const [res, { replayGame }] = await Promise.all([
				fetch(`/api/games/${gameId}/replay`),
				import('$lib/game/replay')
			]);
			if (!res.ok) throw new Error(`replay fetch failed (${res.status})`);
			const log = await res.json();
			const { final } = await replayGame(log);
			const [body, filename, mime] =
				kind === 'mjai'
					? [
							(await import('$lib/game/mjai')).toMjaiJsonl(final.events),
							`riichi-game-${gameId}.mjai.jsonl`,
							'application/jsonl'
						]
					: [
							(await import('$lib/game/tenhou6')).toTenhou6Json(final.events),
							`riichi-game-${gameId}.tenhou6.json`,
							'application/json'
						];
			const blob = new Blob([body], { type: mime });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			console.error(`${kind} export failed`, e);
			exportError = 'Export failed — the replay could not be re-run.';
		} finally {
			exportBusy = null;
		}
	}

	// Tile-level review: replay the game client-side, extract the deal-in
	// moments (≤3, pure — see $lib/game/tileReview), send only those to Claude,
	// and pin each verdict under its round card. Verdicts are cached on the
	// game row (ADR 0055): a previously reviewed game renders them straight
	// from the page load, and the endpoint returns the cache on any re-post.
	let tileBusy = $state(false);
	let tileError = $state('');
	let runReviews = $state<ReviewedDealIn[] | null>(null);
	const reviews = $derived(runReviews ?? data.game?.tileReview ?? null);
	const verdictByHand = $derived(
		reviews ? Object.fromEntries(reviews.map((r) => [`${r.round}-${r.honba}`, r])) : null
	);

	const hasDealIns = $derived(
		data.game?.rounds.some((r) => r.outcome === 'ron' && r.loser === 0) ?? false
	);

	async function runTileReview(gameId: number) {
		if (tileBusy || reviews) return;
		tileBusy = true;
		tileError = '';
		try {
			const [res, { replayGame }, { dealInMoments }] = await Promise.all([
				fetch(`/api/games/${gameId}/replay`),
				import('$lib/game/replay'),
				import('$lib/game/tileReview')
			]);
			if (!res.ok) throw new Error(`replay fetch failed (${res.status})`);
			const { final } = await replayGame(await res.json());
			const moments = dealInMoments(final.events);
			if (moments.length === 0) {
				tileError = 'No reviewable deal-ins in this game.';
				return;
			}
			const reviewRes = await fetch(`/api/games/${gameId}/tile-review`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ moments })
			});
			if (!reviewRes.ok) throw new Error(`review failed (${reviewRes.status})`);
			runReviews = ((await reviewRes.json()) as { reviews: ReviewedDealIn[] }).reviews;
		} catch (e) {
			console.error('tile review failed', e);
			tileError = 'Tile review unavailable right now.';
		} finally {
			tileBusy = false;
		}
	}

	const playedOn = $derived(
		data.game
			? new Date(data.game.playedAt).toLocaleDateString(undefined, {
					year: 'numeric',
					month: 'long',
					day: 'numeric'
				})
			: ''
	);

	// Final standings, ranked. Ties keep seat order (East precedence), matching
	// how placement is derived when the game is saved.
	const standings = $derived(
		data.game
			? data.game.finalScores
					.map((score, seat) => ({ score, seat }))
					.sort((a, b) => b.score - a.score)
			: []
	);

	const delta = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
</script>

<div class="detail">
	<header class="head">
		<a class="back" href="/profile">← Profile</a>
		<div class="title-block">
			<span class="jp">対局記録</span>
			<h1>Game record</h1>
		</div>
		<span class="spacer" aria-hidden="true"></span>
	</header>

	{#if !data.signedIn || !data.game}
		<div class="signin-card">
			<p class="signin-jp">サインイン</p>
			<p class="signin-msg">Sign in to see your saved games.</p>
			<SignInButton mode="modal" class="signin-btn">Sign in</SignInButton>
		</div>
	{:else}
		{@const g = data.game}
		<p class="meta">
			{playedOn} · {g.rounds.length} hands · you finished
			<span class="place" class:first={g.placement === 1}>{placeLabel(g.placement)}</span>
		</p>

		{#if g.hasReplay}
			<p class="watch">
				<a class="watch-link" href="/profile/games/{g.id}/replay">▶ Watch replay 牌譜再生</a>
				<span class="export-sub">step through the whole game on the board, turn by turn</span>
			</p>
			<p class="export">
				<button
					class="export-link"
					onclick={() => downloadLog(g.id, 'mjai')}
					disabled={exportBusy !== null}
				>
					{exportBusy === 'mjai' ? 'Rebuilding game…' : '⤓ Download game log (MJAI)'}
				</button>
				<span class="export-sub">the universal record — readable by tools and LLMs anywhere</span>
			</p>
			<p class="export">
				<button
					class="export-link"
					onclick={() => downloadLog(g.id, 'tenhou6')}
					disabled={exportBusy !== null}
				>
					{exportBusy === 'tenhou6' ? 'Rebuilding game…' : '⤓ Download game log (tenhou.net/6)'}
				</button>
				<span class="export-sub">
					{#if exportError}{exportError}{:else}for Mortal reviews — paste into mjai.ekyu.moe as a
						custom log (you are seat 0){/if}
				</span>
			</p>

			{#if hasDealIns}
				<div class="tile-review-bar">
					<button
						class="tile-review-btn"
						onclick={() => runTileReview(g.id)}
						disabled={tileBusy || reviews !== null}
					>
						{tileBusy
							? 'Analyzing your deal-ins…'
							: reviews
								? 'Reviewed ✓'
								: 'Tile review 牌譜検討'}
					</button>
					<span class="export-sub">
						{#if tileError}{tileError}{:else}Claude judges the exact tiles you dealt in with —
							verdicts appear on the rounds below{/if}
					</span>
				</div>
			{/if}
		{/if}

		<section class="standings">
			{#each standings as s, rank (s.seat)}
				<div class="standing" class:you={s.seat === 0}>
					<span class="rank">{rank + 1}</span>
					<span class="seat-name">{SEAT_NAMES[s.seat]}</span>
					<span class="score">{s.score}</span>
				</div>
			{/each}
		</section>

		<section class="rounds">
			{#each g.rounds as r, i (i)}
				{@const m = summarize(r)}
				{@const tr = verdictByHand?.[`${r.round}-${r.honba}`]}
				<article class="round" data-kind={m.kind}>
					<div class="round-head">
						<span class="round-tag">{roundTag(r.round, r.honba)}</span>
						<span
							class="round-delta"
							class:gain={r.pointChanges[0] > 0}
							class:loss={r.pointChanges[0] < 0}
						>
							{delta(r.pointChanges[0])}
						</span>
					</div>
					<p class="round-text">{m.text}</p>
					{#if tr}
						<div class="tile-verdict" data-verdict={tr.verdict}>
							<div class="verdict-head">
								<span class="verdict-chip">{tr.verdict}</span>
								<span class="verdict-tile">
									dealt in with {tileText(tr.dealInTile)}{tr.forcedByRiichi
										? ' (forced — you were in riichi)'
										: ''}
								</span>
							</div>
							<p class="verdict-advice">{tr.advice}</p>
						</div>
					{/if}
					<div class="round-scores">
						{#each r.scoresAfter as score, seat (seat)}
							<span class="rs" class:you={seat === 0}>{SEAT_NAMES[seat]} {score}</span>
						{/each}
					</div>
				</article>
			{:else}
				<p class="empty">No round data was saved for this game.</p>
			{/each}
		</section>
	{/if}
</div>

<style>
	:global(body) {
		background: #0b0a0a;
		color: #e8e0d5;
		font-family: 'Inter', system-ui, sans-serif;
		margin: 0;
	}

	.detail {
		max-width: 640px;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}

	/* Same 3-column header grid as /profile so the title centres on the page. */
	.head {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
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

	.signin-card {
		margin-top: 2rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.8rem;
		text-align: center;
		padding: 2rem;
		border: 1px solid #2a2724;
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.3);
	}
	.signin-jp {
		font-family: 'Noto Serif JP', serif;
		color: #c41e3a;
		margin: 0;
		letter-spacing: 0.1em;
	}
	.signin-msg {
		margin: 0;
		color: #b7ada0;
		font-size: 0.92rem;
	}
	:global(.signin-card .signin-btn) {
		padding: 0.5rem 1.4rem;
		background: linear-gradient(180deg, #c41e3a, #9c1730);
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
	}

	.meta {
		margin: 0;
		text-align: center;
		font-size: 0.9rem;
		color: #b7ada0;
	}
	.place {
		font-weight: 700;
		color: #e8e0d5;
	}
	.place.first {
		color: #d4a437;
	}

	.export {
		margin: -0.4rem 0 0;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	/* Watch replay — the primary action above the (quieter) export links. */
	.watch {
		margin: 0.2rem 0 0.4rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.watch-link {
		color: #c41e3a;
		text-decoration: none;
		font-size: 1rem;
		font-weight: 600;
	}
	.watch-link:hover {
		color: #e8e0d5;
	}
	.export-link {
		color: #8a8278;
		text-decoration: none;
		font-size: 0.85rem;
	}
	.export-link:hover {
		color: #e8e0d5;
	}
	/* The exports are buttons (they rebuild the game client-side), styled as
	   quiet links. */
	button.export-link {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}
	button.export-link:disabled {
		color: #5a5248;
		cursor: wait;
	}
	.export-sub {
		font-size: 0.72rem;
		color: #5a5248;
	}

	/* Tile review — the button bar above the rounds, verdicts pinned in cards */
	.tile-review-bar {
		margin: 0.2rem 0 0;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		align-items: center;
	}
	.tile-review-btn {
		padding: 0.5rem 1.6rem;
		background: linear-gradient(180deg, #c41e3a, #9c1730);
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
	}
	.tile-review-btn:hover:not(:disabled) {
		filter: brightness(1.08);
	}
	.tile-review-btn:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.tile-verdict {
		border: 1px solid #2a2724;
		border-radius: 6px;
		background: rgba(0, 0, 0, 0.25);
		padding: 0.55rem 0.7rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.verdict-head {
		display: flex;
		align-items: baseline;
		gap: 0.55rem;
	}
	.verdict-chip {
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 0.12rem 0.5rem;
		border-radius: 999px;
		background: #3a3530;
		color: #cfc7bb;
	}
	.tile-verdict[data-verdict='avoidable'] .verdict-chip {
		background: #c41e3a;
		color: #fff;
	}
	.tile-verdict[data-verdict='justified'] .verdict-chip {
		background: #8a6d1f;
		color: #fff;
	}
	.tile-verdict[data-verdict='unlucky'] .verdict-chip {
		background: #2e5a3a;
		color: #d9e8dd;
	}
	.verdict-tile {
		font-size: 0.78rem;
		color: #8a8278;
	}
	.verdict-advice {
		margin: 0;
		font-size: 0.86rem;
		line-height: 1.45;
		color: #cfc7bb;
	}

	/* Final standings */
	.standings {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.6rem;
	}
	.standing {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		padding: 0.7rem 0.4rem;
		border: 1px solid #221f1c;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.015);
	}
	.standing.you {
		border-color: #c41e3a66;
	}
	.rank {
		font-size: 0.72rem;
		color: #6a6258;
	}
	.seat-name {
		font-size: 0.82rem;
		color: #b7ada0;
	}
	.standing.you .seat-name {
		color: #e8e0d5;
		font-weight: 600;
	}
	.score {
		font-size: 1.05rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	/* Round-by-round list */
	.rounds {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.round {
		border: 1px solid #221f1c;
		border-left: 3px solid #3a3530;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.015);
		padding: 0.7rem 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.round[data-kind='win'] {
		border-left-color: #50a05a;
	}
	.round[data-kind='deal-in'] {
		border-left-color: #c41e3a;
	}
	.round-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.round-tag {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #8a8278;
	}
	.round-delta {
		font-size: 0.85rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: #6a6258;
	}
	.round-delta.gain {
		color: #93c79e;
	}
	.round-delta.loss {
		color: #d98a98;
	}
	.round-text {
		margin: 0;
		font-size: 0.9rem;
		color: #e8e0d5;
		line-height: 1.45;
	}
	.round-scores {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.9rem;
	}
	.rs {
		font-size: 0.74rem;
		color: #6a6258;
		font-variant-numeric: tabular-nums;
	}
	.rs.you {
		color: #b7ada0;
	}

	.empty {
		margin: 0;
		font-size: 0.88rem;
		color: #8a8278;
	}
</style>
