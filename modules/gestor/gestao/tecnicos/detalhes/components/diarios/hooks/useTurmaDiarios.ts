import { useQuery } from '@tanstack/react-query';
import { turmaDiariosService } from '../turma-diarios.service';
import { historicalDiaryCardsKey } from '../historico/diario-historico.presentation';
import { useDiarioSessionIdentity } from './useDiarioSessionIdentity';

export const useTurmaDiarios = (turmaId: string, contextId = '', poloId = '') => {
  const { actorId, ready } = useDiarioSessionIdentity();
  return useQuery({
    queryKey: historicalDiaryCardsKey(turmaId, actorId || '', contextId, poloId),
    queryFn: () => {
      if (!actorId) throw new Error('A sessão precisa ser confirmada para consultar os diários.');
      return turmaDiariosService.getByTurma(turmaId);
    },
    enabled: ready && Boolean(turmaId),
    staleTime: 60_000,
    refetchOnMount: 'always',
    retry: false,
  });
};
