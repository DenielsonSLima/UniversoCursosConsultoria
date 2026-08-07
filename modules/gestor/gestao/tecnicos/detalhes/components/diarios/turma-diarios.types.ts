export type DiarioExportMode = 'PREENCHIDO' | 'EM_BRANCO';

export interface TurmaDiarioRpcRow {
  modulo_id: string;
  modulo_nome: string;
  periodo_status: string;
  disciplina_id: string;
  disciplina_nome: string;
  professor_nome: string;
  carga_horaria: number | string;
  horas_realizadas: number | string;
  progresso_percent: number | string;
  horas_status: 'EXATA' | 'EXCESSO' | 'PENDENTE';
  concluida: boolean;
  primeira_aula: string | null;
  ultima_aula: string | null;
  presenca_geral_percent: number | string | null;
}

export interface TurmaDiarioDisciplina {
  id: string;
  nome: string;
  professor: string;
  horasRealizadas: number;
  cargaHoraria: number;
  progressoPercent: number;
  horasStatus: 'EXATA' | 'EXCESSO' | 'PENDENTE';
  periodoStatus: string;
  concluida: boolean;
  primeiraAula: string | null;
  ultimaAula: string | null;
  presencaGeralPercent: number | null;
  bloqueioDiario: 'ABERTO' | 'PROFESSOR' | 'TOTAL';
}

export interface TurmaDiarioModulo {
  id: string;
  nome: string;
  disciplinas: TurmaDiarioDisciplina[];
}

export interface TurmaDiarioSelection {
  disciplina: TurmaDiarioDisciplina;
  moduloNome: string;
  exportMode?: DiarioExportMode;
}
