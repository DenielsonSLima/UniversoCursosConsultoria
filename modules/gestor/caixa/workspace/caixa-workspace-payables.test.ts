import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { supabase } from '../../../../lib/supabase.ts';
import { CaixaWorkspaceV2ClientContractError } from './caixa-workspace.service.ts';
import type {
  CaixaWorkspacePayablesPayload,
  CaixaWorkspacePayablesRequest,
} from './caixa-workspace-payables.types.ts';
import { assertCaixaWorkspacePayablesPayload } from './caixa-workspace-payables.validation.ts';
import {
  assertCaixaWorkspacePayablesResponseMatchesRequest,
  getCaixaWorkspacePayables,
} from './caixa-workspace-payables.service.ts';
import {
  caixaWorkspacePayablesQueryKeys,
  caixaWorkspacePayablesQueryOptions,
  retryCaixaWorkspacePayablesRead,
} from './caixa-workspace-payables.queries.ts';

const empresaId = '33333333-3333-3333-3333-333333333333';
const poloId = '44444444-4444-4444-4444-444444444444';
const request: CaixaWorkspacePayablesRequest = {
  empresaId,
  poloId,
  competencia: '2026-09-01',
  filtro: 'ATRASADAS',
  pagina: 1,
  tamanhoPagina: 20,
};

const payload = (): CaixaWorkspacePayablesPayload => ({
  versao: 2,
  meta: {
    snapshot_id: 'caixa-v2-drilldown-0123456789abcdef0123456789abcdef',
    empresa_id: empresaId,
    polo_id: poloId,
    escopo_tipo: 'POLO',
    competencia: '2026-09-01',
    periodo_inicio: '2026-09-01',
    periodo_fim_exclusivo: '2026-10-01',
    data_corte: '2026-09-27',
    data_institucional: '2026-09-27',
    timezone: 'America/Maceio',
    criterio: 'POSICAO_REEXPRESSA_NO_CORTE',
    unidade_contagem: 'LINHA_ECONOMICA',
    all_polos_admin_global_sistema: true,
  },
  filtro: 'ATRASADAS',
  paginacao: {
    pagina: 1,
    tamanho_pagina: 20,
    total_itens: 1,
    total_paginas: 1,
    tem_anterior: false,
    tem_proxima: false,
  },
  itens: [{
    chave: 'CONTA_PAGAR:10000000-0000-0000-0000-000000000001',
    fonte: 'CONTA_PAGAR_LEGADA',
    polo: { id: poloId, nome: 'Aracaju' },
    descricao: 'Energia',
    status: 'VENCIDO',
    datas: { vencimento: '2026-09-05', pagamento: null, registro: '2026-09-01' },
    valor_programado: '9007199254740993.07',
    valor_pago: '5.00',
    saldo_aberto: '9007199254740988.07',
  }],
});

test('valida o payload paginado sem converter dinheiro ou recompor a paginação', () => {
  const result = payload();
  assert.doesNotThrow(() => assertCaixaWorkspacePayablesPayload(result));
  assert.equal(result.itens[0].valor_programado, '9007199254740993.07');

  const source = readFileSync(join(
    process.cwd(),
    'modules/gestor/caixa/workspace/caixa-workspace-payables.validation.ts',
  ), 'utf8');
  assert.doesNotMatch(source, /parseFloat|parseInt|BigInt|Math\.|\.reduce\(/);
  assert.doesNotMatch(source, /total_itens\s*[+*/-]|tamanho_pagina\s*[+*/-]/);
});

test('rejeita shape, dinheiro e contexto divergentes', () => {
  const invalidMoney = payload();
  invalidMoney.itens[0].saldo_aberto = '10.0';
  assert.throws(() => assertCaixaWorkspacePayablesPayload(invalidMoney), /saldo_aberto/);

  const invalidKey = payload();
  invalidKey.itens[0].chave = 'CONTA_PAGAR:invalida';
  assert.throws(() => assertCaixaWorkspacePayablesPayload(invalidKey), /chave/);

  assert.throws(
    () => assertCaixaWorkspacePayablesResponseMatchesRequest(
      payload(), { ...request, pagina: 2 },
    ),
    CaixaWorkspaceV2ClientContractError,
  );
});

test('serviço chama a RPC segura, normaliza global e propaga cancelamento', async (t) => {
  const response = payload();
  response.meta.escopo_tipo = 'GLOBAL';
  response.meta.polo_id = null;
  let rpcName = '';
  let rpcArgs: Record<string, unknown> = {};
  let receivedSignal: AbortSignal | undefined;
  t.mock.method(supabase, 'rpc', (name: string, args: Record<string, unknown>) => {
    rpcName = name;
    rpcArgs = args;
    return {
      abortSignal(signal: AbortSignal) {
        receivedSignal = signal;
        return this;
      },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: response, error: null }).then(resolve);
      },
    };
  });
  const controller = new globalThis.AbortController();
  const result = await getCaixaWorkspacePayables(
    { ...request, poloId: 'todos' }, controller.signal,
  );
  assert.equal(rpcName, 'list_caixa_workspace_v2_contas_pagar_secure');
  assert.equal(rpcArgs.p_polo_id, null);
  assert.equal(rpcArgs.p_filtro, 'ATRASADAS');
  assert.equal(rpcArgs.p_pagina, 1);
  assert.equal(rpcArgs.p_tamanho_pagina, 20);
  assert.equal(rpcArgs.p_snapshot_id, null);
  assert.equal(receivedSignal, controller.signal);
  assert.equal(result.itens[0].saldo_aberto, '9007199254740988.07');
});

test('query key e cache segregam empresa, escopo, filtro e página', () => {
  const key = caixaWorkspacePayablesQueryKeys.detail(request);
  assert.deepEqual(key, [
    'caixa', 'workspace', 'v2', 'empresa', empresaId,
    'escopo', 'POLO', poloId, 'contas-pagar-drilldown',
    '2026-09-01', 'ATRASADAS', 1, 20, 'snapshot', null,
  ]);
  assert.notDeepEqual(key, caixaWorkspacePayablesQueryKeys.detail({ ...request, pagina: 2 }));
  assert.notDeepEqual(key, caixaWorkspacePayablesQueryKeys.detail({ ...request, filtro: 'HOJE' }));
  const options = caixaWorkspacePayablesQueryOptions(request);
  assert.equal(options.staleTime, 30_000);
  assert.equal(options.gcTime, 15 * 60_000);
  assert.equal(options.refetchOnWindowFocus, true);
  assert.equal(retryCaixaWorkspacePayablesRead(0, { code: '40001' }), false);
  const snapshotRequest = { ...request, pagina: 2, snapshotId: payload().meta.snapshot_id };
  const snapshotKey = caixaWorkspacePayablesQueryKeys.detail(snapshotRequest);
  assert.notDeepEqual(snapshotKey, caixaWorkspacePayablesQueryKeys.detail({
    ...snapshotRequest,
    snapshotId: 'caixa-v2-drilldown-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  }));
});
