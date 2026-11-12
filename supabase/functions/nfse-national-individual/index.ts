import { createClient } from "npm:@supabase/supabase-js@2.95.3";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
} from "../_shared/http.ts";
import { createIndividualHandler } from "./handler.ts";
import { createIndividualRuntime } from "./runtime.ts";
import { individualCommandRateLimited, individualEntryRateLimited } from "./rate-limit.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildCorsHeaders(req) });
  }
  if (individualEntryRateLimited(getClientIp(req), isRateLimitExceeded)) {
    const response = json({ error: "RATE_LIMITED" }, 429, req);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Retry-After", "60");
    return response;
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    options,
  );
  const runtime = createIndividualRuntime({
    rpc: async (name, args) => {
      const { data, error } = await admin.rpc(name, args);
      return { data, error };
    },
    respond(request, body, status) {
      const response = json(body, status, request);
      response.headers.set("Cache-Control", "no-store");
      if (status === 429) response.headers.set("Retry-After", "60");
      return response;
    },
    rateLimited: (request, command, actor) =>
      individualCommandRateLimited(getClientIp(request), command, actor, isRateLimitExceeded),
    async authorize(request, command) {
      const token = request.headers.get("authorization") || "";
      if (!/^Bearer\s+\S+$/i.test(token)) throw new Error("AUTH_REQUIRED");
      const user = createClient(
        Deno.env.get("SUPABASE_URL") || "",
        Deno.env.get("SUPABASE_ANON_KEY") || "",
        {
          ...options,
          global: { headers: { Authorization: token } },
        },
      );
      const { data: identity, error: authError } = await user.auth.getUser();
      if (authError || !identity.user) throw new Error("AUTH_REQUIRED");
      const { data, error } = await user.rpc(
        "authorize_nfse_certificate_upload_secure",
        {
          p_context_key: command.scope.contextKey,
          p_polo_id: command.scope.poloId,
          p_environment: command.scope.environment,
          p_month: command.scope.month,
        },
      );
      if (error || !data || data.actorId !== identity.user.id) {
        throw new Error("INDIVIDUAL_SCOPE_DENIED");
      }
      return identity.user.id;
    },
  });
  try {
    return await createIndividualHandler(runtime.dependencies)(req);
  } finally {
    runtime.close();
  }
});
