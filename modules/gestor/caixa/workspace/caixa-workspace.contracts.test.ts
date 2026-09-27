import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCaixaWorkspaceV2Payload,
  isCaixaWorkspaceV2Payload,
} from './caixa-workspace.contracts.ts';
import type {
  CaixaWorkspaceConsideredSource,
  CaixaWorkspaceUnavailableSource,
} from './caixa-workspace.types.ts';

const laterSection = () => ({
  disponivel: false,
  completo: false,
  motivo: 'ETAPA_POSTERIOR',
  observacao: 'Seção reservada para uma etapa posterior do contrato v2.',
  dados: null,
});

const availableSection = <T>(dados: T, completo = true) => ({
  disponivel: true,
  completo,
  motivo: completo ? null : 'DADOS_INCOMPLETOS',
  observacao: 'Dados canônicos disponíveis nesta etapa.',
  dados,
});

const consideredSources = () => ([
  { fonte: 'public.contas_pagar', finalidade: 'TITULOS_LEGADOS' },
  { fonte: 'public.despesas_lancamentos', finalidade: 'DESPESAS' },
  {
    fonte: 'public.despesas_lancamentos_rateios',
    finalidade: 'RATEIO_ECONOMICO',
  },
]);

const payloadV2 = () => ({
  versao: 2,
  meta: {
    competencia: '2026-09-01',
    periodo_inicio: '2026-09-01',
    periodo_fim_exclusivo: '2026-10-01',
    data_corte: '2026-09-27',
    data_institucional: '2026-09-27',
    timezone: 'America/Maceio',
    snapshot_id: 'caixa-v2-0123456789abcdef0123456789abcdef',
    gerado_em: '2026-09-27T18:30:00-03:00',
    escopo_tipo: 'POLO',
    polo_id: '44444444-4444-4444-4444-444444444444',
    meses_historico: 6,
    criterio_posicao: 'POSICAO_REEXPRESSA_NO_CORTE',
    criterio_historico: 'POSICAO_REEXPRESSA_NO_CORTE',
    criterio_realizado: 'PAGAMENTO_EFETIVO_ATE_CORTE',
  },
  regras: {
    compromissos_abertos_impactam_realizado: false,
    compromissos_abertos_impactam_posicoes: false,
    rateio_economico_duplica_baixa_fisica: false,
    moeda: 'DECIMAL_TEXT_2',
  },
  secoes: {
    resumo_executivo: laterSection(),
    compromissos: {
      disponivel: true,
      completo: false,
      motivo: 'SUBSECOES_EM_ETAPA_POSTERIOR',
      observacao: 'Contas a pagar e agenda estão disponíveis; recebíveis e inadimplência ainda não.',
      dados: {
        fontes_consideradas: consideredSources(),
        fontes_indisponiveis: [
          { fonte: 'CONTAS_A_RECEBER_CANONICA', motivo: 'ETAPA_POSTERIOR' },
          { fonte: 'INADIMPLENCIA_CANONICA', motivo: 'ETAPA_POSTERIOR' },
        ],
        contas_a_pagar: availableSection({
          fontes_consideradas: consideredSources(),
          fontes_indisponiveis: [],
          motivos_incompletude: [],
          criterio: 'POSICAO_REEXPRESSA_NO_CORTE',
          contas_competencia: { valor: '9007199254740993.07', quantidade: 12 },
          pagas_competencia: {
            valor: '2500.00',
            quantidade: 4,
            criterio_quantidade: 'TITULO_TOTALMENTE_PAGO_NO_CORTE',
          },
          a_vencer_competencia: { valor: '1200.50', quantidade: 3 },
          em_atraso: {
            valor: '300.25',
            quantidade: 2,
            data_mais_antiga: '2026-09-05',
          },
        }),
        contas_a_receber: laterSection(),
        inadimplencia: laterSection(),
        agenda_financeira: availableSection({
          fontes_consideradas: consideredSources(),
          fontes_indisponiveis: [],
          motivos_incompletude: [],
          hoje: { data: '2026-09-27', valor: '50.00', quantidade: 1 },
          proximos_sete_dias: {
            periodo_inicio: '2026-09-28',
            periodo_fim_exclusivo: '2026-10-05',
            valor: '700.50',
            quantidade: 3,
          },
          dias: [
            '2026-09-27',
            '2026-09-28',
            '2026-09-29',
            '2026-09-30',
            '2026-10-01',
            '2026-10-02',
            '2026-10-03',
            '2026-10-04',
          ].map((data, index) => ({
            data,
            valor: index === 0 ? '50.00' : '100.00',
            quantidade: index === 0 ? 1 : 0,
          })),
        }),
      },
    },
    fluxo: laterSection(),
    cobertura: laterSection(),
    posicoes: laterSection(),
    operacoes: laterSection(),
    qualidade_dados: availableSection({
      fontes_consideradas: consideredSources(),
      fontes_indisponiveis: [],
      motivos_incompletude: [],
      historico_contas_pagar_completo: true,
      obrigacoes_sem_vencimento: 0,
      obrigacoes_sem_data_registro: 0,
      pagamentos_sem_data: 0,
      pagamentos_sem_valor: 0,
      pagamentos_parciais_sem_estado: 0,
    }),
  },
});

