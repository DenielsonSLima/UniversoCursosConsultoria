/** Shared application read-cache policy. Realtime invalidation takes precedence
 * over staleTime; gcTime only controls memory retention without observers.
 * Keep authorization/one-use command queries on their explicit policies.
 */
export const applicationReadCachePolicy = {
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
} as const;
