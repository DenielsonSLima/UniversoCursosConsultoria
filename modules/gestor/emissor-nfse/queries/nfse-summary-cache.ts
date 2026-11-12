/** Retain scoped read projections across short navigation, in memory only.
 * Query keys include portal context, polo, environment and month/filters.
 * Session replacement clears the QueryClient. Realtime/reconnect still invalidate
 * these projections, including recovery after time spent outside the module.
 * Do not use placeholderData from a previous key or retain authorization decisions.
 */
export const nfseSummaryCacheOptions = { gcTime: 5 * 60_000 } as const;
