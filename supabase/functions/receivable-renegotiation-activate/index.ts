import { createClient } from "npm:@supabase/supabase-js@2.95.3";
import { buildCorsHeaders, getClientIp, isRateLimitExceeded } from "../_shared/http.ts";
import { ActivationError } from "./contract.ts";
import { createActivationDependencies, startActivation } from "./dependencies.ts";
import { createActivationHandler } from "./handler.ts";

const options = { auth: { persistSession: false, autoRefreshToken: false } };

Deno.serve(createActivationHandler({
  headers: (request) => buildCorsHeaders(request, { methods: "POST, OPTIONS" }),
  authorize: async (request, activation) => {
    if (isRateLimitExceeded(`renegotiation-activation:${getClientIp(request)}`, 30, 60_000)) {
      throw new ActivationError("RATE_LIMITED", "Muitas tentativas. Aguarde antes de retomar.", true, 429);
    }
    const url = Deno.env.get("SUPABASE_URL") || "";
    const key = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    if (!url || !key) throw new ActivationError("SERVICE_UNAVAILABLE", "Serviço indisponível.", true, 503);
    const userClient = createClient(url, key, {
      ...options, global: { headers: { Authorization: request.headers.get("Authorization")! } },
    });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user) throw new ActivationError("INVALID_SESSION", "Sessão inválida.", false, 401);
    // The SECURITY DEFINER start RPC independently checks current profile, permissions,
    // polo, agreement/source identities and idempotency before returning any operation.
    return await startActivation(userClient, activation);
  },
  privileged: (authorized) => {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !serviceKey) throw new ActivationError("SERVICE_UNAVAILABLE", "Serviço indisponível.", true, 503);
    return createActivationDependencies({
      admin: createClient(url, serviceKey, options), supabaseUrl: url,
      start: async () => authorized,
    });
  },
}));
