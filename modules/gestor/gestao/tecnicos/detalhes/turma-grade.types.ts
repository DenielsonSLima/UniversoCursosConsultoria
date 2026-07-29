import { Curso } from '../../../cadastros/cadastros.types';

export interface TurmaDisciplinaConfig {
  professor: string | null;
  professorId?: string | null;
  concluida: boolean;
}

export interface TurmaProfessorOption {
  id: string;
  nome: string;
}

export interface TurmaAulaPlanejada {
  id: string;
  titulo: string;
  cargaHoraria: number;
  dataAula?: string;
  sessoes: TurmaAulaSessao[];
}

export type TurmaAulaPeriodo = 'M' | 'T' | 'N' | 'U';

export interface TurmaAulaSessao {
  id: string;
  periodo: TurmaAulaPeriodo;
  cargaHoraria: number;
}

export interface TurmaAtividadeExtraClasse {
  id: string;
  titulo: string;
  tema?: string | null;
  cargaHoraria: number;
  prazoEntrega?: string | null;
  status: string;
}

export interface TurmaGradeData {
  cursoBase: Curso | null;
  disciplinasConfig: Record<string, TurmaDisciplinaConfig>;
  aulas: Record<string, TurmaAulaPlanejada[]>;
  atividadesExtraClasse: Record<string, TurmaAtividadeExtraClasse[]>;
  professores: TurmaProfessorOption[];
  metricasGrade: any[];
}

export interface TurmaAulaInput {
  disciplinaId: string;
  titulo: string;
  horas: number;
  dataAula: string;
}

export interface TurmaAulaUpdateInput {
  aulaId: string;
  disciplinaId: string;
  horas: number;
  dataAula: string;
}

export interface TurmaAtividadeExtraClasseInput {
  disciplinaId: string;
  titulo: string;
  horas: number;
  prazoEntrega?: string | null;
  texto?: string | null;
  videoUrl?: string | null;
  perguntas?: { pergunta: string }[];
  criadoPorTipo?: 'GESTOR' | 'PROFESSOR';
  criadoPorId?: string | null;
  status?: 'RASCUNHO' | 'PUBLICADA';
}