test('aceita exatamente a raiz física v2 e preserva dinheiro textual', () => {
  const payload = payloadV2();

  assert.doesNotThrow(() => assertCaixaWorkspaceV2Payload(payload));
  assert.equal(
    payload.secoes.compromissos.dados.contas_a_pagar.dados.contas_competencia.valor,
    '9007199254740993.07',
  );
  assert.equal(isCaixaWorkspaceV2Payload(payload), true);
});

test('rejeita raiz v1, campos flat e envelopes fora do contrato físico', () => {
  const oldVersion = payloadV2();
  oldVersion.versao = 1;
  assert.throws(() => assertCaixaWorkspaceV2Payload(oldVersion), /versao/);

  const flatField = { ...payloadV2(), competencia: '2026-09-01' };
  assert.throws(() => assertCaixaWorkspaceV2Payload(flatField), /payload/);

  const oldUnavailableReason = payloadV2();
  oldUnavailableReason.secoes.fluxo.motivo = 'FONTE_INDISPONIVEL';
  assert.throws(() => assertCaixaWorkspaceV2Payload(oldUnavailableReason), /secoes.fluxo/);
});

test('rejeita dinheiro numérico e critérios divergentes', () => {
  const numericMoney = payloadV2();
  numericMoney.secoes.compromissos.dados.contas_a_pagar.dados.em_atraso.valor = (
    300.25 as unknown as string
  );
  assert.throws(() => assertCaixaWorkspaceV2Payload(numericMoney), /em_atraso.valor/);

  const moneyWithoutTwoDecimals = payloadV2();
  moneyWithoutTwoDecimals.secoes.compromissos.dados.agenda_financeira
    .dados.hoje.valor = '50.0';
  assert.throws(
    () => assertCaixaWorkspaceV2Payload(moneyWithoutTwoDecimals),
    /agenda_financeira.*hoje.valor/,
  );

  const wrongPaidCriterion = payloadV2();
  wrongPaidCriterion.secoes.compromissos.dados.contas_a_pagar.dados
    .pagas_competencia.criterio_quantidade = 'PAGAMENTO_PARCIAL';
  assert.throws(
    () => assertCaixaWorkspaceV2Payload(wrongPaidCriterion),
    /criterio_quantidade/,
  );

  const wrongRule = payloadV2();
  wrongRule.regras.compromissos_abertos_impactam_realizado = true;
  assert.throws(() => assertCaixaWorkspaceV2Payload(wrongRule), /regras/);
});

