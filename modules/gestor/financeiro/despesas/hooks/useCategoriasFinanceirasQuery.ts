// File: modules/gestor/financeiro/despesas/hooks/useCategoriasFinanceirasQuery.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { despesasService, CreateCategoriaFinanceiraInput } from '../despesas.service';
import { despesasQueryKeys, DespesaTipo } from '../despesas.queryKeys';

export function useCategoriasFinanceirasQuery(tipo?: DespesaTipo) {
  return useQuery({
    queryKey: despesasQueryKeys.categoriasList(tipo),
    queryFn: () => despesasService.getCategoriasFinanceiras(tipo),
    staleTime: 60_000,
  });
}

export function useAllCategoriasFinanceirasQuery() {
  return useQuery({
    queryKey: despesasQueryKeys.categoriasList(),
    queryFn: () => despesasService.getAllCategoriasFinanceiras(),
    staleTime: 60_000,
  });
}

export function useCreateCategoriaFinanceiraMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoriaFinanceiraInput) =>
      despesasService.createCategoriaFinanceira(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: despesasQueryKeys.categoriasRoot });
    },
  });
}

export function useDeleteCategoriaFinanceiraMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => despesasService.deleteCategoriaFinanceira(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: despesasQueryKeys.categoriasRoot });
    },
  });
}

export function useUpdateCategoriaFinanceiraMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateCategoriaFinanceiraInput> }) =>
      despesasService.updateCategoriaFinanceira(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: despesasQueryKeys.categoriasRoot });
    },
  });
}
