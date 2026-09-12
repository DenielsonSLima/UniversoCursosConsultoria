import { buildQueryUrl, object, type Resource } from './contract.ts';
import { createProescV1Client, ProescV1ReadError } from './v1-client.ts';

type ProbeCheck = { resource: Resource; ok: boolean; status: number; message: string };

async function probeV1Token(token: string, transport: typeof fetch, now: Date) {
  const client = createProescV1Client({ token, transport });
  let stage: 'configuration' | 'accounting' = 'configuration';
  let check: ProbeCheck;
  try {
    const configuration = await client.configurationData();
    if (configuration.units.length !== 1) {
      check = { resource: 'invoices', ok: false, status: 200,
        message: 'Não foi possível confirmar uma única unidade no Proesc. A consulta de cobranças não foi executada.' };
    } else {
      stage = 'accounting';
      await client.accountingData({ unitId: configuration.units[0].id,
        year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 });
      check = { resource: 'invoices', ok: true, status: 200,
        message: 'Acesso confirmado à configuração da unidade e à consulta de cobranças Proesc V1.' };
    }
  } catch (error) {
    const status = error instanceof ProescV1ReadError ? error.upstreamStatus : 0;
    const prefix = stage === 'configuration'
      ? 'Não foi possível confirmar a unidade no Proesc. A consulta de cobranças não foi executada.'
      : 'O Proesc não confirmou acesso às cobranças.';
    const reason = status === 401 ? 'Confira o token e a validade.'
      : status === 403 ? 'Consulta negada (403). Verifique a permissão do recurso e a liberação da integração.'
      : status === 429 ? 'Limite de consultas atingido. Aguarde antes de testar novamente.'
      : error instanceof ProescV1ReadError ? error.message : 'Tente novamente mais tarde.';
    check = { resource: 'invoices', ok: false, status, message: `${prefix} ${reason}` };
  }
  return { ok: check.ok, checkedAt: now.toISOString(), checks: [check], message: check.message };
}

async function probeResource(token: string, resource: Resource, transport: typeof fetch, now: Date): Promise<ProbeCheck> {
  const month = now.toISOString().slice(0, 7);
  const url = buildQueryUrl(resource, { unitId: '', start: month, end: month },
    { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, page: 1 });
  let response: Response;
  try {
    response = await transport(url, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
        'User-Agent': 'UniversoCursos-Integration/1.0' },
    });
  } catch {
    return { resource, ok: false, status: 0, message: 'Não foi possível conectar ao Proesc dentro do tempo limite.' };
  }
  if (!response.ok) {
    await response.body?.cancel();
    const message = response.status === 401 ? 'O Proesc recusou a autenticação. Confira o token e a validade.'
      : response.status === 403 ? 'O Proesc negou a consulta (403). Verifique a permissão deste recurso e a liberação da integração.'
      : response.status === 429 ? 'Limite de consultas do Proesc atingido. Aguarde antes de testar novamente.'
      : 'O Proesc não concluiu o teste. Tente novamente mais tarde.';
    return { resource, ok: false, status: response.status, message };
  }
  const reader = response.body?.getReader();
  if (!reader) return { resource, ok: false, status: response.status, message: 'O Proesc retornou uma resposta vazia.' };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4_000_000) { await reader.cancel(); throw new Error('response size'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let position = 0;
    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
    const payload = JSON.parse(new globalThis.TextDecoder().decode(bytes));
    const root = object(Array.isArray(payload) && payload.length === 1 ? payload[0] : payload);
    if (root.success === false || root.sucess === false || !Array.isArray(root.data)) throw new Error('response format');
    return { resource, ok: true, status: response.status, message: 'Acesso confirmado.' };
  } catch {
    return { resource, ok: false, status: response.status,
      message: 'A resposta do Proesc não confirmou acesso aos dados. A integração precisa de conferência.' };
  } finally { reader.releaseLock(); }
}

// Valida somente acesso. Nunca retorna pessoas, parcelas, token ou resposta externa bruta.
export async function testProescToken(token: string, transport: typeof fetch = fetch, now = new Date()) {
  if (/^[0-9a-f]{32}$/i.test(token)) return probeV1Token(token, transport, now);
  const checks = await Promise.all((['people', 'invoices'] as const).map((resource) => probeResource(token, resource, transport, now)));
  const ok = checks.every((check) => check.ok);
  return { ok, checkedAt: now.toISOString(), checks,
    message: ok ? 'Token validado para pessoas e parcelas.' : 'O teste não confirmou todos os acessos ao Proesc.' };
}
