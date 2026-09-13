export type CaixaResultStatus = 'POSITIVO' | 'NEGATIVO' | 'NEUTRO';
export type CaixaScopeType = 'GLOBAL' | 'POLO';
export type CaixaAccountValueType = 'SALDO_CONTA' | 'POSICAO_POLO';

export interface CaixaMonthlyStatement {
  versao: number;
  meta: {
    competencia: string;
    periodoInicio: string;
    periodoFimExclusivo: string;
    geradoEm: string;
    escopoTipo: CaixaScopeType;
    poloId: string | null;
    escopoRotulo: string;
    fonteSaldo: 'CONTABIL_SISTEMA';
    extratoBancarioDisponivel: boolean;
  };
  saldosHoje: {
    registradoTotal: number;
    bancarioRegistrado: number;
    caixaLocal: number;
    compartilhadoTotal: number;
    posicaoCompartilhadaEscopo: number;
    naoAtribuido: number;
  };
  resumoCompetencia: {
    entradasRecebidasBrutas: number;
    tarifasBancariasConfirmadas: number;
    saidasPagas: number;
    resultado: number;
    resultadoStatus: CaixaResultStatus;
    quantidadeRecebimentos: number;
    quantidadePagamentos: number;
  };
  compromissos: {
    aReceber: number;
    receberVencido: number;
    margemInadimplencia: number;
    inadimplenciaMensal: {
      periodoInicio: string;
      periodoFimExclusivo: string;
      dataCorte: string;
      baseElegivel: number;
      quantidadeElegiveis: number;
      quantidadeEmConferencia: number;
      valorNominalEmConferencia: number;
      completo: boolean;
      criterio: 'VENCIMENTO_MENSAL_POSICAO_NO_CORTE';
    };
    aPagar: number;
    pagarVencido: number;
  };
  receitasPorModalidade: Array<{
    codigo: string;
    rotulo: string;
    valor: number;
    quantidade: number;
    percentual: number;
  }>;
  despesasPorCategoria: Array<{
    codigo: string;
    rotulo: string;
    valor: number;
    quantidade: number;
    percentual: number;
  }>;
  serieMensal: Array<{
    competencia: string;
    rotulo: string;
    entradas: number;
    saidas: number;
    resultado: number;
    resultadoStatus: CaixaResultStatus;
    entradasEscalaPercentual: number;
    saidasEscalaPercentual: number;
    inadimplencia: number;
    inadimplenciaEscalaPercentual: number;
    inadimplenciaQuantidadeEmConferencia: number;
    inadimplenciaCompleto: boolean;
    resultadoPosicaoPercentual: number;
    inadimplenciaPosicaoPercentual: number;
    graficoZeroPosicaoPercentual: number;
  }>;
  contas: Array<{
    id: string;
    banco: string;
    agencia: string;
    conta: string;
    titular: string;
    cidadeUf: string;
    natureza: 'BANCARIA' | 'CAIXA_INTERNO';
    compartilhada: boolean;
    unidadesUso: number;
    valorExibido: number;
    tipoValorExibido: CaixaAccountValueType;
    saldoTotalRegistrado: number;
    posicaoGerencialEscopo: number;
    ativo: boolean;
    codigoInterno: string;
  }>;
  classificacao: {
    quantidadeSemPolo: number;
    valorSemPolo: number;
  };
  conciliacao: {
    recebimentosConciliados: number;
    pagamentosConciliados: number;
    pendentes: number;
    ultimaAtualizacao: string | null;
  };
  qualidadeDados: {
    movimentosSemPolo: number;
    pagamentosSemConta: number;
    pagamentosSemData: number;
    receitasSemModalidade: number;
    tarifasEstimadasIgnoradas: number;
  };
}

/**
 * Leitura canônica do financiamento no Caixa.
 *
 * Os valores são calculados e devolvidos pela RPC. Esta camada não deriva
 * saldos, cobertura nem rateios no navegador.
 */
export interface CaixaFinanciamentoResumo {
  competencia: string;
  creditoLiberadoMatriz: number;
  obrigacaoRateada: number;
  principalRateado: number;
  encargosRateados: number;
  pagoRateado: number;
  observacao: string | null;
}

/**
 * Leitura econômica por polo. Diferente do extrato físico: distribui uma
 * conta rateada entre as unidades sem multiplicar banco, pagamento ou saldo.
 */
export interface CaixaCustosOperacionais {
  competencia: string;
  poloId: string | null;
  custoCompetencia: number;
  pagoCompetencia: number;
  aPagar: number;
  vencido: number;
  custoRateadoCompetencia: number;
  rateadoAPagar: number;
  lancamentosCompetencia: number;
  rateiosCompetencia: number;
  pontoEquilibrioStatus: 'PENDENTE_DE_MARGEM';
  observacao: string;
}

/**
 * Posição patrimonial canônica por competência. Os valores monetários
 * permanecem como texto decimal para preservar os centavos devolvidos pela
 * RPC mesmo acima do limite seguro de `number` no JavaScript.
 */
export interface CaixaPatrimonioResumo {
  versao: 1;
  competencia: string;
  escopoTipo: CaixaScopeType;
  poloId: string | null;
  posicaoFechamento: {
    registrosAtivos: number;
    unidadesAtivas: number;
    valorAtivoCusto: string;
  };
  aquisicoesCompetencia: {
    registros: number;
    unidades: number;
    valorCusto: string;
  };
  perdasCompetencia: {
    movimentos: number;
    unidades: number;
    valorCusto: string;
  };
  observacao: string;
}

/**
 * Resultado canônico de patrimônio a custo menos saldo de empréstimos ainda
 * devido no fechamento. Valores monetários são texto decimal para manter os
 * centavos exatos, inclusive quando o resultado é negativo.
 */
export interface CaixaPosicaoLiquidaResumo {
  versao: 1;
  competencia: string;
  escopoTipo: CaixaScopeType;
  poloId: string | null;
  valorPatrimonialCusto: string;
  saldoEmprestimosAPagar: string;
  valorLiquido: string;
  observacao: string;
}

/**
 * A posição total registrada combina três posições canônicas no mesmo corte:
 * caixa, patrimônio a custo e empréstimos a pagar. Os valores continuam como
 * texto decimal, pois esse contrato nunca deve ser recomposto pelo cliente.
 */
export interface CaixaPosicaoTotalDados {
  saldoCaixaRegistrado: string;
  valorPatrimonialCusto: string;
  saldoEmprestimosAPagar: string;
  valorTotalLiquido: string;
  observacao: string;
}

interface CaixaPosicaoTotalResumoBase {
  versao: 1;
  competencia: string;
  dataCorte: string;
  escopoTipo: CaixaScopeType;
  poloId: string | null;
}

export type CaixaPosicaoTotalResumo =
  | (CaixaPosicaoTotalResumoBase & {
    disponivel: true;
    dados: CaixaPosicaoTotalDados;
  })
  | (CaixaPosicaoTotalResumoBase & {
    disponivel: false;
    motivo: 'ACESSO_RESTRITO' | 'HISTORICO_INSUFICIENTE';
    observacao: string;
  });
