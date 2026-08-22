export type CursoLivreTentativaStatus = 'EM_ANDAMENTO' | 'APROVADA' | 'REPROVADA';

export interface CursoLivreAvaliacaoResumoAluno {
  id: string;
  versao: number;
  titulo: string;
  notaMinimaPercentual: number;
  quantidadeSorteada: number;
}

export interface CursoLivreLiberacaoAluno {
  liberada: boolean;
  podeIniciar: boolean;
  liberadaEm: string | null;
  novaTentativaEm: string | null;
  motivo: string | null;
}

export interface CursoLivreQuestaoTentativaAluno {
  id: string;
  ordem: number;
  enunciado: string;
  opcoes: string[];
}

export interface CursoLivreTentativaAluno {
  id: string;
  status: CursoLivreTentativaStatus;
  iniciadaEm: string | null;
  enviadaEm: string | null;
  notaPercentual: number | null;
  acertos: number | null;
  total: number | null;
  questoes: CursoLivreQuestaoTentativaAluno[];
}

export interface CursoLivreCertificadoAluno {
  id: string;
  status: string;
  codigoValidacao: string | null;
}

export interface CursoLivreAvaliacaoAlunoWorkspace {
  matriculaId: string;
  turmaId: string;
  cursoId: string;
  avaliacao: CursoLivreAvaliacaoResumoAluno | null;
  liberacao: CursoLivreLiberacaoAluno;
  tentativa: CursoLivreTentativaAluno | null;
  certificado: CursoLivreCertificadoAluno | null;
  replayed?: boolean;
}

export interface IniciarTentativaCursoLivreInput {
  requestId: string;
  matriculaId: string;
}

export interface EntregarTentativaCursoLivreInput {
  requestId: string;
  tentativaId: string;
  respostas: Record<string, number>;
}
