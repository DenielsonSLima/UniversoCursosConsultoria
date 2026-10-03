import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { isCancelledError, QueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase.ts';
import {
  caixaComposicaoQueryKeys,
  caixaComposicaoQueryOptions,
  retryCaixaComposicaoRead,
} from './caixa-composicao.queries.ts';
import { CaixaComposicaoClientContractError, getCaixaComposicaoMensal } from './caixa-composicao.service.ts';
import {
  assertCaixaComposicaoMensalPayload,
  isCaixaComposicaoMensalPayload,
} from './caixa-composicao.validation.ts';

const poloId = '44444444-4444-4444-4444-444444444444';
const competencia = '2026-10-01';

const completeSection = () => ({
  disponivel: true,
  completo: true,
  motivo: null,
  observacao: null,
  dados: {
    total: '9007199254740993.07',
    quantidade: 7,
    base: '9007199254740900.00',
    juros: '20.00',
    multa: '10.00',
    acrescimo: '63.07',
    desconto: '0.00',
    diferenca_a_conferir: '0.00',
    quantidade_a_conferir: 0,
  },
});

const payload = () => ({
  versao: 1,
  competencia,
  periodo_inicio: competencia,
  periodo_fim_exclusivo: '2026-11-01',
  escopo_tipo: 'POLO',
  polo_id: poloId,
  gerado_em: '2026-10-01T21:30:00-03:00',
  recebimentos: completeSection(),
  despesas: completeSection(),
});

const payloadV2 = () => {
  const v1 = payload();
  const withCounts = (section: ReturnType<typeof completeSection>) => ({
    ...section,
    dados: {
      ...section.dados,
      quantidade_sem_detalhamento: 0,
      quantidade_com_diferenca: 0,
    },
  });
  return {
    ...v1, versao: 2,
    recebimentos: withCounts(v1.recebimentos),
    despesas: withCounts(v1.despesas),
  };
};

test('valida exatamente o payload v1 e preserva dinheiro textual acima do limite seguro', () => {
  const result = payload();
  assert.doesNotThrow(() => assertCaixaComposicaoMensalPayload(result));
  assert.equal(isCaixaComposicaoMensalPayload(result), true);
  assert.equal(result.recebimentos.dados.total, '9007199254740993.07');
});

test('rejeita dinheiro numérico, casas decimais incompletas e drift estrutural', () => {
  const numericMoney = payload();
  numericMoney.recebimentos.dados.total = 120.3 as unknown as string;
  assert.throws(() => assertCaixaComposicaoMensalPayload(numericMoney), /recebimentos\.dados\.total/);

  const oneDecimal = payload();
  oneDecimal.despesas.dados.base = '120.3';
  assert.throws(() => assertCaixaComposicaoMensalPayload(oneDecimal), /despesas\.dados\.base/);

  const extraField = { ...payload(), total_calculado_no_front: '0.00' };
  assert.throws(() => assertCaixaComposicaoMensalPayload(extraField), /payload/);
});

test('v2 distingue ausência de detalhamento e diferença por contagens canônicas', () => {
  const result = payloadV2();
  result.recebimentos = {
    ...result.recebimentos,
    completo: false, motivo: 'DADOS_INCOMPLETOS', observacao: 'Componentes não informados.',
    dados: {
      ...result.recebimentos.dados,
      juros: null,
      // Diferenças individuais podem se compensar; não inferir contagens pelo total.
      diferenca_a_conferir: '0.00',
      quantidade_a_conferir: 3,
      quantidade_sem_detalhamento: 1,
      quantidade_com_diferenca: 2,
    },
  } as never;
  assert.doesNotThrow(() => assertCaixaComposicaoMensalPayload(result));
  assert.equal(result.recebimentos.dados.quantidade_com_diferenca, 2);
  assert.equal(result.recebimentos.dados.juros, null);
});

test('v2 exige contagens válidas, coerentes entre si e limitadas ao total de movimentos', () => {
  for (const field of ['quantidade_sem_detalhamento', 'quantidade_com_diferenca']) {
    const absent = payloadV2();
    delete (absent.recebimentos.dados as Record<string, unknown>)[field];
    assert.throws(() => assertCaixaComposicaoMensalPayload(absent), /recebimentos\.dados/);
    for (const invalid of [-1, 0.5, '0', null]) {
      const result = payloadV2();
      (result.recebimentos.dados as Record<string, unknown>)[field] = invalid;
      assert.throws(() => assertCaixaComposicaoMensalPayload(result), new RegExp(field));
    }
  }
  const inconsistent = payloadV2();
  inconsistent.recebimentos.dados.quantidade_com_diferenca = 1;
  assert.throws(() => assertCaixaComposicaoMensalPayload(inconsistent), /contagens_conferencia/);
  const aboveTotal = payloadV2();
  aboveTotal.recebimentos.dados.quantidade_a_conferir = 8;
  aboveTotal.recebimentos.dados.quantidade_sem_detalhamento = 8;
  assert.throws(() => assertCaixaComposicaoMensalPayload(aboveTotal), /contagens_conferencia/);
  const mixedVersion = { ...payloadV2(), versao: 1 };
  assert.throws(() => assertCaixaComposicaoMensalPayload(mixedVersion), /recebimentos\.dados/);
});

test('serviço lê a RPC v2 com escopo e competência e preserva o payload validado', async () => {
  const result = payloadV2();
  const calls: unknown[][] = [];
  const rpc = mock.method(supabase, 'rpc', (...args: unknown[]) => {
    calls.push(args);
    return Promise.resolve({ data: result, error: null });
  });
  try {
    assert.equal(await getCaixaComposicaoMensal(poloId, competencia), result);
    assert.deepEqual(calls, [[
      'get_caixa_composicao_mensal_v2_secure',
      { p_polo_id: poloId, p_competencia: competencia },
    ]]);
  } finally {
    rpc.mock.restore();
  }
});

test('usa V1 somente quando a RPC V2 ainda não está publicada', async () => {
  const result = payload();
  const calls: string[] = [];
  const rpc = mock.method(supabase, 'rpc', (name: string) => {
    calls.push(name);
    return Promise.resolve(name.endsWith('_v2_secure')
      ? { data: null, error: { code: 'PGRST202', message: 'Could not find public.get_caixa_composicao_mensal_v2_secure in schema cache' } }
      : { data: result, error: null });
  });
  try {
    assert.equal(await getCaixaComposicaoMensal(poloId, competencia), result);
    assert.deepEqual(calls, ['get_caixa_composicao_mensal_v2_secure', 'get_caixa_composicao_mensal_secure']);
  } finally { rpc.mock.restore(); }
});

test('não usa fallback para permissão, rede ou outra função ausente', async () => {
  for (const error of [
    { code: '42501', message: 'Sem acesso' },
    { code: '502', message: 'Falha de rede' },
    { code: 'PGRST202', message: 'Could not find public.other_function' },
  ]) {
    const rpc = mock.method(supabase, 'rpc', () => Promise.resolve({ data: null, error }));
    try {
      await assert.rejects(getCaixaComposicaoMensal(poloId, competencia), (reason) => reason === error);
      assert.equal(rpc.mock.callCount(), 1);
    } finally { rpc.mock.restore(); }
  }
});

test('distingue completo, parcial e fonte indisponível sem transformar ausência em zero', () => {
  const partial = payload();
  partial.recebimentos = {
    disponivel: true,
    completo: false,
    motivo: 'DADOS_INCOMPLETOS',
    observacao: 'Duas baixas ainda não possuem composição comprovada.',
    dados: {
      ...completeSection().dados,
      juros: null,
      diferenca_a_conferir: '-20.00',
      quantidade_a_conferir: 2,
    },
  } as never;
  assert.doesNotThrow(() => assertCaixaComposicaoMensalPayload(partial));

  const unavailable = payload();
  unavailable.despesas = {
    disponivel: false,
    completo: false,
    motivo: 'FONTE_INDISPONIVEL',
    observacao: 'Fonte de despesas temporariamente indisponível.',
    dados: null,
  } as never;
  assert.doesNotThrow(() => assertCaixaComposicaoMensalPayload(unavailable));

  const invalidUnavailable = payload();
  invalidUnavailable.despesas = {
    disponivel: false,
    completo: false,
    motivo: 'FONTE_INDISPONIVEL',
    observacao: '',
    dados: null,
  } as never;
  assert.throws(() => assertCaixaComposicaoMensalPayload(invalidUnavailable), /despesas\.observacao/);
});

test('rejeita selo completo com campo não comprovado e parcial sem itens a conferir', () => {
  const incompleteMarkedAsComplete = payload();
  incompleteMarkedAsComplete.recebimentos.dados.juros = null;
  assert.throws(
    () => assertCaixaComposicaoMensalPayload(incompleteMarkedAsComplete),
    /recebimentos\.dados\.completude/,
  );

  const partialWithoutPending = payload();
  partialWithoutPending.recebimentos = {
    disponivel: true,
    completo: false,
    motivo: 'DADOS_INCOMPLETOS',
    observacao: 'Composição parcial.',
    dados: { ...completeSection().dados, quantidade_a_conferir: 0 },
  } as never;
  assert.throws(
    () => assertCaixaComposicaoMensalPayload(partialWithoutPending),
    /recebimentos\.dados\.quantidade_a_conferir/,
  );
});

test('valida competência, período e coerência do escopo', () => {
  const wrongPeriod = payload();
  wrongPeriod.periodo_fim_exclusivo = '2026-12-01';
  assert.throws(() => assertCaixaComposicaoMensalPayload(wrongPeriod), /periodo_fim_exclusivo/);

  const globalWithPolo = payload();
  globalWithPolo.escopo_tipo = 'GLOBAL';
  assert.throws(() => assertCaixaComposicaoMensalPayload(globalWithPolo), /escopo/);

  const invalidTimestamp = payload();
  invalidTimestamp.gerado_em = '2026-10-01 21:30:00';
  assert.throws(() => assertCaixaComposicaoMensalPayload(invalidTimestamp), /gerado_em/);
});

test('query key separa versão, escopo e competência', () => {
  assert.deepEqual(caixaComposicaoQueryKeys.detail(poloId, competencia), [
    'caixa',
    'composicao-mensal',
    'v2',
    'escopo',
    'POLO',
    poloId,
    'competencia',
    competencia,
  ]);
  assert.deepEqual(
    caixaComposicaoQueryKeys.detail('todos', competencia),
    caixaComposicaoQueryKeys.detail(null, competencia),
  );
  assert.notDeepEqual(
    caixaComposicaoQueryKeys.detail(poloId, competencia),
    caixaComposicaoQueryKeys.detail(poloId, '2026-09-01'),
  );
});

test('query explicita frescor, retenção, refetch e retry seguro', () => {
  const options = caixaComposicaoQueryOptions(poloId, competencia);
  assert.equal(options.staleTime, 30_000);
  assert.equal(options.gcTime, 30 * 60_000);
  assert.equal(options.refetchOnWindowFocus, true);
  assert.equal(options.refetchOnReconnect, true);
  assert.equal(options.retry, retryCaixaComposicaoRead);

  assert.equal(retryCaixaComposicaoRead(0, new Error('Falha transitória')), true);
  assert.equal(retryCaixaComposicaoRead(1, new Error('Falha transitória')), false);
  ['22023', '42501', '57014', 'PGRST301', 'P0001'].forEach((code) => {
    assert.equal(
      retryCaixaComposicaoRead(0, Object.assign(new Error(code), { code })),
      false,
    );
  });
  assert.equal(
    retryCaixaComposicaoRead(0, new CaixaComposicaoClientContractError('Contrato')),
    false,
  );
});

test('cancelar a query propaga AbortSignal para a leitura Supabase', async () => {
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
  const options = caixaComposicaoQueryOptions(poloId, competencia);
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
