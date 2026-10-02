import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { isCancelledError, QueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase.ts';
import {
  caixaComposicaoQueryKeys,
  caixaComposicaoQueryOptions,
  retryCaixaComposicaoRead,
} from './caixa-composicao.queries.ts';
import { CaixaComposicaoClientContractError } from './caixa-composicao.service.ts';
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
    'v1',
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
