import { createClient } from 'npm:@supabase/supabase-js@2.95.3';
import { createArchiveHandler } from './handler.ts';

const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const boundedFetch: typeof fetch = (input, init = {}) => fetch(input, {
  ...init, signal: AbortSignal.any([
    AbortSignal.timeout(30000), ...(init.signal ? [init.signal] : []),
    ...(input instanceof Request ? [input.signal] : []),
  ]),
});
const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: boundedFetch },
});
Deno.serve(createArchiveHandler(admin));
