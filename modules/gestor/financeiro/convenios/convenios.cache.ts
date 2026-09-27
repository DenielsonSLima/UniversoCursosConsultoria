import type { QueryClient } from '@tanstack/react-query';
import { caixaQueryKeys } from '../../caixa/caixa.service';
import { financeiroQueryKeys } from '../financeiro.queryKeys';
import { conveniosQueryKeys } from './convenios.queryKeys';

export const invalidateConveniosScope = async (
  queryClient: QueryClient,
  poloId: string,
  competenciaId?: string | null,
) => {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: conveniosQueryKeys.listForPolo(poloId) }),
    queryClient.invalidateQueries({ queryKey: conveniosQueryKeys.openOptions(poloId) }),
    queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
    queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpisByPolo(poloId) }),
    queryClient.invalidateQueries({ queryKey: caixaQueryKeys.statementsForPolo(poloId) }),
  ];

  if (competenciaId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: conveniosQueryKeys.detail(poloId, competenciaId) }),
    );
  } else {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: conveniosQueryKeys.detailsForPolo(poloId) }),
    );
  }

  await Promise.all(invalidations);
};
