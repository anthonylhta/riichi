<script lang="ts">
	import { SignInButton } from 'svelte-clerk';
	import { SEAT_NAMES, roundTag, summarize } from '$lib/game/review';
	import { placeLabel } from '$lib/game/history';

	let { data } = $props();

	// MJAI export: fetch the stored ReplayLog, re-run it through the engine in
	// the browser (the engine + WASM are dynamic-imported so this page stays
	// light), and download the derived event log. The replay IS the game —
	// every AI move is re-derived, so the export covers all four seats.
	let mjaiBusy = $state(false);
	let mjaiError = $state('');
	async function downloadMjai(gameId: number) {
		if (mjaiBusy) return;
		mjaiBusy = true;
		mjaiError = '';
		try {
			const [res, { replayGame }, { toMjaiJsonl }] = await Promise.all([
				fetch(`/api/games/${gameId}/replay`),
				import('$lib/game/replay'),
				import('$lib/game/mjai')
			]);
			if (!res.ok) throw new Error(`replay fetch failed (${res.status})`);
			const log = await res.json();
			const { final } = await replayGame(log);
			const blob = new Blob([toMjaiJsonl(final.events)], { type: 'application/jsonl' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `riichi-game-${gameId}.mjai.jsonl`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			console.error('MJAI export failed', e);
			mjaiError = 'Export failed — the replay could not be re-run.';
		} finally {
			mjaiBusy = false;
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
			<p class="export">
				<a class="export-link" href="/api/games/{g.id}/replay" download>
					⤓ Download replay (JSON)
				</a>
				<span class="export-sub">full move log — every wall and input of this game</span>
			</p>
			<p class="export">
				<button class="export-link" onclick={() => downloadMjai(g.id)} disabled={mjaiBusy}>
					{mjaiBusy ? 'Rebuilding game…' : '⤓ Download game log (MJAI)'}
				</button>
				<span class="export-sub">
					{#if mjaiError}{mjaiError}{:else}standard format — readable anywhere, works with reviewers
						like Mortal{/if}
				</span>
			</p>
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
	.export-link {
		color: #8a8278;
		text-decoration: none;
		font-size: 0.85rem;
	}
	.export-link:hover {
		color: #e8e0d5;
	}
	/* The MJAI export is a button (it rebuilds the game client-side), styled
	   to sit flush with the replay download link above it. */
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
