export type DiarioExportMode = 'PREENCHIDO' | 'EM_BRANCO';

export interface TurmaDiarioHistoricoResumo {
  id: string;
  origem: 'DOCX_HISTORICO';
  sourceName: string;
  readOnly: true;
  estado: 'EM_CONFERENCIA';
  aulasDocumentadas: number;
  horasDocumentadas: number | null;
  horasOficiais: number;
  horasEstado: 'CONFERIDO' | 'EM_CONFERENCIA';
  datasEstado: 'CONFERIDO' | 'EM_CONFERENCIA';
  primeiraAula: string | null;
  ultimaAula: string | null;
  frequenciasRegistradas: number;
  frequenciasConferidas: number;
}

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
  historico?: TurmaDiarioHistoricoResumo | null;
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
  historico?: TurmaDiarioHistoricoResumo | null;
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
