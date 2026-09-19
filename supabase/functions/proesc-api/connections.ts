import { object, ProescError } from './contract.ts';
import { connectionToken, connectionWaf, proescVersion, type ProescVersion } from './connection-contract.ts';
import { testProescV1Token, testProescV2Token } from './test-token.ts';

type Admin = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data?: unknown; error?: unknown }> };
export const connectionActions = new Set(['connection_status', 'save_connection', 'remove_connection', 'test_connection']);

export async function connectionRpc(admin: Admin, actorId: string, version: ProescVersion, action: string, payload = {}) {
  const { data, error } = await admin.rpc('proesc_connection_service', {
    p_action: action, p_actor_id: actorId, p_payload: { ...payload, version },
  });
  if (error) throw new ProescError('Não foi possível acessar esta conexão Proesc. Atualize e tente novamente.', 409);
  return object(data);
}

export async function handleConnectionAction(admin: Admin, actorId: string, input: unknown, transport: typeof fetch) {
  const body = object(input);
  const version = proescVersion(body.version);
  if (body.action === 'connection_status') {
    const result = await connectionRpc(admin, actorId, version, 'status');
    return { version, configured: result.configured === true,
      updatedAt: typeof result.updatedAt === 'string' ? result.updatedAt : null,
      wafConfigured: version === 'v2' && result.wafConfigured === true };
  }
  if (body.action === 'save_connection') {
    const token = connectionToken(version, body.token);
    if (version === 'v1' && body.wafHeader) throw new ProescError('A liberação WAF pertence à conexão V2.');
    const wafHeader = version === 'v2' ? connectionWaf(body.wafHeader) : undefined;
    await connectionRpc(admin, actorId, version, 'save', { token, ...(wafHeader ? { wafHeader } : {}) });
    return { version, configured: true };
  }
  if (body.action === 'remove_connection') {
    await connectionRpc(admin, actorId, version, 'remove');
    return { version, configured: false };
  }
  if (body.action !== 'test_connection') throw new ProescError('Ação de conexão inválida.');
  const credential = await connectionRpc(admin, actorId, version, 'credential');
  const token = connectionToken(version, credential.token);
  if (typeof credential.revision !== 'string' || !credential.revision) throw new ProescError('Conexão indisponível.', 409);
  const waf = version === 'v2' ? connectionWaf(credential.wafHeader ?? undefined) : undefined;
  const result = version === 'v1' ? await testProescV1Token(token, transport)
    : await testProescV2Token(token, waf, transport);
  const current = await connectionRpc(admin, actorId, version, 'credential');
  if (current.revision !== credential.revision || current.token !== credential.token
    || current.wafHeader !== credential.wafHeader) {
    throw new ProescError('A conexão mudou durante o teste. Teste novamente.', 409);
  }
  return { ...result, version };
}
