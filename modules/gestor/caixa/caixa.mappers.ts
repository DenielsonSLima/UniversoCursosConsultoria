import type {
  CaixaMonthlyStatement,
  CaixaFinanciamentoResumo,
  CaixaCustosOperacionais,
  CaixaPatrimonioResumo,
  CaixaPosicaoLiquidaResumo,
  CaixaPosicaoTotalResumo
} from './caixa.types';
import {
  asRecord,
  asArray,
  asNumber,
  asString,
  asResultStatus,
  assertStatementPayload,
  assertFinanciamentoResumoPayload,
  assertCustosOperacionaisPayload,
  assertPatrimonioResumoPayload,
  assertPosicaoLiquidaResumoPayload,
  assertPosicaoTotalResumoPayload
} from './caixa.contracts';
export const mapCaixaStatement = (value: unknown): CaixaMonthlyStatement => {
  const payload = asRecord(Array.isArray(value) ? value[0] : value);
  assertStatementPayload(payload);
  const meta = asRecord(payload.meta);
  const saldos = asRecord(payload.saldos_hoje);
  const resumo = asRecord(payload.resumo_competencia);
  const compromissos = asRecord(payload.compromissos);
  const mensal = asRecord(compromissos.inadimplencia_mensal);
  const classificacao = asRecord(payload.classificacao);
  const conciliacao = asRecord(payload.conciliacao);
  const qualidade = asRecord(payload.qualidade_dados);

  return {
    versao: asNumber(payload.versao),
    meta: {
      competencia: asString(meta.competencia),
      periodoInicio: asString(meta.periodo_inicio),
      periodoFimExclusivo: asString(meta.periodo_fim_exclusivo),
      geradoEm: asString(meta.gerado_em),
      escopoTipo: meta.escopo_tipo === 'POLO' ? 'POLO' : 'GLOBAL',
      poloId: typeof meta.polo_id === 'string' ? meta.polo_id : null,
      escopoRotulo: asString(meta.escopo_rotulo),
      fonteSaldo: 'CONTABIL_SISTEMA',
      extratoBancarioDisponivel: meta.extrato_bancario_disponivel === true,
    },
    saldosHoje: {
      registradoTotal: asNumber(saldos.registrado_total),
      bancarioRegistrado: asNumber(saldos.bancario_registrado),
      caixaLocal: asNumber(saldos.caixa_local),
      compartilhadoTotal: asNumber(saldos.compartilhado_total),
      posicaoCompartilhadaEscopo: asNumber(saldos.posicao_compartilhada_escopo),
      naoAtribuido: asNumber(saldos.nao_atribuido),
    },
    resumoCompetencia: {
      entradasRecebidasBrutas: asNumber(resumo.entradas_recebidas_brutas),
      tarifasBancariasConfirmadas: asNumber(resumo.tarifas_bancarias_confirmadas),
      saidasPagas: asNumber(resumo.saidas_pagas),
      resultado: asNumber(resumo.resultado),
      resultadoStatus: asResultStatus(resumo.resultado_status),
      quantidadeRecebimentos: asNumber(resumo.quantidade_recebimentos),
      quantidadePagamentos: asNumber(resumo.quantidade_pagamentos),
    },
    compromissos: {
      aReceber: asNumber(compromissos.a_receber),
      receberVencido: asNumber(compromissos.receber_vencido),
      margemInadimplencia: asNumber(compromissos.margem_inadimplencia),
      inadimplenciaMensal: {
        periodoInicio: asString(mensal.periodo_inicio),
        periodoFimExclusivo: asString(mensal.periodo_fim_exclusivo),
        dataCorte: asString(mensal.data_corte),
        baseElegivel: asNumber(mensal.base_elegivel),
        quantidadeElegiveis: asNumber(mensal.quantidade_elegiveis),
        quantidadeEmConferencia: asNumber(mensal.quantidade_em_conferencia),
        valorNominalEmConferencia: asNumber(mensal.valor_nominal_em_conferencia),
        completo: mensal.completo === true,
        criterio: 'VENCIMENTO_MENSAL_POSICAO_NO_CORTE',
      },
      aPagar: asNumber(compromissos.a_pagar),
      pagarVencido: asNumber(compromissos.pagar_vencido),
    },
    receitasPorModalidade: asArray(payload.receitas_por_modalidade).map((item) => ({
      codigo: asString(item.codigo),
      rotulo: asString(item.rotulo),
      valor: asNumber(item.valor),
      quantidade: asNumber(item.quantidade),
      percentual: asNumber(item.percentual),
    })),
    despesasPorCategoria: asArray(payload.despesas_por_categoria).map((item) => ({
      codigo: asString(item.codigo),
      rotulo: asString(item.rotulo),
      valor: asNumber(item.valor),
      quantidade: asNumber(item.quantidade),
      percentual: asNumber(item.percentual),
    })),
    serieMensal: asArray(payload.serie_mensal).map((item) => ({
      competencia: asString(item.competencia),
      rotulo: asString(item.rotulo),
      entradas: asNumber(item.entradas),
      saidas: asNumber(item.saidas),
      resultado: asNumber(item.resultado),
      resultadoStatus: asResultStatus(item.resultado_status),
      entradasEscalaPercentual: asNumber(item.entradas_escala_percentual),
      saidasEscalaPercentual: asNumber(item.saidas_escala_percentual),
      inadimplencia: asNumber(item.inadimplencia),
      inadimplenciaEscalaPercentual: asNumber(item.inadimplencia_escala_percentual),
      inadimplenciaQuantidadeEmConferencia: asNumber(item.inadimplencia_quantidade_em_conferencia),
      inadimplenciaCompleto: item.inadimplencia_completo === true,
      resultadoPosicaoPercentual: asNumber(item.resultado_posicao_percentual),
      inadimplenciaPosicaoPercentual: asNumber(item.inadimplencia_posicao_percentual),
      graficoZeroPosicaoPercentual: asNumber(item.grafico_zero_posicao_percentual),
    })),
    contas: asArray(payload.contas).map((item) => ({
      id: asString(item.id),
      banco: asString(item.banco),
      agencia: asString(item.agencia),
      conta: asString(item.conta),
      titular: asString(item.titular),
      cidadeUf: asString(item.cidade_uf),
      natureza: item.natureza === 'CAIXA_INTERNO' ? 'CAIXA_INTERNO' : 'BANCARIA',
      compartilhada: item.compartilhada === true,
      unidadesUso: asNumber(item.unidades_uso),
      valorExibido: asNumber(item.valor_exibido),
      tipoValorExibido: item.tipo_valor_exibido === 'POSICAO_POLO'
        ? 'POSICAO_POLO'
        : 'SALDO_CONTA',
      saldoTotalRegistrado: asNumber(item.saldo_total_registrado),
      posicaoGerencialEscopo: asNumber(item.posicao_gerencial_escopo),
      ativo: item.ativo !== false,
      codigoInterno: asString(item.codigo_interno),
    })),
    classificacao: {
      quantidadeSemPolo: asNumber(classificacao.quantidade_sem_polo),
      valorSemPolo: asNumber(classificacao.valor_sem_polo),
    },
    conciliacao: {
      recebimentosConciliados: asNumber(conciliacao.recebimentos_conciliados),
      pagamentosConciliados: asNumber(conciliacao.pagamentos_conciliados),
      pendentes: asNumber(conciliacao.pendentes),
      ultimaAtualizacao: typeof conciliacao.ultima_atualizacao === 'string'
        ? conciliacao.ultima_atualizacao
        : null,
    },
    qualidadeDados: {
      movimentosSemPolo: asNumber(qualidade.movimentos_sem_polo),
      pagamentosSemConta: asNumber(qualidade.pagamentos_sem_conta),
      pagamentosSemData: asNumber(qualidade.pagamentos_sem_data),
      receitasSemModalidade: asNumber(qualidade.receitas_sem_modalidade),
      tarifasEstimadasIgnoradas: asNumber(qualidade.tarifas_estimadas_ignoradas),
    },
  };
};

