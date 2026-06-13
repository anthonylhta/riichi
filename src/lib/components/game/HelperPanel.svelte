<script lang="ts">
	import type { HelperAdvice } from '$lib/game/helper';

	// In-round AI helper — a non-blocking docked panel. Height is capped so a long
	// response can't push the close button off-screen; the body scrolls instead.
	let {
		advice,
		error,
		onDismiss
	}: {
		advice: HelperAdvice | null;
		error: string | null;
		onDismiss: () => void;
	} = $props();
</script>

<div class="helper-panel">
	<div class="helper-head">
		<span class="helper-title">助言 — Coach</span>
		<button class="helper-close" onclick={onDismiss} aria-label="Dismiss">✕</button>
	</div>
	<div class="helper-body">
		{#if error}
			<p class="helper-error">{error}</p>
		{:else if advice}
			<div class="helper-discard">
				Discard <strong>{advice.discard}</strong>
			</div>
			<p class="helper-reason">{advice.reasoning}</p>
			{#if advice.plan}
				<p class="helper-plan"><span class="helper-lbl">Plan</span> {advice.plan}</p>
			{/if}
		{/if}
	</div>
</div>

<style>
	.helper-panel {
		position: absolute;
		left: calc(var(--u) * 3);
		bottom: calc(var(--u) * 18);
		z-index: 40;
		width: calc(var(--u) * 36);
		max-width: 90vw;
		/* Cap the height so a long response can never grow the panel past the close
		   button — the head stays pinned and the body scrolls inside (see UI_09). */
		max-height: calc(var(--u) * 40);
		display: flex;
		flex-direction: column;
		gap: calc(var(--u) * 0.8);
		padding: calc(var(--u) * 1.4) calc(var(--u) * 1.6);
		background: rgba(16, 20, 26, 0.97);
		border: 1px solid #2f3b4c;
		border-left: 3px solid #3f6f9e;
		border-radius: calc(var(--u) * 1.2);
		box-shadow: 0 calc(var(--u) * 1) calc(var(--u) * 3) rgba(0, 0, 0, 0.6);
	}
	.helper-head {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: calc(var(--u) * 1);
	}
	.helper-body {
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: calc(var(--u) * 0.8);
		min-height: 0;
	}
	.helper-title {
		font-family: 'Noto Serif JP', serif;
		font-size: calc(var(--u) * 1.6);
		color: #9fc3e6;
	}
	.helper-close {
		background: none;
		border: none;
		color: #6a7686;
		cursor: pointer;
		font-size: calc(var(--u) * 1.6);
		line-height: 1;
		padding: 0;
	}
	.helper-close:hover {
		color: #cfd8e2;
	}
	.helper-discard {
		font-size: calc(var(--u) * 1.7);
		color: #cfc7bb;
	}
	.helper-discard strong {
		color: #fff;
		font-size: calc(var(--u) * 2);
	}
	.helper-reason {
		margin: 0;
		font-size: calc(var(--u) * 1.5);
		line-height: 1.45;
		color: #b7ada0;
	}
	.helper-plan {
		margin: 0;
		font-size: calc(var(--u) * 1.45);
		color: #97b8d6;
	}
	.helper-lbl {
		font-size: calc(var(--u) * 1.2);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #6a7686;
	}
	.helper-error {
		margin: 0;
		font-size: calc(var(--u) * 1.5);
		color: #c41e3a;
	}
</style>
