import { applicationReadCachePolicy } from '../../../../lib/query-cache-policy';

/** Use the same retention/freshness policy as the application, not a module timer.
 * Keys isolate portal context, polo, environment, month and filters. Realtime
 * events from any authorized actor invalidate each session's own projections;
 * subscription recovery covers events missed while this module was closed.
 * Never retain authorization decisions or copy data from a previous query key.
 */
export const nfseSummaryCacheOptions = applicationReadCachePolicy;
