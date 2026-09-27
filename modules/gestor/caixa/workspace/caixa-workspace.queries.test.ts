import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { isCancelledError, QueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase.ts';
import { CaixaWorkspaceV2ClientContractError } from './caixa-workspace.service.ts';
import {
  caixaWorkspaceV2QueryKeys,
  caixaWorkspaceV2QueryOptions,
  retryCaixaWorkspaceV2Read,
} from './caixa-workspace.queries.ts';

const request = {
  empresaId: '33333333-3333-3333-3333-333333333333',
  poloId: '44444444-4444-4444-4444-444444444444',
  competencia: '2026-09-01',
  mesesHistorico: 6,
};

test('query key separa versão, empresa, escopo, competência e histórico', () => {
  assert.deepEqual(caixaWorkspaceV2QueryKeys.detail(request), [
    'caixa', 'workspace', 'v2',
    'empresa', request.empresaId,
    'escopo', 'POLO', request.poloId,
    'competencia', request.competencia,
    'meses_historico', request.mesesHistorico,
  ]);
  assert.notDeepEqual(
    caixaWorkspaceV2QueryKeys.detail(request),
    caixaWorkspaceV2QueryKeys.detail({ ...request, empresaId: '55555555-5555-5555-5555-555555555555' }),
  );
  assert.notDeepEqual(
    caixaWorkspaceV2QueryKeys.detail(request),
    caixaWorkspaceV2QueryKeys.detail({ ...request, competencia: '2026-08-01' }),
  );
  assert.notDeepEqual(
    caixaWorkspaceV2QueryKeys.detail(request),
    caixaWorkspaceV2QueryKeys.detail({ ...request, mesesHistorico: 3 }),
  );
  assert.deepEqual(
    caixaWorkspaceV2QueryKeys.detail({ ...request, poloId: 'todos' }),
    caixaWorkspaceV2QueryKeys.detail({ ...request, poloId: null }),
  );
});

test('query usa política explícita de frescor, retenção e refetch', () => {
  const options = caixaWorkspaceV2QueryOptions(request);
  assert.equal(options.staleTime, 30_000);
  assert.equal(options.gcTime, 30 * 60_000);
  assert.equal(options.refetchOnWindowFocus, true);
  assert.equal(options.refetchOnReconnect, true);
  assert.equal(options.retry, retryCaixaWorkspaceV2Read);
});

test('retry ocorre uma vez somente para falha transitória', () => {
  assert.equal(retryCaixaWorkspaceV2Read(0, new Error('Falha de rede')), true);
  assert.equal(retryCaixaWorkspaceV2Read(1, new Error('Falha de rede')), false);
  ['22023', '42501', '57014', '28000', '28P01', 'PGRST301', 'PGRST302'].forEach((code) => {
    assert.equal(retryCaixaWorkspaceV2Read(0, Object.assign(new Error(code), { code })), false);
  });
  assert.equal(
    retryCaixaWorkspaceV2Read(0, Object.assign(new Error('Abortado'), { name: 'AbortError' })),
    false,
  );
  assert.equal(retryCaixaWorkspaceV2Read(0, Object.assign(new Error('401'), { status: 401 })), false);
  assert.equal(retryCaixaWorkspaceV2Read(0, Object.assign(new Error('403'), { statusCode: 403 })), false);
  assert.equal(
    retryCaixaWorkspaceV2Read(0, new CaixaWorkspaceV2ClientContractError('Contrato')),
    false,
  );
});

test('cancelar a query aborta o request Supabase', async () => {
  let receivedSignal: AbortSignal | undefined;
  const pending = new Promise(() => {});
  const builder = {
    abortSignal(signal: AbortSignal) {
      receivedSignal = signal;
      return this;
    },
    then: pending.then.bind(pending),
  };
  const rpc = mock.method(
    supabase,
    'rpc',
    () => builder as unknown as ReturnType<typeof supabase.rpc>,
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = caixaWorkspaceV2QueryOptions(request);
  try {
    const result = client.fetchQuery(options).catch((error: unknown) => error);
    await Promise.resolve();
    assert.ok(receivedSignal);
    await client.cancelQueries({ queryKey: options.queryKey });
    assert.equal(receivedSignal.aborted, true);
    assert.equal(isCancelledError(await result), true);
  } finally {
    rpc.mock.restore();
    client.clear();
  }
});
