import { useQuery } from '@tanstack/react-query';
import { financeiroService } from '../financeiro.service';
import { financeiroQueryKeys } from '../financeiro.queryKeys';

interface FinanceiroSharedQueriesOptions {
  accounts?: boolean;
  polos?: boolean;
  partners?: boolean;
  turmas?: boolean;
}

export function useFinanceiroSharedQueries(options: FinanceiroSharedQueriesOptions = {}) {
  const {
    accounts = true,
    polos = true,
    partners = true,
    turmas = false,
  } = options;

  const accountsQuery = useQuery({
    queryKey: financeiroQueryKeys.contasBancariasSaldos,
    queryFn: () => financeiroService.getContasBancariasSaldos(),
    staleTime: 60_000,
    enabled: accounts,
  });

  const polosQuery = useQuery({
    queryKey: financeiroQueryKeys.polos,
    queryFn: () => financeiroService.getPolos(),
    staleTime: 60_000,
    enabled: polos,
  });

  const partnersQuery = useQuery({
    queryKey: financeiroQueryKeys.parceiros,
    queryFn: () => financeiroService.getParceiros(),
    staleTime: 60_000,
    enabled: partners,
  });

  const turmasQuery = useQuery({
    queryKey: ['financeiro-shared-turmas'],
    queryFn: () => financeiroService.getTurmas(),
    staleTime: 60_000,
    enabled: turmas,
  });

  return {
    accountsQuery,
    polosQuery,
    partnersQuery,
    turmasQuery,
  };
}
