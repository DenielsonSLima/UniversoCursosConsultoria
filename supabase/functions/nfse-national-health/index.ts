import { createClient } from 'npm:@supabase/supabase-js@2.95.3';
import { buildCorsHeaders, getClientIp, isRateLimitExceeded, json } from '../_shared/http.ts';
import { createNationalProductionRelayTransport, type ProductionRelayConfig } from '../_shared/nfse-national/production-relay.ts';
import { createHealthHandler } from './handler.ts';
import { probeNationalHealth } from './probe.ts';

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const handler = createHealthHandler({
  respond(request, body, status) {
    const response = json(body, status, request);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  },
  rateLimited: request => isRateLimitExceeded(`nfse-health:${getClientIp(request)}`, 8, 60_000),
  async authorize(request, scope) {
    const token = request.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(token)) throw new Error('AUTH_REQUIRED');
    const user = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_ANON_KEY') || '', {
      ...clientOptions, global: { headers: { Authorization: token } },
    });
    const { data: identity, error: authError } = await user.auth.getUser();
    if (authError || !identity.user) throw new Error('AUTH_REQUIRED');
    const { data, error } = await user.rpc('authorize_nfse_certificate_upload_secure', {
      p_context_key: scope.contextKey, p_polo_id: scope.poloId, p_environment: scope.environment, p_month: scope.month,
    });
    if (error || !data || data.actorId !== identity.user.id) throw new Error('SCOPE_DENIED');
    return identity.user.id;
  },
  async probe(scope, actor) {
    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', {
      ...clientOptions,
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
    });
    return probeNationalHealth(scope, actor, {
      async rpc(name, args) {
        const { data, error } = await admin.rpc(name, args);
        if (error || !data) throw new Error('VERIFICATION_UNCONFIRMED');
        return data;
      },
      // Existing pinned relay: GET only here, with no callback permitting fiscal POST.
      transport: (config, credential) => createNationalProductionRelayTransport(config as ProductionRelayConfig, credential),
    });
  },
});

Deno.serve(request => request.method === 'OPTIONS'
  ? new Response('ok', { headers: buildCorsHeaders(request) }) : handler(request));
