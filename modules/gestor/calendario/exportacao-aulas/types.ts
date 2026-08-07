/**
 * Tipos do exportador de calendário de aulas.
 *
 * A fonte de verdade é o payload preparado pelas RPCs. Estes tipos não
 * descrevem nem executam regras de montagem de grade no navegador.
 */
export const CALENDARIO_AULAS_MODALIDADES = [
  { value: 'TECNICO', label: 'Técnico' },
  { value: 'LIVRE', label: 'Livre' },
  { value: 'SUPERIOR', label: 'Especialização' },
  { value: 'EAD', label: 'EAD' },
] as const;

export type CalendarioAulasModalidade =
  (typeof CALENDARIO_AULAS_MODALIDADES)[number]['value'];

export type CalendarioAulasExportacaoStatus =
  | 'PRONTO'
  | 'SEM_GRADE'
  | 'EAD_SEM_GRADE';

/** Turma elegível, já filtrada e autorizada pela RPC para o polo/modalidade. */
export interface CalendarioAulasTurma {
  turmaId: string;
  turmaNome: string;
  turmaCodigo: string | null;
  cursoNome: string | null;
  modalidade: CalendarioAulasModalidade;
}

/**
 * Metadados visuais já resolvidos pelo servidor a partir do modelo ativo e
 * do polo. O renderer apenas posiciona estes textos no documento.
 */
export interface CalendarioAulasDocumento {
  titulo: string;
  /** Texto do modelo já resolvido pela RPC, inclusive as variáveis. */
  subtitulo: string;
  rodape: string;
  instituicao: string;
  polo: string;
  curso: string;
  turma: string;
  modulo: string | null;
  exibirMarcaDagua: boolean;
  exibirModulo: boolean;
  cabecalhosTabela: CalendarioAulasCabecalhosTabela;
  marcaDaguaTexto: string | null;
  /** Dados já saneados pela RPC; nunca exigem fetch no navegador. */
  marcaDaguaDataUri: string | null;
  marcaDaguaOpacidade: number | null;
  /** Dados já saneados pela RPC; logo HTTP externo não é carregado no client. */
  logoDataUri: string | null;
  arquivoNome: string;
  emitidoEm: string | null;
}

/** Rótulos da revisão ativa do modelo, já autorizados e resolvidos no RPC. */
export interface CalendarioAulasCabecalhosTabela {
  componente: string;
  data: string;
  horario: string;
  professorObservacao: string;
}

/** Linha pronta para impressão; nenhuma data ou horário é inferido no client. */
export interface CalendarioAulasLinha {
  componenteCurricular: string;
  dataExibicao: string;
  horarioExibicao: string;
  professoresObservacao: string;
}

export interface CalendarioAulasExportacaoPayload {
  status: CalendarioAulasExportacaoStatus;
  mensagem: string | null;
  documento: CalendarioAulasDocumento | null;
  linhas: CalendarioAulasLinha[];
}

export interface PrepararCalendarioAulasExportacaoInput {
  poloId: string;
  modalidade: CalendarioAulasModalidade;
  turmaId: string;
}

export interface CalendarioAulasPdfDocument {
  blob: Blob;
  fileName: string;
}
