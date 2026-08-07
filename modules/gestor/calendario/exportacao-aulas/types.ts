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
  /** Legado inline preservado para compatibilidade do compositor vetorial. */
  marcaDaguaDataUri: string | null;
  /** Fonte institucional da marca; pode ser um recurso inline ou URL CORS do Storage. */
  marcaDaguaUrl: string | null;
  marcaDaguaOpacidade: number | null;
  marcaDaguaEscala: number | null;
  marcaDaguaRotacionar: boolean | null;
  /** Legado inline preservado para compatibilidade do compositor vetorial. */
  logoDataUri: string | null;
  /** Cabeçalho institucional já autorizado e resolvido pela RPC. */
  cabecalhoInstitucional: CalendarioAulasCabecalhoInstitucional;
  arquivoNome: string;
  emitidoEm: string | null;
}

/**
 * Projeção de dados que espelha o cabeçalho institucional usado nos demais
 * documentos. A exportação apenas posiciona estes dados; ela não consulta
 * empresa ou polo diretamente no navegador.
 */
export interface CalendarioAulasCabecalhoInstitucional {
  nome: string;
  cnpj: string | null;
  contato: string | null;
  email: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  isMatriz: boolean;
  logoUrl: string | null;
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
  /** Nome do professor. O nome do campo permanece compatível com a RPC legada. */
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
  /** Primeiro dia do mês ativo da agenda, no formato ISO YYYY-MM-DD. */
  mesReferencia: string;
}

export interface CalendarioAulasPdfDocument {
  blob: Blob;
  fileName: string;
}
