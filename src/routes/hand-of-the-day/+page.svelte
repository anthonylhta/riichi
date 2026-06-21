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
		<span class="head-spacer" aria-hidden="true"></span>
	</header>

	{#if data.error || !data.today}
		<p class="error">{data.error ?? 'No puzzle available.'}</p>
	{:else}
		<PuzzleView
			today={data.today}
			result={data.result}
			streak={data.streak}
			signedIn={data.signedIn}
		/>
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
		/* 3-column grid so the title centres on the true page centre, matching the
		   loading block and the resolved puzzle's .date (both centred on the full
		   .hotd column). A plain flex row would centre the title in the space left
		   over after the ← Menu link, shifting it right. The spacer column mirrors
		   the back link's width so the centre column stays dead-centre. */
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

	.error {
		color: #c41e3a;
	}
</style>
