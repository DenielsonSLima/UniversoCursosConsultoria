export type MatriculaTecnicaCicloManualEstado =
  | "ELEGIVEL"
  | "BLOQUEADO"
  | "JA_GERADO"
  | "PROTEGIDO_EXISTENTE"
  | "CICLOS_CONCLUIDOS"
  | "NAO_HABILITADO";

export type MatriculaTecnicaCicloManualCriterio =
  | "QUITACAO_TOTAL"
  | "PENULTIMA_SEM_ATRASO";

export interface MatriculaTecnicaCicloManual {
  habilitado: boolean;
  modo: "MANUAL" | null;
  cicloBaseHistorico: number | null;
  cicloMaximo: number | null;
  proximoCicloNumero: number | null;
  primeiroVencimentoSugerido: string | null;
  criterioElegibilidade: MatriculaTecnicaCicloManualCriterio | null;
  estado: MatriculaTecnicaCicloManualEstado;
  podeGerar: boolean;
  bloqueio: {
    codigo: string;
    mensagem: string;
  } | null;
  politica: {
    revisao: number;
    fingerprint: string;
  } | null;
  cicloGerado: {
    numero: number;
    status: string;
    quantidadeItens: number;
    total: string;
    emitidosBanese: number;
    pendentesEmissao: number;
    emRevisao: number;
  } | null;
}

export interface CicloFinanceiroTecnicoManualPreviewItem {
  chave: string;
  tipo: "MATRICULA" | "REMATRICULA" | "PARCELA";
  numero: number;
  descricao: string;
  valor: string;
  vencimento: string;
  detalhesBoleto: {
    valorNominal: string;
    valorEmDia: string;
    desconto: {
      valor: string;
      validoAte: string;
    } | null;
    multa: {
      percentual: string;
      valor: string;
      iniciaEm: string;
    } | null;
    juros: {
      percentualMes: string;
      valorDia: string;
      iniciaEm: string;
    } | null;
    instrucaoBoleto: string;
    mensagensBoleto: string[];
  };
}

export interface CicloFinanceiroTecnicoManualTermos {
  descontoPontualidade: string;
  jurosAtrasoPercentual: string;
  multaAtrasoPercentual: string;
  instrucaoBoleto: string;
  aplicacao: {
    matricula: { desconto: boolean; multaJuros: boolean };
    mensalidade: { desconto: boolean; multaJuros: boolean };
    rematricula: { desconto: boolean; multaJuros: boolean };
  };
}

export interface CicloFinanceiroTecnicoManualPreview {
  cicloNumero: number;
  sourceVencimento: "TURMA" | "INDIVIDUAL";
  dataOrigem: string;
  primeiroVencimento: string;
  quantidadeItens: number;
  total: string;
  itens: CicloFinanceiroTecnicoManualPreviewItem[];
  termos: CicloFinanceiroTecnicoManualTermos;
  regraEfetivaFingerprint: string;
  politicaFingerprint: string;
  cronogramaFingerprint: string;
}

export interface PreviewCicloFinanceiroTecnicoManualInput {
  matriculaId: string;
  cicloNumero: number;
  primeiroVencimento: string | null;
}

export interface PreviewCicloFinanceiroTecnicoManualResult {
  matriculaId: string;
  turmaId: string;
  cicloManual: MatriculaTecnicaCicloManual;
  preview: CicloFinanceiroTecnicoManualPreview;
}

export interface GerarCicloFinanceiroTecnicoManualInput {
  turmaId: string;
  matriculaId: string;
  cicloNumero: number;
  primeiroVencimento: string | null;
  requestId: string;
  expectedRegraFingerprint: string;
  expectedPoliticaFingerprint: string;
  expectedCronogramaFingerprint: string;
}

export interface RetomarEmissaoCicloFinanceiroTecnicoManualInput {
  turmaId: string;
  matriculaId: string;
  cicloNumero: number;
}

export interface CicloFinanceiroTecnicoManualEmissaoProgress {
  cicloNumero: number;
  quantidadeItens: number;
  emitidosBanese: number;
  pendentesEmissao: number;
  emRevisao: number;
}

export interface CicloFinanceiroTecnicoManualRecebivel {
  id: string;
  chave: string;
  tipo: "MATRICULA" | "REMATRICULA" | "PARCELA";
  numero: number;
  descricao: string;
  valor: string;
  vencimento: string;
  status: "PENDENTE" | "VENCIDO";
  emissaoBanese: "EMITIDO";
}

export interface GerarCicloFinanceiroTecnicoManualResult {
  success: true;
  requestId: string;
  replayed: boolean;
  ciclo: {
    numero: number;
    status: "EMITIDO_BANESE";
    quantidadeItens: number;
    total: string;
    emitidosBanese: number;
    pendentesEmissao: number;
    emRevisao: number;
    recebiveis: CicloFinanceiroTecnicoManualRecebivel[];
  };
  cicloManual: MatriculaTecnicaCicloManual;
}