test('valida escopo, corte, timezone e faixa de histórico', () => {
  const globalWithPolo = payloadV2();
  globalWithPolo.meta.escopo_tipo = 'GLOBAL';
  assert.throws(() => assertCaixaWorkspaceV2Payload(globalWithPolo), /meta.escopo/);

  const wrongCut = payloadV2();
  wrongCut.meta.data_corte = '2026-09-26';
  assert.throws(() => assertCaixaWorkspaceV2Payload(wrongCut), /corte_competencia/);

  const wrongTimezone = payloadV2();
  wrongTimezone.meta.timezone = 'UTC';
  assert.throws(() => assertCaixaWorkspaceV2Payload(wrongTimezone), /meta.timezone/);

  const invalidHistory = payloadV2();
  invalidHistory.meta.meses_historico = 13;
  assert.throws(() => assertCaixaWorkspaceV2Payload(invalidHistory), /meses_historico/);

  const invalidUuid = payloadV2();
  invalidUuid.meta.polo_id = 'polo-a';
  assert.throws(() => assertCaixaWorkspaceV2Payload(invalidUuid), /meta.escopo/);

  const futureCompetence = payloadV2();
  futureCompetence.meta.competencia = '2026-10-01';
  futureCompetence.meta.periodo_inicio = '2026-10-01';
  futureCompetence.meta.periodo_fim_exclusivo = '2026-11-01';
  futureCompetence.meta.data_corte = '2026-09-27';
  assert.throws(
    () => assertCaixaWorkspaceV2Payload(futureCompetence),
    /corte_competencia/,
  );

  const invalidSnapshot = payloadV2();
  invalidSnapshot.meta.snapshot_id = 'caixa-v2-sem-hash';
  assert.throws(() => assertCaixaWorkspaceV2Payload(invalidSnapshot), /snapshot_id/);
});

test('ancora agenda D0 a D+7 em data_institucional, inclusive no histórico', () => {
  const historical = payloadV2();
  historical.meta.competencia = '2026-08-01';
  historical.meta.periodo_inicio = '2026-08-01';
  historical.meta.periodo_fim_exclusivo = '2026-09-01';
  historical.meta.data_corte = '2026-08-31';
  historical.secoes.compromissos.dados.contas_a_pagar = availableSection({
    ...historical.secoes.compromissos.dados.contas_a_pagar.dados,
    fontes_indisponiveis: [{
      fonte: 'VIGENCIA_HISTORICA_CANCELAMENTOS_EXCLUSOES',
      motivo: 'FONTE_NAO_BITEMPORAL',
    }],
    motivos_incompletude: ['CANCELAMENTOS_E_EXCLUSOES_SEM_VIGENCIA_HISTORICA'],
  }, false) as never;
  historical.secoes.qualidade_dados.dados.historico_contas_pagar_completo = false;

  assert.doesNotThrow(() => assertCaixaWorkspaceV2Payload(historical));

  historical.secoes.compromissos.dados.agenda_financeira.dados.hoje.data = '2026-08-31';
  assert.throws(() => assertCaixaWorkspaceV2Payload(historical), /agenda_financeira.*hoje.data/);

  const missingDay = payloadV2();
  missingDay.secoes.compromissos.dados.agenda_financeira.dados.dias.pop();
  assert.throws(() => assertCaixaWorkspaceV2Payload(missingDay), /agenda_financeira.*dias/);
});

