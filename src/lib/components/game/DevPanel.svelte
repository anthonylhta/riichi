<script lang="ts">
	// Dev cheat panel — floats over the viewport, outside the scaled stage. Only
	// rendered in dev builds (the page gates it on import.meta.env.DEV).
	type Cheat = (() => Promise<void>) | null;
	let {
		setTenpai,
		setWinningHand,
		setRonClaim,
		setPonClaim,
		setChiClaim,
		setFuriten,
		setAnkan,
		setKakan,
		setDaiminkan,
		setTenpaiToRon
	}: {
		setTenpai: Cheat;
		setWinningHand: Cheat;
		setRonClaim: Cheat;
		setPonClaim: Cheat;
		setChiClaim: Cheat;
		setFuriten: Cheat;
		setAnkan: Cheat;
		setKakan: Cheat;
		setDaiminkan: Cheat;
		setTenpaiToRon: Cheat;
	} = $props();
</script>

<div class="dev-panel">
	<span class="dev-label">Dev scenarios</span>
	<button class="dev-btn" onclick={() => setTenpai?.()}>Tenpai hand</button>
	<button class="dev-btn" onclick={() => setWinningHand?.()}>Winning → Tsumo</button>
	<button class="dev-btn" onclick={() => setRonClaim?.()}>Ron claim</button>
	<button class="dev-btn" onclick={() => setPonClaim?.()}>Pon claim</button>
	<button class="dev-btn" onclick={() => setChiClaim?.()}>Chi claim</button>
	<button class="dev-btn" onclick={() => setFuriten?.()}>Furiten (no ron)</button>
	<button class="dev-btn" onclick={() => setAnkan?.()}>Ankan (4-of-a-kind)</button>
	<button class="dev-btn" onclick={() => setKakan?.()}>Kakan (extend pon)</button>
	<button class="dev-btn" onclick={() => setDaiminkan?.()}>Daiminkan claim</button>
	<button class="dev-btn" onclick={() => setTenpaiToRon?.()}>Riichi → Ippatsu Ron</button>
</div>

<style>
	.dev-panel {
		position: fixed;
		top: 0.5rem;
		left: 0.5rem;
		z-index: 200;
		max-width: 60vw;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.5rem 0.75rem;
		background: #0d0d0d;
		border: 1px dashed #333;
		border-radius: 6px;
		font-size: 0.75rem;
	}

	.dev-label {
		color: #555;
		white-space: nowrap;
	}

	.dev-btn {
		padding: 0.3rem 0.7rem;
		background: #1e1e1e;
		border: 1px solid #444;
		border-radius: 4px;
		color: #aaa;
		font-size: 0.75rem;
		cursor: pointer;
		transition: border-color 0.1s;
	}

	.dev-btn:hover {
		border-color: #888;
		color: #e8e0d5;
	}
</style>
