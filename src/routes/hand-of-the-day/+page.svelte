<script lang="ts">
	import PuzzleView from './PuzzleView.svelte';

	let { data } = $props();
</script>

<div class="hotd">
	<header class="hotd-head">
		<a class="back" href="/">← Menu</a>
		<div class="title-block">
			<span class="jp">今日の手牌</span>
			<h1>Hand of the Day</h1>
		</div>
	</header>

	{#await data.puzzle}
		<!-- Page shell paints instantly; the first visit of the day generates the
		     puzzle behind this skeleton instead of stalling the navigation. -->
		<div class="loading" aria-live="polite">
			<div class="spinner"></div>
			<p class="loading-jp">今日の手牌を作成中…</p>
			<p class="loading-en">Preparing today's puzzle…</p>
		</div>
	{:then loaded}
		{#if loaded.error || !loaded.today}
			<p class="error">{loaded.error ?? 'No puzzle available.'}</p>
		{:else}
			<PuzzleView today={loaded.today} />
		{/if}
	{/await}
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

	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		padding: 3rem 0;
	}
	.spinner {
		width: 2rem;
		height: 2rem;
		border: 2px solid #2a2724;
		border-top-color: #c41e3a;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation-duration: 2s;
		}
	}
	.loading-jp {
		font-family: 'Noto Serif JP', serif;
		color: #c41e3a;
		font-size: 1rem;
		margin: 0;
	}
	.loading-en {
		color: #6a6258;
		font-size: 0.82rem;
		margin: 0;
	}

	.error {
		color: #c41e3a;
	}
</style>
