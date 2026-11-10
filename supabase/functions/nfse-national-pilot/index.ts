import { createClient } from 'npm:@supabase/supabase-js@2.95.3';
import { buildCorsHeaders, getClientIp, isRateLimitExceeded, json } from '../_shared/http.ts';
import { buildNationalDps } from '../_shared/nfse-national/dps.ts';
import { createHomologationSchemaValidator } from '../_shared/nfse-national/homologation-schema.ts';
import { createNationalHomologationPilot } from '../_shared/nfse-national/pilot.ts';
import { assessHomologationPilotContract, assertNationalHomologationPilotContract } from '../_shared/nfse-national/homologation-live-contract.ts';
import { runPreflight } from '../nfse-national-preflight/probe.ts';
import type { PreflightMaterial } from '../nfse-national-preflight/types.ts';
import type { PilotCommand } from './contract.ts';
import { createPilotHandler, pilotCredentialChangeCode, type PilotLedgerRow } from './handler.ts';
import { syntheticPilotScenario } from './scenario.ts';
import { createPilotTransport } from './transport.ts';
import { createCompositePreflightTransport } from '../nfse-national-preflight/relay-transport.ts';
import type { HomologationRelayConfig } from '../_shared/nfse-national/relay.ts';

const admin = () => createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  { auth: { persistSession: false, autoRefreshToken: false } });

async function material(actor: string, command: PilotCommand): Promise<PreflightMaterial> {
  const { data, error } = await admin().rpc('get_nfse_preflight_material_internal', {
    p_actor_id: actor, p_context_key: command.scope.contextKey, p_polo_id: command.scope.poloId,
    p_environment: command.scope.environment, p_month: command.scope.month,
  });
  if (error || !data || data.actorId !== actor || Object.entries(command.scope).some(([key, value]) => data[key] !== value)) {
    throw new Error('PILOT_SCOPE_DENIED');
  }
  return data as PreflightMaterial;
}
async function ledger(command: PilotCommand, actor: string, action: string, input: unknown = null): Promise<PilotLedgerRow> {
  const { data, error } = await admin().rpc('nfse_homologation_pilot_internal', {
    p_actor_id: actor, p_context_key: command.scope.contextKey, p_polo_id: command.scope.poloId,
    p_environment: command.scope.environment, p_month: command.scope.month, p_request_id: command.requestId,
    p_action: action, p_preview_id: command.previewId || null, p_input: input,
  });
  if (error || !data) throw new Error('PILOT_LEDGER_UNAVAILABLE');
  return data as PilotLedgerRow;
}

async function relayConfiguration(actor: string, command: PilotCommand): Promise<HomologationRelayConfig> {
  const { data, error } = await admin().rpc('get_nfse_homologation_relay_config_internal', {
    p_actor_id: actor, p_context_key: command.scope.contextKey, p_polo_id: command.scope.poloId,
    p_environment: command.scope.environment, p_month: command.scope.month,
  });
  if (error || !data) throw new Error('PILOT_RELAY_UNAVAILABLE');
  return data as HomologationRelayConfig;
}

const handler = createPilotHandler({
  respond(req, body, status) { const response = json(body, status, req);
    response.headers.set('Cache-Control', 'no-store'); return response; },
  rateLimited: req => isRateLimitExceeded(`nfse-pilot:${getClientIp(req)}`, 8, 60_000),
  async authorize(req, command) {
    const token = req.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(token)) throw new Error('AUTH_REQUIRED');
    const user = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_ANON_KEY') || '',
      { global: { headers: { Authorization: token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: identity, error: authError } = await user.auth.getUser();
    if (authError || !identity.user) throw new Error('AUTH_REQUIRED');
    const { data, error } = await user.rpc('authorize_nfse_certificate_upload_secure', {
      p_context_key: command.scope.contextKey, p_polo_id: command.scope.poloId,
      p_environment: command.scope.environment, p_month: command.scope.month,
    });
    if (error || !data || data.actorId !== identity.user.id) throw new Error('PILOT_SCOPE_DENIED');
    return identity.user.id;
  },
  ledger,
  async preview(command, actor) {
    const credential = await material(actor, command);
    const config = await relayConfiguration(actor, command);
    const probe = await runPreflight(credential, { transport: createCompositePreflightTransport(credential, config) });
    const capability = assessHomologationPilotContract(probe);
    const row = await ledger(command, actor, 'PREVIEW', syntheticPilotScenario(credential));
    return { row, available: capability.available, reason: capability.reason };
  },
  async execute(command, actor, row, reconcile) {
    const credential = await material(actor, command);
    const changeCode = pilotCredentialChangeCode(row, credential, reconcile);
    if (changeCode) return { state: 'BLOCKED', code: changeCode };
    const config = await relayConfiguration(actor, command);
    const probe = await runPreflight(credential, { transport: createCompositePreflightTransport(credential, config) });
    const assertContract = () => assertNationalHomologationPilotContract(probe);
    const transport = createPilotTransport(credential.material, assertContract, config);
    try {
      const executor = createNationalHomologationPilot({ schema: createHomologationSchemaValidator(),
        credential: credential.material, signatureProfile: 'RSA_SHA1_LEGACY', transport, assertLiveContract: assertContract });
      const intent = { input: row.fiscalInput, expectedDpsId: buildNationalDps(row.fiscalInput).referenceId };
      return await (reconcile ? executor.reconcile(intent) : executor.issue(intent));
    } finally { transport.close(); }
  },
});
Deno.serve(req => req.method === 'OPTIONS' ? new Response('ok', { headers: buildCorsHeaders(req) }) : handler(req));
