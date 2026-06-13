<script lang="ts">
	// Mid-game exit confirmation — a docked, non-blocking panel (the board stays
	// visible behind it). Leaving abandons the unfinished game (nothing is saved
	// until game_end).
	let { onStay, onLeave }: { onStay: () => void; onLeave: () => void } = $props();
</script>

<div class="exit-panel">
	<span class="exit-title">Leave the game?</span>
	<span class="exit-sub">This game is unfinished — it won't be saved.</span>
	<div class="exit-actions">
		<button class="exit-btn exit-stay" onclick={onStay}>Stay</button>
		<button class="exit-btn exit-leave" onclick={onLeave}>Leave</button>
	</div>
</div>

<style>
	.exit-panel {
		position: absolute;
		right: calc(var(--u) * 3);
		top: calc(var(--u) * 5);
		z-index: 50;
		display: flex;
		flex-direction: column;
		gap: calc(var(--u) * 0.6);
		padding: calc(var(--u) * 1.4) calc(var(--u) * 1.6);
		background: rgba(20, 18, 16, 0.96);
		border: 1px solid #3a342c;
		border-radius: calc(var(--u) * 1.2);
		box-shadow: 0 calc(var(--u) * 1) calc(var(--u) * 3) rgba(0, 0, 0, 0.6);
	}
	.exit-title {
		font-size: calc(var(--u) * 1.7);
		color: #cfc7bb;
		font-weight: 600;
	}
	.exit-sub {
		font-size: calc(var(--u) * 1.4);
		color: #8a8278;
	}
	.exit-actions {
		display: flex;
		gap: calc(var(--u) * 0.8);
		justify-content: flex-end;
		margin-top: calc(var(--u) * 0.4);
	}
	.exit-btn {
		padding: calc(var(--u) * 0.7) calc(var(--u) * 1.6);
		border: none;
		border-radius: calc(var(--u) * 0.6);
		cursor: pointer;
		font-size: calc(var(--u) * 1.6);
		font-weight: 600;
		transition: opacity 0.15s;
	}
	.exit-btn:hover {
		opacity: 0.85;
	}
	.exit-stay {
		background: #2e2a26;
		color: #cfc7bb;
	}
	.exit-leave {
		background: #c41e3a;
		color: #fff;
	}
</style>
