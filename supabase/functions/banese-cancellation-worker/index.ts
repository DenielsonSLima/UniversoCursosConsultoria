import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { createBaneseCancellationWorkerHandler } from "./worker.ts";

const handler = createBaneseCancellationWorkerHandler({
  createAdmin: (url, serviceRoleKey) =>
    createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  logger: console,
});

Deno.serve(handler);
