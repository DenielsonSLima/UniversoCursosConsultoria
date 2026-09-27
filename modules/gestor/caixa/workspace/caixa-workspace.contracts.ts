import type {
  CaixaWorkspaceIncompleteCode,
  CaixaWorkspacePayload,
} from './caixa-workspace.types.ts';
import {
  SNAPSHOT_PATTERN,
  UUID_PATTERN,
  addDays,
  availableSection,
  consideredSources,
  count,
  date,
  exactKeys,
  exactUnavailableSources,
  fail,
  incompleteReasons,
  laterSection,
  money,
  moneyCount,
  record,
  sameReasons,
  startOfNextMonth,
  timestamp,
  unavailableSources,
} from './caixa-workspace.validation.ts';

const payables = (value: unknown, field: string) => {
  const data = record(value, field);
  exactKeys(data, [
    'fontes_consideradas',
    'fontes_indisponiveis',
    'motivos_incompletude',
    'criterio',
    'contas_competencia',
    'pagas_competencia',
    'a_vencer_competencia',
    'em_atraso',
  ], field);
  consideredSources(data.fontes_consideradas, `${field}.fontes_consideradas`);
  unavailableSources(data.fontes_indisponiveis, `${field}.fontes_indisponiveis`);
  incompleteReasons(data.motivos_incompletude, `${field}.motivos_incompletude`);
  if (data.criterio !== 'POSICAO_REEXPRESSA_NO_CORTE') fail(`${field}.criterio`);
  moneyCount(data.contas_competencia, `${field}.contas_competencia`);

  const paid = record(data.pagas_competencia, `${field}.pagas_competencia`);
  exactKeys(paid, ['valor', 'quantidade', 'criterio_quantidade'], `${field}.pagas_competencia`);
  money(paid.valor, `${field}.pagas_competencia.valor`);
  count(paid.quantidade, `${field}.pagas_competencia.quantidade`);
  if (paid.criterio_quantidade !== 'TITULO_TOTALMENTE_PAGO_NO_CORTE') {
    fail(`${field}.pagas_competencia.criterio_quantidade`);
  }

  moneyCount(data.a_vencer_competencia, `${field}.a_vencer_competencia`);
  const overdue = record(data.em_atraso, `${field}.em_atraso`);
  exactKeys(overdue, ['valor', 'quantidade', 'data_mais_antiga'], `${field}.em_atraso`);
  money(overdue.valor, `${field}.em_atraso.valor`);
  count(overdue.quantidade, `${field}.em_atraso.quantidade`);
  if (overdue.data_mais_antiga !== null) {
    date(overdue.data_mais_antiga, `${field}.em_atraso.data_mais_antiga`);
  }
  return data;
};

const agenda = (value: unknown, field: string, institutionalDate: string) => {
  const data = record(value, field);
  exactKeys(data, [
    'fontes_consideradas',
    'fontes_indisponiveis',
    'motivos_incompletude',
    'hoje',
    'proximos_sete_dias',
    'dias',
  ], field);
  consideredSources(data.fontes_consideradas, `${field}.fontes_consideradas`);
  exactUnavailableSources(
    unavailableSources(data.fontes_indisponiveis, `${field}.fontes_indisponiveis`),
    [],
    `${field}.fontes_indisponiveis`,
  );
  incompleteReasons(data.motivos_incompletude, `${field}.motivos_incompletude`);

  const today = record(data.hoje, `${field}.hoje`);
  exactKeys(today, ['data', 'valor', 'quantidade'], `${field}.hoje`);
  money(today.valor, `${field}.hoje.valor`);
  count(today.quantidade, `${field}.hoje.quantidade`);
  if (date(today.data, `${field}.hoje.data`) !== institutionalDate) fail(`${field}.hoje.data`);

  const next = record(data.proximos_sete_dias, `${field}.proximos_sete_dias`);
  exactKeys(
    next,
    ['periodo_inicio', 'periodo_fim_exclusivo', 'valor', 'quantidade'],
    `${field}.proximos_sete_dias`,
  );
  money(next.valor, `${field}.proximos_sete_dias.valor`);
  count(next.quantidade, `${field}.proximos_sete_dias.quantidade`);
  if (
    date(next.periodo_inicio, `${field}.proximos_sete_dias.periodo_inicio`)
      !== addDays(institutionalDate, 1)
    || date(next.periodo_fim_exclusivo, `${field}.proximos_sete_dias.periodo_fim_exclusivo`)
      !== addDays(institutionalDate, 8)
  ) fail(`${field}.proximos_sete_dias`);

  if (!Array.isArray(data.dias) || data.dias.length !== 8) fail(`${field}.dias`);
  (data.dias as unknown[]).forEach((rawDay, index) => {
    const day = record(rawDay, `${field}.dias[${index}]`);
    exactKeys(day, ['data', 'valor', 'quantidade'], `${field}.dias[${index}]`);
    money(day.valor, `${field}.dias[${index}].valor`);
    count(day.quantidade, `${field}.dias[${index}].quantidade`);
    if (date(day.data, `${field}.dias[${index}].data`) !== addDays(institutionalDate, index)) {
      fail(`${field}.dias[${index}].data`);
    }
  });
  return data;
};

