import { useQuery } from '@tanstack/react-query';
import { academicLifecycleKeys } from '../../../academic-lifecycle.keys';
import { turmaDiariosService } from '../turma-diarios.service';

export const useTurmaDiarios = (turmaId: string) => useQuery({
  queryKey: [...academicLifecycleKeys.diarios(turmaId), 'canonical-cards-v4'],
  queryFn: () => turmaDiariosService.getByTurma(turmaId),
  enabled: Boolean(turmaId),
});