export const mapCaixaFinanciamentoResumo = (value: unknown): CaixaFinanciamentoResumo => {
  const payload = asRecord(Array.isArray(value) ? value[0] : value);
  assertFinanciamentoResumoPayload(payload);

  return {
    competencia: asString(payload.competencia),
    creditoLiberadoMatriz: asNumber(payload.credito_liberado_matriz),
    obrigacaoRateada: asNumber(payload.obrigacao_rateada),
    principalRateado: asNumber(payload.principal_rateado),
    encargosRateados: asNumber(payload.encargos_rateados),
    pagoRateado: asNumber(payload.pago_rateado),
    observacao: typeof payload.observacao === 'string' ? payload.observacao : null,
  };
};

export const mapCaixaCustosOperacionais = (value: unknown): CaixaCustosOperacionais => {
  const payload = asRecord(Array.isArray(value) ? value[0] : value);
  assertCustosOperacionaisPayload(payload);

  return {
    competencia: asString(payload.competencia),
    poloId: typeof payload.polo_id === 'string' ? payload.polo_id : null,
    custoCompetencia: asNumber(payload.custo_competencia),
    pagoCompetencia: asNumber(payload.pago_competencia),
    aPagar: asNumber(payload.a_pagar),
    vencido: asNumber(payload.vencido),
    custoRateadoCompetencia: asNumber(payload.custo_rateado_competencia),
    rateadoAPagar: asNumber(payload.rateado_a_pagar),
    lancamentosCompetencia: asNumber(payload.lancamentos_competencia),
    rateiosCompetencia: asNumber(payload.rateios_competencia),
    pontoEquilibrioStatus: 'PENDENTE_DE_MARGEM',
    observacao: asString(payload.observacao),
  };
};

