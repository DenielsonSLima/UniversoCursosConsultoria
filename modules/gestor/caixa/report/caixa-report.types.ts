import type { CaixaMonthlyStatement } from '../caixa.service';

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

export interface CaixaReportClassSummaryItem {
  turmaId: string | null;
  turma: string;
  curso: string;
  modalidade: string;
  previstoNoMes: number;
  recebidoNoMes: number;
  emAtraso: number;
  quantidadeParcelas: number;
  quantidadeRecebidas: number;
  quantidadeEmAtraso: number;
  agregado: boolean;
  quantidadeTurmas: number;
}

export interface CaixaReportClassSummary {
  itens: CaixaReportClassSummaryItem[];
  quantidadeTurmas: number;
  quantidadeOmitidas: number;
  totais: {
    previstoNoMes: number;
    recebidoNoMes: number;
    emAtraso: number;
  };
}

export interface CaixaDetailedReport {
  versao: number;
  geradoEm: string;
  completo: boolean;
  confidencial: boolean;
  limitePorTabela: number;
  limiteTotal: number;
  institucional: CaixaReportInstitution;
  resumo: CaixaMonthlyStatement;
  totaisRecebimentos: CaixaReportTotals;
  totaisDespesas: CaixaReportTotals;
  resumoTurmas: CaixaReportClassSummary;
  recebimentos: CaixaReportReceipt[];
  despesas: CaixaReportExpense[];
}
