<script lang="ts">
	import { Show, SignInButton, UserButton } from 'svelte-clerk';
</script>

<div class="landing">
	<div class="bg-grain" aria-hidden="true"></div>
	<span class="bg-kanji" aria-hidden="true">立直</span>

	<div class="auth-nav">
		<Show when="signed-out">
			<SignInButton mode="modal" class="signin-btn">Sign in</SignInButton>
		</Show>
		<Show when="signed-in">
			<UserButton />
		</Show>
	</div>

	<main class="hero">
		<div class="title-block">
			<span class="jp-title">立直</span>
			<span class="en-title">RIICHI</span>
		</div>

		<div class="rule" aria-hidden="true"></div>

		<p class="tagline">Solo riichi mahjong — you vs three AI.</p>
		<p class="subtagline">This is where you learn to win, not just play.</p>

		<a href="/game" class="play-btn">
			<span class="play-en">Play</span>
			<span class="play-jp">対局開始</span>
		</a>

		<a href="/hand-of-the-day" class="hotd-link">
			Hand of the Day <span class="hotd-jp">今日の手牌</span>
		</a>
	</main>

	<footer class="landing-footer">
		<span>No account needed — sign in to track your daily-puzzle streak.</span>
	</footer>
</div>

<style>
	:global(body) {
		background: #0b0a0a;
		color: #e8e0d5;
		font-family: 'Inter', system-ui, sans-serif;
		margin: 0;
	}

	.landing {
		position: relative;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		/* warm charcoal core fading to near-black at the edges (vignette) */
		background: radial-gradient(ellipse 80% 70% at 50% 42%, #1b1512 0%, #120f0e 45%, #0b0a0a 100%);
	}

	.auth-nav {
		position: absolute;
		top: 1.25rem;
		right: 1.5rem;
		z-index: 3;
	}
	:global(.auth-nav .signin-btn) {
		padding: 0.45rem 1.2rem;
		background: transparent;
		color: #cfc7bb;
		border: 1px solid #3a352f;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			border-color 0.15s,
			color 0.15s;
	}
	:global(.auth-nav .signin-btn:hover) {
		border-color: #c41e3a;
		color: #e8e0d5;
	}

	/* Subtle film grain so the flat black reads as a surface, not a void */
	.bg-grain {
		position: absolute;
		inset: 0;
		pointer-events: none;
		opacity: 0.5;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E");
	}

	/* Oversized faint kanji bleeding off the lower-right as texture/echo */
	.bg-kanji {
		position: absolute;
		right: -6%;
		bottom: -18%;
		font-family: 'Noto Serif JP', serif;
		font-weight: 700;
		font-size: clamp(20rem, 52vw, 46rem);
		line-height: 0.8;
		color: #c41e3a;
		opacity: 0.045;
		transform: rotate(-6deg);
		pointer-events: none;
		user-select: none;
		white-space: nowrap;
	}

	.hero {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 0.6rem;
	}

	.title-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
	}

	.jp-title {
		font-family: 'Noto Serif JP', serif;
		font-size: clamp(2.75rem, 7vw, 4.5rem);
		font-weight: 700;
		color: #c41e3a;
		line-height: 1;
		letter-spacing: 0.12em;
		/* soft crimson glow — the accent as light, not a flat fill */
		text-shadow:
			0 0 28px rgba(196, 30, 58, 0.45),
			0 0 60px rgba(139, 26, 26, 0.3);
		animation: breathe 6s ease-in-out infinite;
	}

	@keyframes breathe {
		0%,
		100% {
			text-shadow:
				0 0 26px rgba(196, 30, 58, 0.38),
				0 0 56px rgba(139, 26, 26, 0.25);
		}
		50% {
			text-shadow:
				0 0 34px rgba(196, 30, 58, 0.55),
				0 0 72px rgba(139, 26, 26, 0.35);
		}
	}

	.en-title {
		font-size: clamp(0.7rem, 2vw, 0.95rem);
		font-weight: 600;
		letter-spacing: 0.62em;
		/* indent compensates for trailing letter-spacing so it stays optically centered */
		text-indent: 0.62em;
		color: #6a6258;
	}

	.rule {
		width: 56px;
		height: 1px;
		margin: 0.5rem 0 0.2rem;
		background: linear-gradient(90deg, transparent, #c41e3a 50%, transparent);
		opacity: 0.7;
	}

	.tagline {
		font-size: clamp(0.95rem, 2vw, 1.05rem);
		color: #b7ada0;
		margin: 0;
		letter-spacing: 0.01em;
	}

	.subtagline {
		font-family: 'Noto Serif JP', serif;
		font-size: clamp(0.85rem, 1.8vw, 0.98rem);
		color: #7a7066;
		margin: 0;
		font-style: italic;
		letter-spacing: 0.02em;
	}

	.play-btn {
		margin-top: 1.6rem;
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		padding: 0.85rem 3.5rem;
		background: linear-gradient(180deg, #c41e3a, #9c1730);
		color: #fff;
		text-decoration: none;
		border-radius: 5px;
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.06) inset,
			0 6px 24px rgba(139, 26, 26, 0.4);
		transition:
			transform 0.18s ease,
			box-shadow 0.18s ease,
			filter 0.18s ease;
	}

	.play-en {
		font-size: 1.05rem;
		font-weight: 600;
		letter-spacing: 0.22em;
		text-transform: uppercase;
	}

	.play-jp {
		font-family: 'Noto Serif JP', serif;
		font-size: 0.7rem;
		letter-spacing: 0.3em;
		color: rgba(255, 255, 255, 0.7);
	}

	.play-btn:hover {
		transform: translateY(-2px);
		filter: brightness(1.08);
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.1) inset,
			0 10px 34px rgba(196, 30, 58, 0.55);
	}

	.play-btn:active {
		transform: translateY(0);
	}

	.hotd-link {
		margin-top: 1rem;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: #9a9286;
		text-decoration: none;
		font-size: 0.85rem;
		letter-spacing: 0.04em;
		border-bottom: 1px solid transparent;
		transition: color 0.18s ease;
	}
	.hotd-link:hover {
		color: #e8e0d5;
	}
	.hotd-jp {
		font-family: 'Noto Serif JP', serif;
		font-size: 0.75rem;
		color: #c41e3a;
	}

	.landing-footer {
		position: absolute;
		bottom: 0;
		padding: 1.5rem;
		font-size: 0.72rem;
		color: #4a443d;
		letter-spacing: 0.08em;
	}

	@media (prefers-reduced-motion: reduce) {
		.jp-title {
			animation: none;
		}
	}
</style>
