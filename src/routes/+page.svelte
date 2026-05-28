<div class="landing">
	<main class="hero">
		<div class="title-block">
			<span class="jp-title">立直</span>
			<h1 class="en-title">RIICHI</h1>
		</div>
		<p class="tagline">Riichi mahjong in the browser.</p>
		<a href="/game" class="play-btn">Play</a>
	</main>

	<footer class="landing-footer">
		<span>No account needed.</span>
	</footer>
</div>

<style>
	:global(body) {
		background: #0d0d0d;
		color: #e8e0d5;
		font-family: 'Inter', system-ui, sans-serif;
		margin: 0;
	}

	.landing {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		text-align: center;
		flex: 1;
		justify-content: center;
	}

	.title-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.jp-title {
		font-family: 'Noto Serif JP', serif;
		font-size: clamp(3rem, 10vw, 6rem);
		font-weight: 700;
		color: #c41e3a;
		line-height: 1;
		letter-spacing: 0.05em;
	}

	.en-title {
		font-family: 'Inter', system-ui, sans-serif;
		font-size: clamp(0.85rem, 2.5vw, 1.1rem);
		font-weight: 600;
		letter-spacing: 0.45em;
		color: #555;
		margin: 0;
	}

	.tagline {
		font-size: clamp(0.9rem, 2vw, 1rem);
		color: #666;
		margin: 0;
		letter-spacing: 0.02em;
	}

	.play-btn {
		margin-top: 0.5rem;
		padding: 0.75rem 3rem;
		background: #c41e3a;
		color: #fff;
		text-decoration: none;
		border-radius: 4px;
		font-size: 0.95rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		transition: background 0.15s;
	}

	.play-btn:hover {
		background: #a01830;
	}

	.landing-footer {
		padding: 1.5rem;
		font-size: 0.75rem;
		color: #333;
		letter-spacing: 0.05em;
	}
</style>
