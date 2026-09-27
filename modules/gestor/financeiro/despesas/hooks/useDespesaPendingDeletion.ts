import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { caixaQueryKeys } from '../../../caixa/caixa.service';
import { invalidateConveniosScope } from '../../convenios/convenios.cache';
import {
  createFinanceRequestId,
  despesasService,
  type DespesaLancamento,
} from '../despesas.service';
import { despesasQueryKeys, type DespesaTipo } from '../despesas.queryKeys';

interface UseDespesaPendingDeletionParams {
  items: DespesaLancamento[];
  poloId: string;
  tipo: DespesaTipo;
  onSuccess: (quantidade: number) => void;
  onError: (message: string) => void;
}

const isEligible = (item: DespesaLancamento) => (
  !item.isRateioDerived && (item.status === 'PENDENTE' || item.status === 'VENCIDO')
);

export const useDespesaPendingDeletion = ({
  items,
  poloId,
  tipo,
  onSuccess,
  onError,
}: UseDespesaPendingDeletionParams) => {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingItems, setPendingItems] = useState<DespesaLancamento[]>([]);
  const requestIdRef = useRef<string | null>(null);

  const eligibleItems = useMemo(() => items.filter(isEligible), [items]);
  const eligibleIds = useMemo(() => new Set(eligibleItems.map((item) => item.id)), [eligibleItems]);
  const selectedItems = useMemo(
    () => eligibleItems.filter((item) => selectedIds.has(item.id)),
    [eligibleItems, selectedIds],
  );

  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => eligibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [eligibleIds]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!requestIdRef.current || pendingItems.length === 0) {
        throw new Error('Nenhum lançamento foi selecionado para exclusão.');
      }
      return despesasService.excluirDespesasPendentes({
        requestId: requestIdRef.current,
        poloId,
        tipo,
        despesaIds: pendingItems.map((item) => item.id),
      });
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: despesasQueryKeys.lancamentosRoot }),
        queryClient.invalidateQueries({ queryKey: despesasQueryKeys.summaryRoot }),
        queryClient.invalidateQueries({ queryKey: despesasQueryKeys.groupSummaryRoot }),
        queryClient.invalidateQueries({ queryKey: caixaQueryKeys.dashboards }),
        queryClient.invalidateQueries({ queryKey: caixaQueryKeys.custosOperacionais }),
        invalidateConveniosScope(queryClient, poloId),
      ]);
      setSelectedIds(new Set());
      setPendingItems([]);
      requestIdRef.current = null;
      onSuccess(result.quantidade);
    },
    onError: (error: any) => onError(error?.message || 'Não foi possível excluir os lançamentos.'),
  });

  const openConfirmation = (selection = selectedItems) => {
    const eligible = selection.filter(isEligible);
    if (eligible.length === 0) return;
    requestIdRef.current = createFinanceRequestId();
    setPendingItems(eligible);
  };

  const closeConfirmation = () => {
    if (mutation.isPending) return;
    requestIdRef.current = null;
    setPendingItems([]);
  };

  const selectAll = () => setSelectedIds((current) => (
    current.size === eligibleItems.length
      ? new Set()
      : new Set(eligibleItems.map((item) => item.id))
  ));

  return {
    eligibleItems,
    selectedIds,
    selectedItems,
    setSelectedIds,
    selectAll,
    openConfirmation,
    closeConfirmation,
    confirm: () => mutation.mutate(),
    pendingItems,
    isPending: mutation.isPending,
  };
};
