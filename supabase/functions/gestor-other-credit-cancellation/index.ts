import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createCancellationHandler } from './handler.ts';

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error('CANCELLATION_UNAVAILABLE');
  return value;
};
Deno.serve(createCancellationHandler({
  createAdmin: () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), options),
  createUser: authorization => createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    ...options, global: { headers: { Authorization: authorization } },
  }),
}));
