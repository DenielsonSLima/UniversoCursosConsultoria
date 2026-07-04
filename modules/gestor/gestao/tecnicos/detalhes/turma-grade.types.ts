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
}

export interface TurmaGradeData {
  cursoBase: Curso | null;
  disciplinasConfig: Record<string, TurmaDisciplinaConfig>;
  aulas: Record<string, TurmaAulaPlanejada[]>;
  professores: TurmaProfessorOption[];
  metricasGrade: any[];
}

export interface TurmaAulaInput {
  disciplinaId: string;
  titulo: string;
  horas: number;
  dataAula: string;
}
