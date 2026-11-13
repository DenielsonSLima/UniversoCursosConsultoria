import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const requests = [];
let response = { data: [], error: null };
globalThis.__dashboardActivityRpc = async (...args) => {
  requests.push(args);
  return response;
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '../../../lib/supabase'
      && context.parentURL?.includes('/dashboard/dashboard.service.ts')) {
      return { url: 'dashboard-test:supabase', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'dashboard-test:supabase') {
      return {
        format: 'module',
        source: 'export const supabase = { rpc: (...args) => globalThis.__dashboardActivityRpc(...args) };',
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});
const { dashboardService } = await import('./dashboard.service.ts');
hooks.deregister();

test('consulta a RPC com precisão preservada e mantém a ordem recebida', async () => {
  response = { error: null, data: [
    { tipo_atividade: 'pagamento', titulo: 'Sintético', descricao: 'Sem data', data_evento: null },
    { tipo_atividade: 'matricula', titulo: 'Sintético', descricao: 'Matrícula', data_evento: '2026-11-13T13:00:00+00:00' },
    { tipo_atividade: 'pagamento', titulo: 'Sintético', descricao: 'Pagamento', data_evento: '2026-11-13' },
  ] };
  assert.deepEqual(await dashboardService.getRecentActivity('polo-sintetico', 4), [
    { tipoAtividade: 'pagamento', titulo: 'Sintético', descricao: 'Sem data', dataEvento: '' },
    { tipoAtividade: 'matricula', titulo: 'Sintético', descricao: 'Matrícula', dataEvento: '2026-11-13T13:00:00+00:00' },
    { tipoAtividade: 'pagamento', titulo: 'Sintético', descricao: 'Pagamento', dataEvento: '2026-11-13' },
  ]);
  assert.deepEqual(requests.at(-1), [
    'get_dashboard_recent_activity_v2', { p_polo_id: 'polo-sintetico', p_limit: 4 },
  ]);
});

test('preserva os parâmetros padrão e não faz fallback para a RPC com hora inventada', async () => {
  response = { data: [], error: null };
  assert.deepEqual(await dashboardService.getRecentActivity(), []);
  assert.deepEqual(requests.at(-1), [
    'get_dashboard_recent_activity_v2', { p_polo_id: null, p_limit: 5 },
  ]);
  const error = new Error('RPC indisponível');
  response = { data: null, error };
  const original = console.error;
  console.error = () => {};
  try {
    const before = requests.length;
    await assert.rejects(dashboardService.getRecentActivity(), error);
    assert.equal(requests.length, before + 1);
  } finally {
    console.error = original;
    delete globalThis.__dashboardActivityRpc;
  }
});
