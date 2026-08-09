export type StatusModeloPlanoCurso = 'RASCUNHO' | 'ATIVO' | 'EM_REVISAO' | 'ARQUIVADO';

export interface RotulosModeloPlanoCurso {
  componenteCurricular: string;
  docente: string;
  diasAulas: string;
  objetivosDisciplina: string;
  criteriosAvaliacao: string;
  insumosRecursos: string;
  conteudoProgramatico: string;
  dataLocal: string;
  assinaturaDocente: string;
}

export interface PaginacaoModeloPlanoCurso {
  encontrosPrimeiraPagina: number;
  encontrosDemaisPaginas: number;
}

export interface ConteudoModeloPlanoCurso {
  nomeModelo: string;
  titulo: string;
  subtitulo: string;
  orientacao: 'A4_RETRATO';
  exibirMarcaDagua: boolean;
  exibirAssinaturaDocente: boolean;
  instrucoesConteudo: string;
  rotulos: RotulosModeloPlanoCurso;
  paginacao: PaginacaoModeloPlanoCurso;
}

export interface ModeloPlanoCursoSeguro {
  templateKey: 'plano_curso';
  revisao: number;
  status: StatusModeloPlanoCurso;
  atualizadoEm: string | null;
  atualizadoPorNome: string | null;
  conteudo: ConteudoModeloPlanoCurso;
}

export interface SalvarModeloPlanoCursoInput {
  revisaoEsperada: number;
  conteudo: ConteudoModeloPlanoCurso;
  requestId: string;
}
