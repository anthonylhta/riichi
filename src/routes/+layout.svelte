<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { ClerkProvider } from 'svelte-clerk';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!-- publishableKey is read from PUBLIC_CLERK_PUBLISHABLE_KEY; initialState comes
     from page.data via buildClerkProps in +layout.server.ts. -->
<ClerkProvider>
	{@render children()}
</ClerkProvider>