export const mapCaixaPatrimonioResumo = (value: unknown): CaixaPatrimonioResumo => {
  const payload = asRecord(Array.isArray(value) ? value[0] : value);
  assertPatrimonioResumoPayload(payload);
  const posicao = asRecord(payload.posicao_fechamento);
  const aquisicoes = asRecord(payload.aquisicoes_competencia);
  const perdas = asRecord(payload.perdas_competencia);

  return {
    versao: 1,
    competencia: asString(payload.competencia),
    escopoTipo: payload.escopo_tipo === 'GLOBAL' ? 'GLOBAL' : 'POLO',
    poloId: typeof payload.polo_id === 'string' ? payload.polo_id : null,
    posicaoFechamento: {
      registrosAtivos: asNumber(posicao.registros_ativos),
      unidadesAtivas: asNumber(posicao.unidades_ativas),
      valorAtivoCusto: asString(posicao.valor_ativo_custo),
    },
    aquisicoesCompetencia: {
      registros: asNumber(aquisicoes.registros),
      unidades: asNumber(aquisicoes.unidades),
      valorCusto: asString(aquisicoes.valor_custo),
    },
    perdasCompetencia: {
      movimentos: asNumber(perdas.movimentos),
      unidades: asNumber(perdas.unidades),
      valorCusto: asString(perdas.valor_custo),
    },
    observacao: asString(payload.observacao),
  };
};

export const mapCaixaPosicaoLiquidaResumo = (value: unknown): CaixaPosicaoLiquidaResumo => {
  const payload = asRecord(Array.isArray(value) ? value[0] : value);
  assertPosicaoLiquidaResumoPayload(payload);

  return {
    versao: 1,
    competencia: asString(payload.competencia),
    escopoTipo: payload.escopo_tipo === 'GLOBAL' ? 'GLOBAL' : 'POLO',
    poloId: typeof payload.polo_id === 'string' ? payload.polo_id : null,
    valorPatrimonialCusto: asString(payload.valor_patrimonial_custo),
    saldoEmprestimosAPagar: asString(payload.saldo_emprestimos_a_pagar),
    valorLiquido: asString(payload.valor_liquido),
    observacao: asString(payload.observacao),
  };
};

export const mapCaixaPosicaoTotalResumo = (value: unknown): CaixaPosicaoTotalResumo => {
  const payload = asRecord(Array.isArray(value) ? value[0] : value);
  assertPosicaoTotalResumoPayload(payload);
  const base = {
    versao: 1 as const,
    competencia: asString(payload.competencia),
    dataCorte: asString(payload.data_corte),
    escopoTipo: payload.escopo_tipo === 'GLOBAL' ? 'GLOBAL' as const : 'POLO' as const,
    poloId: typeof payload.polo_id === 'string' ? payload.polo_id : null,
  };

  if (payload.disponivel === true) {
    const dados = asRecord(payload.dados);
    return {
      ...base,
      disponivel: true,
      dados: {
        saldoCaixaRegistrado: asString(dados.saldo_caixa_registrado),
        valorPatrimonialCusto: asString(dados.valor_patrimonial_custo),
        saldoEmprestimosAPagar: asString(dados.saldo_emprestimos_a_pagar),
        valorTotalLiquido: asString(dados.valor_total_liquido),
        observacao: asString(dados.observacao),
      },
    };
  }

  return {
    ...base,
    disponivel: false,
    motivo: payload.motivo === 'ACESSO_RESTRITO'
      ? 'ACESSO_RESTRITO'
      : 'HISTORICO_INSUFICIENTE',
    observacao: asString(payload.observacao),
  };
};
