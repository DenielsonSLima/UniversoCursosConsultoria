export type AvaliacaoCursoLivreStatus = 'RASCUNHO' | 'PUBLICADA';

export interface QuestaoCursoLivreGestao {
  id?: string;
  enunciado: string;
  opcoes: string[];
  respostaCorreta: number;
  ativa: boolean;
}

export interface AvaliacaoCursoLivreGestao {
  id: string;
  cursoId: string;
  versao: number;
  revisao: number;
  status: AvaliacaoCursoLivreStatus;
  titulo: string;
  notaMinimaPercentual: number;
  quantidadeSorteada: number;
  minimoBanco: number;
  intervaloNovaTentativaHoras: number;
  publicadaEm: string | null;
  questoes: QuestaoCursoLivreGestao[];
}

export interface AvaliacaoCursoLivreGestaoWorkspace {
  cursoId: string;
  avaliacao: AvaliacaoCursoLivreGestao | null;
  replayed?: boolean;
}

export interface AvaliacaoCursoLivreConfigInput {
  titulo: string;
  notaMinimaPercentual: number;
  intervaloNovaTentativaHoras: number;
}

export interface SalvarAvaliacaoCursoLivreInput {
  requestId: string;
  cursoId: string;
  avaliacaoId: string | null;
  expectedRevisao: number | null;
  publicar: boolean;
  config: AvaliacaoCursoLivreConfigInput;
  questoes: QuestaoCursoLivreGestao[];
}

export interface AvaliacaoCursoLivreDraft {
  titulo: string;
  notaMinimaPercentual: number;
  intervaloNovaTentativaHoras: number;
  questoes: QuestaoCursoLivreGestao[];
}
