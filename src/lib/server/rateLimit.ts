// Best-effort, in-memory, per-key sliding-window rate limiter for the
// Claude-backed endpoints. State lives in the function instance: Fluid Compute
// reuses instances across requests, so this meaningfully throttles a script
// hammering one address — but it is NOT a hard global limit (a cold start or a
// second instance resets it). Good enough to keep the token bill boring; a
// shared store (or Vercel WAF rule) is the upgrade path if it ever isn't.

const buckets = new Map<string, number[]>();
const MAX_KEYS = 2000;

// Returns true if the call is allowed, false if the key is over `limit` calls
// in the trailing `windowMs`.
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
	const cutoff = now - windowMs;
	const stamps = (buckets.get(key) ?? []).filter((t) => t > cutoff);

	if (stamps.length >= limit) {
		buckets.set(key, stamps);
		return false;
	}

	stamps.push(now);
	buckets.set(key, stamps);

	// Cheap GC so an address-rotating scan can't grow the map unbounded.
	if (buckets.size > MAX_KEYS) {
		for (const [k, v] of buckets) {
			if (!v.some((t) => t > cutoff)) buckets.delete(k);
		}
	}

	return true;
}

// Test hook — clears all buckets.
export function resetRateLimits(): void {
	buckets.clear();
}
