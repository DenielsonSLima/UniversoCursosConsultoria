import type { DiarioGradeResult } from './diario-classe.types';

export const EMPTY_DIARIO_GRADE: DiarioGradeResult = {
  p: null,
  ti: null,
  tg: null,
  s: null,
  cq: null,
  o: null,
  rec: null,
  total_aulas: 0,
  total_faltas: 0,
  frequencia_percent: null,
  media_parcial: null,
  media_final: null,
  resultado_final: 'SEM_LANCAMENTO',
};

export const EMPTY_DIARIO_ROWS: never[] = [];
