<script lang="ts">
	import { SignInButton } from 'svelte-clerk';

	let { data } = $props();

	const memberSince = $derived(
		data.account
			? new Date(data.account.memberSince).toLocaleDateString(undefined, {
					year: 'numeric',
					month: 'long',
					day: 'numeric'
				})
			: ''
	);

	// Short MM-DD label for the recent-history dots.
	const md = (date: string) => date.slice(5);
</script>

<div class="profile">
	<header class="head">
		<a class="back" href="/">← Menu</a>
		<div class="title-block">
			<span class="jp">プロフィール</span>
			<h1>Profile</h1>
		</div>
		<span class="spacer" aria-hidden="true"></span>
	</header>

	{#if !data.signedIn || !data.account || !data.summary}
		<div class="signin-card">
			<p class="signin-jp">サインイン</p>
			<p class="signin-msg">Sign in to see your profile and Hand of the Day stats.</p>
			<SignInButton mode="modal" class="signin-btn">Sign in</SignInButton>
		</div>
	{:else}
		{@const s = data.summary}
		<section class="account">
			{#if data.account.imageUrl}
				<img class="avatar" src={data.account.imageUrl} alt="" />
			{:else}
				<div class="avatar placeholder" aria-hidden="true">
					{(data.account.name ?? data.account.email ?? '?').charAt(0).toUpperCase()}
				</div>
			{/if}
			<div class="who">
				<span class="name">{data.account.name ?? 'Player'}</span>
				{#if data.account.email}<span class="email">{data.account.email}</span>{/if}
				<span class="since">Member since {memberSince}</span>
			</div>
		</section>

		<section class="card">
			<div class="card-head">
				<span class="card-jp">今日の手牌</span>
				<h2>Hand of the Day</h2>
			</div>

			<div class="streak" class:lit={s.streak.current > 0}>
				<span class="flame">🔥</span>
				<span class="streak-n">{s.streak.current}</span>
				<span class="streak-lbl">day streak</span>
				<span class="streak-best">· best {s.streak.best}</span>
			</div>

			<div class="stat-grid">
				<div class="stat">
					<span class="stat-n">{s.totalAnswered}</span>
					<span class="stat-lbl">answered</span>
				</div>
				<div class="stat">
					<span class="stat-n">{s.totalCorrect}</span>
					<span class="stat-lbl">correct</span>
				</div>
				<div class="stat">
					<span class="stat-n">{s.accuracy}<span class="pct">%</span></span>
					<span class="stat-lbl">accuracy</span>
				</div>
			</div>

			{#if s.recent.length}
				<div class="recent">
					<span class="recent-lbl">Recent</span>
					<div class="dots">
						{#each s.recent as day (day.date)}
							<span
								class="dot"
								class:correct={day.correct}
								class:wrong={!day.correct}
								title="{day.date} — {day.correct ? 'correct' : 'wrong'}"
							>
								<span class="dot-date">{md(day.date)}</span>
							</span>
						{/each}
					</div>
				</div>
			{:else}
				<p class="empty">
					No puzzles answered yet — <a href="/hand-of-the-day">try today's Hand of the Day</a>.
				</p>
			{/if}
		</section>

		<p class="soon">Game stats (win rate, deal-ins, placement) are coming once games are saved.</p>
	{/if}
</div>

<style>
	:global(body) {
		background: #0b0a0a;
		color: #e8e0d5;
		font-family: 'Inter', system-ui, sans-serif;
		margin: 0;
	}

	.profile {
		max-width: 640px;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 3rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
	}

	/* 3-column grid so the title centres on the true page centre (see UI_08 fix). */
	.head {
		width: 100%;
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

	/* Signed-out prompt */
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

	/* Account header */
	.account {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.avatar {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid #2f2b27;
		flex-shrink: 0;
	}
	.avatar.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: #1a1714;
		color: #c41e3a;
		font-family: 'Noto Serif JP', serif;
		font-size: 1.5rem;
		font-weight: 700;
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.name {
		font-size: 1.1rem;
		font-weight: 700;
		color: #e8e0d5;
	}
	.email {
		font-size: 0.85rem;
		color: #8a8278;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.since {
		font-size: 0.78rem;
		color: #6a6258;
	}

	/* Stats card */
	.card {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid #2a2724;
		border-left: 3px solid #c41e3a;
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.3);
		padding: 1.2rem 1.4rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.card-head {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
	}
	.card-jp {
		font-family: 'Noto Serif JP', serif;
		color: #c41e3a;
		font-size: 0.85rem;
		letter-spacing: 0.08em;
	}
	.card-head h2 {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
	}

	.streak {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		opacity: 0.55;
	}
	.streak.lit {
		opacity: 1;
	}
	.flame {
		font-size: 1.3rem;
		align-self: center;
	}
	.streak-n {
		font-size: 1.8rem;
		font-weight: 700;
		color: #e8e0d5;
	}
	.streak-lbl {
		font-size: 0.88rem;
		color: #b7ada0;
	}
	.streak-best {
		font-size: 0.82rem;
		color: #6a6258;
	}

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
	}
	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		padding: 0.8rem 0.4rem;
		border: 1px solid #221f1c;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.015);
	}
	.stat-n {
		font-size: 1.5rem;
		font-weight: 700;
		color: #e8e0d5;
	}
	.pct {
		font-size: 0.9rem;
		color: #8a8278;
		margin-left: 1px;
	}
	.stat-lbl {
		font-size: 0.74rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #6a6258;
	}

	/* Recent-history dots */
	.recent {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.recent-lbl {
		font-size: 0.74rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #6a6258;
	}
	.dots {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.dot {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 2.6rem;
		padding: 0.25rem 0.3rem;
		border-radius: 5px;
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
	}
	.dot.correct {
		background: rgba(60, 130, 70, 0.18);
		border: 1px solid rgba(80, 160, 90, 0.5);
		color: #93c79e;
	}
	.dot.wrong {
		background: rgba(196, 30, 58, 0.12);
		border: 1px solid rgba(196, 30, 58, 0.45);
		color: #d98a98;
	}

	.empty {
		margin: 0;
		font-size: 0.88rem;
		color: #8a8278;
	}
	.empty a {
		color: #c41e3a;
	}

	.soon {
		font-size: 0.78rem;
		color: #4a443d;
		font-style: italic;
		margin: 0;
	}
</style>
