<script lang="ts">
	// Stage header: round/honba/wall readout, the Menu button, and the dev toggle.
	// Sizing uses the stage's --u custom property, inherited through the DOM.
	let {
		roundWindKanji,
		roundNumber,
		honba,
		wallLeft,
		isDev,
		devPanelOpen,
		onMenu,
		onToggleDev
	}: {
		roundWindKanji: string;
		roundNumber: number;
		honba: number;
		wallLeft: number;
		isDev: boolean;
		devPanelOpen: boolean;
		onMenu: () => void;
		onToggleDev: () => void;
	} = $props();
</script>

<header class="game-header">
	<span class="round-label">{roundWindKanji} {roundNumber}</span>
	{#if honba > 0}
		<span class="honba">{honba} 本場</span>
	{/if}
	<span class="wall-count">Wall {wallLeft}</span>
	<button class="menu-btn" onclick={onMenu}>Menu</button>
	{#if isDev}
		<button class="dev-toggle" onclick={onToggleDev}>
			{devPanelOpen ? '✕ Dev' : '⚙ Dev'}
		</button>
	{/if}
</header>

<style>
	.game-header {
		display: flex;
		gap: calc(var(--u) * 1.5);
		align-items: center;
		padding: 0 calc(var(--u) * 0.5) calc(var(--u) * 0.5);
		border-bottom: 1px solid #1e1c1a;
		font-size: calc(var(--u) * 1.8);
		color: #8a8278;
		flex: none;
	}

	.round-label {
		font-weight: 600;
		color: #e8e0d5;
		letter-spacing: 0.04em;
	}

	.honba {
		color: #c41e3a;
	}

	.wall-count {
		margin-left: auto;
	}

	.menu-btn {
		padding: calc(var(--u) * 0.3) calc(var(--u) * 1.2);
		background: none;
		border: 1px solid #2e2a26;
		border-radius: calc(var(--u) * 0.6);
		color: #8a8278;
		font-size: calc(var(--u) * 1.5);
		cursor: pointer;
		transition:
			color 0.15s,
			border-color 0.15s;
	}
	.menu-btn:hover {
		color: #e8e0d5;
		border-color: #4a443c;
	}

	.dev-toggle {
		margin-left: auto;
		padding: 0.2rem 0.6rem;
		background: #1a1a1a;
		border: 1px solid #444;
		border-radius: 4px;
		color: #888;
		font-size: 0.75rem;
		cursor: pointer;
	}

	.dev-toggle:hover {
		border-color: #666;
		color: #bbb;
	}
</style>
