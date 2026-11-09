import { useQuery } from '@tanstack/react-query';
import { diarioClasseKeys } from '../diario-classe.keys';
import { getDiarioExtraClasseCredito } from '../diario-extra-classe.service';

export const useDiarioExtraClasseCredito = (turmaId: string, disciplinaId: string) => useQuery({
  queryKey: diarioClasseKeys.extraClassCredit(turmaId, disciplinaId),
  queryFn: ({ signal }) => getDiarioExtraClasseCredito(turmaId, disciplinaId, signal),
  enabled: Boolean(turmaId && disciplinaId),
  staleTime: 0,
  refetchOnMount: 'always',
});