test('valida completo/motivo e qualidade sem estados antigos', () => {
  const coherentIncomplete = payloadV2();
  const reason = 'PAGAMENTOS_SEM_VALOR';
  coherentIncomplete.secoes.qualidade_dados.completo = false;
  coherentIncomplete.secoes.qualidade_dados.motivo = 'DADOS_INCOMPLETOS';
  coherentIncomplete.secoes.qualidade_dados.dados.pagamentos_sem_valor = 1;
  coherentIncomplete.secoes.qualidade_dados.dados.motivos_incompletude = [reason];
  coherentIncomplete.secoes.compromissos.dados.agenda_financeira.completo = false;
  coherentIncomplete.secoes.compromissos.dados.agenda_financeira.motivo = 'DADOS_INCOMPLETOS';
  coherentIncomplete.secoes.compromissos.dados.agenda_financeira
    .dados.motivos_incompletude = [reason];
  coherentIncomplete.secoes.compromissos.dados.contas_a_pagar.completo = false;
  coherentIncomplete.secoes.compromissos.dados.contas_a_pagar.motivo = 'DADOS_INCOMPLETOS';
  coherentIncomplete.secoes.compromissos.dados.contas_a_pagar
    .dados.motivos_incompletude = [reason];
  assert.doesNotThrow(() => assertCaixaWorkspaceV2Payload(coherentIncomplete));

  const missingValueReason = payloadV2();
  missingValueReason.secoes.qualidade_dados.completo = false;
  missingValueReason.secoes.qualidade_dados.motivo = 'DADOS_INCOMPLETOS';
  missingValueReason.secoes.qualidade_dados.dados.pagamentos_sem_valor = 1;
  missingValueReason.secoes.compromissos.dados.agenda_financeira.completo = false;
  missingValueReason.secoes.compromissos.dados.agenda_financeira.motivo = 'DADOS_INCOMPLETOS';
  missingValueReason.secoes.compromissos.dados.contas_a_pagar.completo = false;
  missingValueReason.secoes.compromissos.dados.contas_a_pagar.motivo = 'DADOS_INCOMPLETOS';
  assert.throws(
    () => assertCaixaWorkspaceV2Payload(missingValueReason),
    /motivos_incompletude/,
  );

  const incompleteWithoutReason = payloadV2();
  incompleteWithoutReason.secoes.qualidade_dados.completo = false;
  assert.throws(
    () => assertCaixaWorkspaceV2Payload(incompleteWithoutReason),
    /qualidade_dados/,
  );

  const legacyStatus = {
    ...payloadV2(),
    status_operacional: 'LUCRO',
  };
  assert.throws(() => assertCaixaWorkspaceV2Payload(legacyStatus), /payload/);

  const invalidQualityCount = payloadV2();
  invalidQualityCount.secoes.qualidade_dados.dados.pagamentos_sem_data = -1;
  assert.throws(
    () => assertCaixaWorkspaceV2Payload(invalidQualityCount),
    /pagamentos_sem_data/,
  );

  const inconsistentQuality = payloadV2();
  inconsistentQuality.secoes.qualidade_dados.dados.pagamentos_sem_data = 1;
  inconsistentQuality.secoes.qualidade_dados.dados.motivos_incompletude = [
    'PAGAMENTOS_SEM_DATA',
  ];
  assert.throws(
    () => assertCaixaWorkspaceV2Payload(inconsistentQuality),
    /qualidade_dados.completo/,
  );

  const inconsistentHistory = payloadV2();
  inconsistentHistory.secoes.qualidade_dados.dados.historico_contas_pagar_completo = false;
  assert.throws(
    () => assertCaixaWorkspaceV2Payload(inconsistentHistory),
    /historico_contas_pagar_completo/,
  );
});

test('rejeita pares ou ordem divergentes nas fontes canônicas', () => {
  const validConsidered: CaixaWorkspaceConsideredSource = {
    fonte: 'public.contas_pagar',
    finalidade: 'TITULOS_LEGADOS',
  };
  const validUnavailable: CaixaWorkspaceUnavailableSource = {
    fonte: 'CONTAS_A_RECEBER_CANONICA',
    motivo: 'ETAPA_POSTERIOR',
  };
  assert.equal(validConsidered.finalidade, 'TITULOS_LEGADOS');
  assert.equal(validUnavailable.motivo, 'ETAPA_POSTERIOR');

  const invalidConsideredPair = payloadV2();
  invalidConsideredPair.secoes.qualidade_dados.dados.fontes_consideradas[0] = {
    fonte: 'public.contas_pagar',
    finalidade: 'DESPESAS',
  };
  assert.throws(
    () => assertCaixaWorkspaceV2Payload(invalidConsideredPair),
    /fontes_consideradas\[0\]/,
  );

  const invalidUnavailablePair = payloadV2();
  invalidUnavailablePair.secoes.compromissos.dados.fontes_indisponiveis[0] = {
    fonte: 'CONTAS_A_RECEBER_CANONICA',
    motivo: 'FONTE_NAO_BITEMPORAL',
  };
  assert.throws(
    () => assertCaixaWorkspaceV2Payload(invalidUnavailablePair),
    /fontes_indisponiveis\[0\]/,
  );

  const reorderedSources = payloadV2();
  reorderedSources.secoes.qualidade_dados.dados.fontes_consideradas.reverse();
  assert.throws(
    () => assertCaixaWorkspaceV2Payload(reorderedSources),
    /fontes_consideradas\[0\]/,
  );
});
