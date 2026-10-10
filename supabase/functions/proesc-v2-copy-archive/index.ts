import { createClient } from 'npm:@supabase/supabase-js@2.95.3';
import { createV2CopyHandler } from './handler.mjs';
import { createV2CopySdkBridge } from './sdk-bridge.mjs';

// Existing server-only identity. No new secret, credential, cron or frontend access.
// Enabling the endpoint does not approve batches: the private SQL plan allowlist starts empty.
const services = createV2CopySdkBridge({
  createClient,
  fetchImpl: fetch,
  serverUrl: Deno.env.get('SUPABASE_URL'),
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
});
Deno.serve(createV2CopyHandler({ ...services, enabled: true }));