const quality = (value: unknown, field: string) => {
  const data = record(value, field);
  exactKeys(data, [
    'fontes_consideradas',
    'fontes_indisponiveis',
    'motivos_incompletude',
    'historico_contas_pagar_completo',
    'obrigacoes_sem_vencimento',
    'obrigacoes_sem_data_registro',
    'pagamentos_sem_data',
    'pagamentos_sem_valor',
    'pagamentos_parciais_sem_estado',
  ], field);
  consideredSources(data.fontes_consideradas, `${field}.fontes_consideradas`);
  exactUnavailableSources(
    unavailableSources(data.fontes_indisponiveis, `${field}.fontes_indisponiveis`),
    [],
    `${field}.fontes_indisponiveis`,
  );
  incompleteReasons(data.motivos_incompletude, `${field}.motivos_incompletude`);
  if (typeof data.historico_contas_pagar_completo !== 'boolean') {
    fail(`${field}.historico_contas_pagar_completo`);
  }
  count(data.obrigacoes_sem_vencimento, `${field}.obrigacoes_sem_vencimento`);
  count(data.obrigacoes_sem_data_registro, `${field}.obrigacoes_sem_data_registro`);
  count(data.pagamentos_sem_data, `${field}.pagamentos_sem_data`);
  count(data.pagamentos_sem_valor, `${field}.pagamentos_sem_valor`);
  count(data.pagamentos_parciais_sem_estado, `${field}.pagamentos_parciais_sem_estado`);
  return data;
};

const commitments = (value: unknown, field: string, institutionalDate: string) => {
  const section = record(value, field);
  exactKeys(section, ['disponivel', 'completo', 'motivo', 'observacao', 'dados'], field);
  if (
    section.disponivel !== true
    || section.completo !== false
    || section.motivo !== 'SUBSECOES_EM_ETAPA_POSTERIOR'
    || typeof section.observacao !== 'string'
    || section.observacao.trim() === ''
  ) fail(field);

  const data = record(section.dados, `${field}.dados`);
  exactKeys(
    data,
    [
      'fontes_consideradas',
      'fontes_indisponiveis',
      'contas_a_pagar',
      'contas_a_receber',
      'inadimplencia',
      'agenda_financeira',
    ],
    `${field}.dados`,
  );
  consideredSources(data.fontes_consideradas, `${field}.dados.fontes_consideradas`);
  exactUnavailableSources(
    unavailableSources(data.fontes_indisponiveis, `${field}.dados.fontes_indisponiveis`),
    [
      ['CONTAS_A_RECEBER_CANONICA', 'ETAPA_POSTERIOR'],
      ['INADIMPLENCIA_CANONICA', 'ETAPA_POSTERIOR'],
    ],
    `${field}.dados.fontes_indisponiveis`,
  );
  const payablesSection = availableSection(
    data.contas_a_pagar,
    `${field}.dados.contas_a_pagar`,
    payables,
  );
  laterSection(data.contas_a_receber, `${field}.dados.contas_a_receber`);
  laterSection(data.inadimplencia, `${field}.dados.inadimplencia`);
  const agendaSection = availableSection(
    data.agenda_financeira,
    `${field}.dados.agenda_financeira`,
    (agendaData, agendaField) => agenda(agendaData, agendaField, institutionalDate),
  );
  return { payablesSection, agendaSection };
};

