import type { TurmaAulaPlanejada } from '../../turma-grade.types';
import { isAcademicClassContentPending } from '../../../../../../../lib/academicClassMeetings.ts';

const formatDate = (value?: string) => value
  ? value.split('-').reverse().join('/') : 'Data não informada';

export const getAulaOrigemOptions = (aulas: readonly TurmaAulaPlanejada[]) => aulas.map((aula, index) => ({
  value: aula.id,
  label: `Aula ${index + 1} • ${formatDate(aula.dataAula)} • ${isAcademicClassContentPending(aula.titulo) ? 'Conteúdo a preencher' : aula.titulo}`,
}));

export const resolveAulaOrigem = (aulas: readonly TurmaAulaPlanejada[], aulaOrigemId?: string | null) => {
  const index = aulas.findIndex((aula) => aula.id === aulaOrigemId
    || aula.sessoes.some((sessao) => sessao.id === aulaOrigemId));
  return index < 0 ? null : {
    aula: aulas[index], index,
    label: `Complemento da Aula ${index + 1} • ${formatDate(aulas[index].dataAula)}`,
  };
};
