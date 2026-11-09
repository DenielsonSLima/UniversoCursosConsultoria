import type { TurmaAtividadeExtraClasse, TurmaAulaPlanejada } from '../../turma-grade.types';

type PlanejamentoItem =
  | { tipo: 'aula'; aula: TurmaAulaPlanejada; index: number; data: string }
  | { tipo: 'atividade'; atividade: TurmaAtividadeExtraClasse; index: number; data: string };

// Datas do planejamento são dias civis (YYYY-MM-DD), sem conversão de fuso.
const chronologicalDate = (value?: string | null): string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '9999-99-99';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value : '9999-99-99';
};

export const buildGradeChronology = (
  aulas: readonly TurmaAulaPlanejada[],
  atividades: readonly TurmaAtividadeExtraClasse[],
): PlanejamentoItem[] => {
  const items: PlanejamentoItem[] = [
    ...aulas.map((aula, index) => ({
      tipo: 'aula' as const, aula, index, data: chronologicalDate(aula.dataAula),
    })),
    ...atividades.filter((atividade) => atividade.status !== 'ARQUIVADA').map((atividade, index) => ({
      tipo: 'atividade' as const, atividade, index, data: chronologicalDate(atividade.prazoEntrega),
    })),
  ];
  // A ordenação estável preserva numeração e ordem de origem em datas iguais.
  return items.sort((left, right) => left.data.localeCompare(right.data));
};
