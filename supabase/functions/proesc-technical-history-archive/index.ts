import { createClient } from 'npm:@supabase/supabase-js@2.95.3';
import { createTechnicalArchiveHandler } from './handler.ts';

Deno.serve((request) => {
  const deadline = Date.now() + 100000;
  const boundedFetch: typeof fetch = (input, init = {}) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return Promise.reject(new Error('TECHNICAL_ARCHIVE_DEADLINE'));
    return fetch(input, {
      ...init, signal: AbortSignal.any([
        AbortSignal.timeout(Math.min(15000, remaining)), ...(init.signal ? [init.signal] : []),
        ...(input instanceof Request ? [input.signal] : []),
      ]),
    });
  };
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: boundedFetch },
  });
  return createTechnicalArchiveHandler(admin)(request);
});
