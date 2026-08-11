import type {
  CaixaFinanciamentoResumo,
  CaixaMonthlyStatement,
  CaixaPatrimonioResumo,
  CaixaPosicaoLiquidaResumo,
  CaixaPosicaoTotalDados,
} from '../caixa.service';

export type CaixaCompositionStatus =
  | 'COMPOSICAO_EXPLICITA'
  | 'SEM_DIFERENCA_FINANCEIRA'
  | 'NAO_DISCRIMINADA'
  | 'NAO_DISCRIMINADA_PELO_GATEWAY';

export interface CaixaReportInstitution {
  id: string | null;
  nome: string;
  cnpj: string;
  cidade: string;
  estado: string;
  endereco: string;
  numero: string;
  bairro: string;
  cep: string;
  telefone: string;
  email: string;
  logo_url: string | null;
  is_matriz: boolean;
  watermark_url: string | null;
  watermark_opacity: number;
  watermark_scale: number;
  watermark_rotate: boolean;
  landscape_watermark_url: string | null;
  landscape_watermark_opacity: number;
  landscape_watermark_scale: number;
  landscape_watermark_rotate: boolean;
}

export interface CaixaReportTotals {
  valorBase: number;
  jurosIdentificados: number;
  multaIdentificada: number;
  acrescimoIdentificado: number;
  descontoIdentificado: number;
  diferencaNaoDiscriminada: number;
  valorFinal: number;
  quantidade: number;
  quantidadeNaoDiscriminada: number;
}

interface CaixaReportMovementBase {
  id: string;
  dataPagamento: string;
  dataVencimento: string;
  descricao: string;
  polo: string;
  curso: string;
  turma: string;
  parcelaNumero: number | null;
  totalParcelas: number | null;
  formaPagamento: string;
  conta: string;
  valorBase: number;
  juros: number | null;
  multa: number | null;
  acrescimo: number | null;
  desconto: number | null;
  diferencaNaoDiscriminada: number;
  composicaoStatus: CaixaCompositionStatus;
}

export interface CaixaReportReceipt extends CaixaReportMovementBase {
  pagador: string;
  modalidade: string;
  tipoLancamento: string;
  valorRecebido: number;
}

export interface CaixaReportExpense extends CaixaReportMovementBase {
  origem: 'CONTA_PAGAR' | 'DESPESA_LANCAMENTO';
  fornecedor: string;
  categoria: string;
  valorPago: number;
}

export interface CaixaReportCourseSummaryItem {
  cursoId: string;
  curso: string;
  modalidade: string;
  previstoNoMes: number;
  recebidoNoMes: number;
  emAtraso: number;
  quantidadeParcelas: number;
  quantidadeRecebidas: number;
  quantidadeEmAtraso: number;
  quantidadeTurmas: number;
  quantidadeAlunos: number;
}

export interface CaixaReportCourseSummary {
  itens: CaixaReportCourseSummaryItem[];
  quantidadeCursos: number;
  quantidadeOmitidas: number;
  totais: {
    previstoNoMes: number;
    recebidoNoMes: number;
    emAtraso: number;
    quantidadeTurmas: number;
    quantidadeAlunos: number;
  };
}

export interface CaixaReportRecurringBreakdown {
  previstoNoMes: number;
  recebidoNoMes: number;
  emAtraso: number;
  valorBaseRecebido: number;
  juros: number;
  multa: number;
  acrescimo: number;
  desconto: number;
  diferencaNaoDiscriminada: number;
  quantidadeParcelas: number;
  quantidadeRecebidas: number;
  quantidadeEmAtraso: number;
  quantidadeCursos: number;
  quantidadeTurmas: number;
  quantidadeAlunos: number;
}

export interface CaixaReportRecurringModality extends CaixaReportRecurringBreakdown {
  modalidade: string;
  rotulo: string;
}

export interface CaixaReportRecurringClass extends CaixaReportRecurringBreakdown {
  turmaId: string;
  turma: string;
  cursoId: string;
  curso: string;
  modalidade: string;
}

export interface CaixaReportRecurringAnalysis {
  modalidades: CaixaReportRecurringModality[];
  turmas: CaixaReportRecurringClass[];
  totais: CaixaReportRecurringBreakdown;
}

/**
 * A posição complementar só expõe dados quando a RPC canônica correspondente
 * autorizou a leitura. Assim, a prestação operacional continua disponível a
 * quem possui Caixa, sem transformar uma falha de autorização em saldo zero.
 */
export type CaixaReportComplementaryPosition<T> =
  | {
    disponivel: true;
    dados: T;
  }
  | {
    disponivel: false;
    motivo: 'ACESSO_RESTRITO';
  };

/**
 * A posição total traz o mesmo valor composto da RPC do Caixa. A data de
 * corte acompanha o estado para que o PDF nunca pareça uma posição "de hoje"
 * quando a competência selecionada já foi encerrada.
 */
export type CaixaReportPosicaoTotal =
  | {
    disponivel: true;
    dataCorte: string;
    dados: CaixaPosicaoTotalDados;
  }
  | {
    disponivel: false;
    dataCorte: string;
    motivo: 'ACESSO_RESTRITO' | 'HISTORICO_INSUFICIENTE';
    observacao: string;
  };

export interface CaixaDetailedReport {
  versao: 6;
  geradoEm: string;
  completo: boolean;
  confidencial: boolean;
  limitePorTabela: number;
  limiteTotal: number;
  institucional: CaixaReportInstitution;
  resumo: CaixaMonthlyStatement;
  totaisRecebimentos: CaixaReportTotals;
  totaisDespesas: CaixaReportTotals;
  financiamento: CaixaReportComplementaryPosition<CaixaFinanciamentoResumo>;
  patrimonio: CaixaReportComplementaryPosition<CaixaPatrimonioResumo>;
  posicaoLiquida: CaixaReportComplementaryPosition<CaixaPosicaoLiquidaResumo>;
  posicaoTotal: CaixaReportPosicaoTotal;
  resumoCursos: CaixaReportCourseSummary;
  analiseRecorrente: CaixaReportRecurringAnalysis;
  recebimentos: CaixaReportReceipt[];
  despesas: CaixaReportExpense[];
}
