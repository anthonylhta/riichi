<script lang="ts">
	import { Show, SignInButton } from 'svelte-clerk';
	import type { PlayerState } from '$lib/game/types';

	interface Overview {
		narrative: string;
		lessons: string[];
	}

	// Game-end overlay: final standings, an on-demand Claude review, a sign-in
	// nudge for anonymous players, and Menu / New Game.
	let {
		players,
		seatNames,
		overview,
		overviewError,
		overviewLoading,
		onReview,
		onMenu,
		onNewGame
	}: {
		players: PlayerState[];
		seatNames: string[];
		overview: Overview | null;
		overviewError: string | null;
		overviewLoading: boolean;
		onReview: () => void;
		onMenu: () => void;
		onNewGame: () => void;
	} = $props();

	const standings = $derived(
		players.map((p, i) => ({ score: p.score, seat: i })).sort((a, b) => b.score - a.score)
	);
</script>

<div class="overlay">
	<div class="result-card">
		<div class="win-announcement">終了</div>
		<p class="winner-name">Game Over</p>
		<div class="score-changes">
			{#each standings as player, rank (player.seat)}
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
			<button class="action-btn review-btn" onclick={onReview} disabled={overviewLoading}>
				{overviewLoading ? 'Reviewing…' : 'Review this game 講評'}
			</button>
		{/if}

		<!-- Conversion nudge: games only save for signed-in players (ADR 0039).
		     Future tense on purpose — this finished game can no longer be saved. -->
		<Show when="signed-out">
			<p class="signin-nudge">
				<SignInButton mode="modal" class="nudge-signin">Sign in</SignInButton>
				<span>to save your games and track your stats.</span>
			</p>
		</Show>

		<div class="end-actions">
			<button class="action-btn menu-action" onclick={onMenu}>Menu</button>
			<button class="action-btn" onclick={onNewGame}>New Game</button>
		</div>
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

	/* Conversion nudge for anonymous players, above the actions.
	   The SignInButton renders a real <button>; styled as an inline crimson link. */
	.signin-nudge {
		margin: 0.8rem 0 0;
		font-size: 0.82rem;
		color: #9a9286;
		letter-spacing: 0.03em;
	}
	:global(.signin-nudge .nudge-signin) {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-weight: 600;
		color: #c41e3a;
		cursor: pointer;
	}
	:global(.signin-nudge .nudge-signin:hover) {
		color: #e8e0d5;
	}

	/* Menu (secondary) beside New Game (primary). */
	.end-actions {
		display: flex;
		gap: calc(var(--u) * 1);
		justify-content: center;
	}
	.menu-action {
		background: #2e2a26;
		color: #cfc7bb;
	}
	.menu-action:hover {
		background: #3a342c;
	}
</style>