export function assertCaixaWorkspaceV2Payload(
  value: unknown,
): asserts value is CaixaWorkspacePayload {
  const payload = record(value, 'payload');
  exactKeys(payload, ['versao', 'meta', 'regras', 'secoes'], 'payload');
  if (payload.versao !== 2) fail('versao');

  const meta = record(payload.meta, 'meta');
  exactKeys(meta, [
    'competencia',
    'periodo_inicio',
    'periodo_fim_exclusivo',
    'data_corte',
    'data_institucional',
    'timezone',
    'snapshot_id',
    'gerado_em',
    'escopo_tipo',
    'polo_id',
    'meses_historico',
    'criterio_posicao',
    'criterio_historico',
    'criterio_realizado',
  ], 'meta');
  const competence = date(meta.competencia, 'meta.competencia');
  const periodStart = date(meta.periodo_inicio, 'meta.periodo_inicio');
  const periodEnd = date(meta.periodo_fim_exclusivo, 'meta.periodo_fim_exclusivo');
  const cut = date(meta.data_corte, 'meta.data_corte');
  const institutionalDate = date(meta.data_institucional, 'meta.data_institucional');
  const institutionalCompetence = `${institutionalDate.slice(0, 7)}-01`;
  if (
    competence !== periodStart
    || !competence.endsWith('-01')
    || competence > institutionalCompetence
    || periodEnd !== startOfNextMonth(competence)
    || cut < periodStart
    || cut !== (institutionalDate < periodEnd ? institutionalDate : addDays(periodEnd, -1))
  ) fail('meta.corte_competencia');
  if (meta.timezone !== 'America/Maceio') fail('meta.timezone');
  if (typeof meta.snapshot_id !== 'string' || !SNAPSHOT_PATTERN.test(meta.snapshot_id)) {
    fail('meta.snapshot_id');
  }
  timestamp(meta.gerado_em, 'meta.gerado_em');
  const globalScope = meta.escopo_tipo === 'GLOBAL' && meta.polo_id === null;
  const poloScope = meta.escopo_tipo === 'POLO'
    && typeof meta.polo_id === 'string'
    && UUID_PATTERN.test(meta.polo_id);
  if (!globalScope && !poloScope) fail('meta.escopo');
  if (!Number.isSafeInteger(meta.meses_historico)
    || Number(meta.meses_historico) < 1
    || Number(meta.meses_historico) > 12) fail('meta.meses_historico');
  if (meta.criterio_posicao !== 'POSICAO_REEXPRESSA_NO_CORTE') {
    fail('meta.criterio_posicao');
  }
  if (meta.criterio_historico !== 'POSICAO_REEXPRESSA_NO_CORTE') {
    fail('meta.criterio_historico');
  }
  if (meta.criterio_realizado !== 'PAGAMENTO_EFETIVO_ATE_CORTE') {
    fail('meta.criterio_realizado');
  }

  const rules = record(payload.regras, 'regras');
  exactKeys(rules, [
    'compromissos_abertos_impactam_realizado',
    'compromissos_abertos_impactam_posicoes',
    'rateio_economico_duplica_baixa_fisica',
    'moeda',
  ], 'regras');
  if (
    rules.compromissos_abertos_impactam_realizado !== false
    || rules.compromissos_abertos_impactam_posicoes !== false
    || rules.rateio_economico_duplica_baixa_fisica !== false
    || rules.moeda !== 'DECIMAL_TEXT_2'
  ) fail('regras');

  const sections = record(payload.secoes, 'secoes');
  exactKeys(sections, [
    'resumo_executivo',
    'compromissos',
    'fluxo',
    'cobertura',
    'posicoes',
    'operacoes',
    'qualidade_dados',
  ], 'secoes');
  laterSection(sections.resumo_executivo, 'secoes.resumo_executivo');
  const commitmentsState = commitments(
    sections.compromissos,
    'secoes.compromissos',
    institutionalDate,
  );
  laterSection(sections.fluxo, 'secoes.fluxo');
  laterSection(sections.cobertura, 'secoes.cobertura');
  laterSection(sections.posicoes, 'secoes.posicoes');
  laterSection(sections.operacoes, 'secoes.operacoes');
  const qualitySection = availableSection(
    sections.qualidade_dados,
    'secoes.qualidade_dados',
    quality,
  );

  const qualityData = qualitySection.dados;
  const sourceReasons: CaixaWorkspaceIncompleteCode[] = [];
  if (Number(qualityData.obrigacoes_sem_vencimento) > 0) {
    sourceReasons.push('OBRIGACOES_SEM_VENCIMENTO');
  }
  if (Number(qualityData.obrigacoes_sem_data_registro) > 0) {
    sourceReasons.push('OBRIGACOES_SEM_DATA_REGISTRO');
  }
  if (Number(qualityData.pagamentos_sem_data) > 0) {
    sourceReasons.push('PAGAMENTOS_SEM_DATA');
  }
  if (Number(qualityData.pagamentos_sem_valor) > 0) {
    sourceReasons.push('PAGAMENTOS_SEM_VALOR');
  }
  if (Number(qualityData.pagamentos_parciais_sem_estado) > 0) {
    sourceReasons.push('PAGAMENTOS_PARCIAIS_SEM_ESTADO_CANONICO');
  }
  const sourcesComplete = sourceReasons.length === 0;
  if (qualitySection.completo !== sourcesComplete) fail('secoes.qualidade_dados.completo');
  sameReasons(
    qualityData.motivos_incompletude as CaixaWorkspaceIncompleteCode[],
    sourceReasons,
    'secoes.qualidade_dados.dados.motivos_incompletude',
  );

  const historicalComplete = competence === institutionalCompetence;
  if (qualityData.historico_contas_pagar_completo !== historicalComplete) {
    fail('secoes.qualidade_dados.dados.historico_contas_pagar_completo');
  }

  const agendaSection = commitmentsState.agendaSection;
  if (agendaSection.completo !== sourcesComplete) {
    fail('secoes.compromissos.dados.agenda_financeira.completo');
  }
  sameReasons(
    agendaSection.dados.motivos_incompletude as CaixaWorkspaceIncompleteCode[],
    sourceReasons,
    'secoes.compromissos.dados.agenda_financeira.dados.motivos_incompletude',
  );

  const payablesReasons: CaixaWorkspaceIncompleteCode[] = historicalComplete
    ? [...sourceReasons]
    : [...sourceReasons, 'CANCELAMENTOS_E_EXCLUSOES_SEM_VIGENCIA_HISTORICA'];
  const payablesSection = commitmentsState.payablesSection;
  if (payablesSection.completo !== (sourcesComplete && historicalComplete)) {
    fail('secoes.compromissos.dados.contas_a_pagar.completo');
  }
  sameReasons(
    payablesSection.dados.motivos_incompletude as CaixaWorkspaceIncompleteCode[],
    payablesReasons,
    'secoes.compromissos.dados.contas_a_pagar.dados.motivos_incompletude',
  );
  exactUnavailableSources(
    unavailableSources(
      payablesSection.dados.fontes_indisponiveis,
      'secoes.compromissos.dados.contas_a_pagar.dados.fontes_indisponiveis',
    ),
    historicalComplete
      ? []
      : [[
        'VIGENCIA_HISTORICA_CANCELAMENTOS_EXCLUSOES',
        'FONTE_NAO_BITEMPORAL',
      ]],
    'secoes.compromissos.dados.contas_a_pagar.dados.fontes_indisponiveis',
  );
}

export const isCaixaWorkspaceV2Payload = (value: unknown): value is CaixaWorkspacePayload => {
  try {
    assertCaixaWorkspaceV2Payload(value);
    return true;
  } catch {
    return false;
  }
};
