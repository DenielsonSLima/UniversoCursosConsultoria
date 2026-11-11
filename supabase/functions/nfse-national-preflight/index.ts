import { createClient } from 'npm:@supabase/supabase-js@2.95.3';
import { buildCorsHeaders, getClientIp, isRateLimitExceeded, json } from '../_shared/http.ts';
import { createPreflightHandler } from './handler.ts';
import { runPreflight } from './probe.ts';
import type { PreflightMaterial } from './types.ts';
import { assessHomologationPilotContract } from '../_shared/nfse-national/homologation-live-contract.ts';
import { createCompositePreflightTransport } from './relay-transport.ts';
import type { HomologationRelayConfig } from '../_shared/nfse-national/relay.ts';

const handler = createPreflightHandler({
  respond(req, body, status) {
    const response = json(body, status, req);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  },
  rateLimited: (req) => isRateLimitExceeded(`nfse-preflight:${getClientIp(req)}`, 5, 60_000),
  async identity(req) {
    const token = req.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(token)) throw new Error('AUTH_REQUIRED');
    const user = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_ANON_KEY') || '', {
      global: { headers: { Authorization: token } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await user.auth.getUser();
    if (error || !data.user) throw new Error('AUTH_REQUIRED');
    return data.user.id;
  },
  async material(actorId, scope) {
    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc('get_nfse_preflight_material_internal', {
      p_actor_id: actorId, p_context_key: scope.contextKey, p_polo_id: scope.poloId,
      p_environment: scope.environment, p_month: scope.month,
    });
    if (error || !data) throw new Error('PREFLIGHT_SCOPE_DENIED');
    return data as PreflightMaterial;
  },
  async probe(material, options) {
    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: relay, error } = await admin.rpc('get_nfse_homologation_relay_config_internal', {
      p_actor_id: material.actorId, p_context_key: material.contextKey, p_polo_id: material.poloId,
      p_environment: material.environment, p_month: material.month,
    });
    const transport = !error && relay
      ? createCompositePreflightTransport(material, relay as HomologationRelayConfig) : undefined;
    const data = await runPreflight(material, { ...options, transport });
    const capability = assessHomologationPilotContract(data);
    return { ...data, pilot: { available: capability.available, reason: capability.reason } };
  },
});

Deno.serve((req) => req.method === 'OPTIONS'
  ? new Response('ok', { headers: buildCorsHeaders(req) }) : handler(req));
