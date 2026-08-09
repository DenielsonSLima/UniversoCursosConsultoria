export type PlanoCursoStatus = 'AUSENTE' | 'RASCUNHO' | 'CONCLUIDO';

export interface PlanoCursoProfessorResumo {
  planoId: string | null;
  status: PlanoCursoStatus;
  revisao: number;
  turmaId: string;
  disciplinaId: string;
  professorId: string;
  turmaNome: string;
  turmaCodigo: string;
  cursoNome: string;
  poloId: string;
  poloNome: string;
  disciplinaNome: string;
  professorNome: string;
  totalDias: number;
  totalAulas: number;
  primeiraAula: string | null;
  ultimaAula: string | null;
  updatedAt: string | null;
  templateRevision: number | null;
  documentoFingerprint: string | null;
}

export interface PlanoCursoAula {
  aulaId: string;
  dataAula: string;
  dataExibicao: string;
  sessao: string;
  titulo: string;
  cargaHoraria: number;
  horaInicio: string | null;
  horaFim: string | null;
  conteudo: string;
}

export interface PlanoCursoWorkspace extends PlanoCursoProfessorResumo {
  diasAulas: string[];
  objetivos: string[];
  criteriosAvaliacao: string[];
  insumosRecursos: string[];
  aulas: PlanoCursoAula[];
  concluidoEm: string | null;
  canEdit: boolean;
}

export interface PlanoCursoGestaoStatus {
  disciplinaId: string;
  professorId: string | null;
  professorNome: string | null;
  planoId: string | null;
  status: PlanoCursoStatus;
  revisao: number;
  updatedAt: string | null;
  templateRevision: number | null;
  documentoFingerprint: string | null;
}

export interface PlanoCursoSaveInput {
  turmaId: string;
  disciplinaId: string;
  expectedRevision: number;
  objetivos: string[];
  criteriosAvaliacao: string[];
  insumosRecursos: string[];
  conteudosAulas: Array<{
    aulaId: string;
    conteudo: string;
  }>;
}

export interface PlanoCursoConclusaoInput {
  planoId: string;
  turmaId: string;
  disciplinaId: string;
  expectedRevision: number;
}

export interface PlanoCursoDocumentoInstituicao {
  poloId: string;
  nome: string;
  razaoSocial: string;
  cnpj: string;
  endereco: string;
  cidade: string;
  uf: string;
  logoUrl: string | null;
  logoDataUri: string | null;
}

export interface PlanoCursoDocumentoMarcaDagua {
  exibir: boolean;
  texto: string;
  url: string | null;
  dataUri: string | null;
  opacidade: number;
  escala: number;
  rotacionar: boolean;
}

export interface PlanoCursoDocumentoComponente {
  turmaId: string;
  turmaNome: string;
  turmaCodigo: string;
  cursoNome: string;
  disciplinaId: string;
  disciplinaNome: string;
}

export interface PlanoCursoDocumentoDocente {
  id: string;
  nome: string;
  assinatura: {
    exibir: boolean;
    path: string | null;
    url: string | null;
  };
}

export interface PlanoCursoDocumentoLocalData {
  cidade: string;
  uf: string;
  dataISO: string;
  dataExibicao: string;
  texto: string;
}

export interface PlanoCursoDocumentoCabecalho {
  titulo: string;
  subtitulo: string;
  instituicao: string;
  logoUrl: string | null;
  logoDataUri: string | null;
}

export interface PlanoCursoDocumentoPagina {
  numero: number;
  tipo: 'IDENTIFICACAO' | 'CONTEUDO';
  encontros: PlanoCursoAula[];
}

export interface PlanoCursoDocumentoRotulos {
  curso: string;
  turma: string;
  componenteCurricular: string;
  docente: string;
  diasAulas: string;
  objetivos: string;
  objetivosDisciplina: string;
  criteriosAvaliacao: string;
  insumosRecursos: string;
  conteudoProgramatico: string;
  dataLocal: string;
  assinaturaDocente: string;
}

export interface PlanoCursoDocumentoPayload {
  arquivoNome: string;
  titulo: string;
  subtitulo: string;
  orientacao: 'A4_RETRATO';
  templateRevision: number;
  template: Record<string, unknown> | null;
  cabecalho: PlanoCursoDocumentoCabecalho;
  rotulos: PlanoCursoDocumentoRotulos;
  instrucoesConteudo: string;
  instituicao: PlanoCursoDocumentoInstituicao;
  marcaDagua: PlanoCursoDocumentoMarcaDagua;
  componente: PlanoCursoDocumentoComponente;
  docente: PlanoCursoDocumentoDocente;
  diasAulas: string[];
  totalDias: number;
  totalAulas: number;
  objetivos: string[];
  criteriosAvaliacao: string[];
  insumosRecursos: string[];
  localData: PlanoCursoDocumentoLocalData;
  paginas: PlanoCursoDocumentoPagina[];
  totalPaginas: number;
  emitidoEm: string;
}

export interface PlanoCursoDocumentoResponse {
  status: 'CONCLUIDO';
  planoId: string;
  revisao: number;
  templateRevision: number;
  documentoFingerprint: string;
  documento: PlanoCursoDocumentoPayload;
}
