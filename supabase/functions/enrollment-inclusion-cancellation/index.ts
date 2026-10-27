import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createHandler } from './worker.ts';

// LOCAL CANDIDATE ONLY: deployment and runtime grants require separate approval.
Deno.serve(createHandler({
  getEnv: (name) => Deno.env.get(name),
  createAdmin: (url, key) => createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
}));
