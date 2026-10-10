import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeiroQueryKeys } from '../../../../../../financeiro/financeiro.queryKeys';
import { financeiroService } from '../../../../../../financeiro/financeiro.service';
import type { ManualSettlementPayload } from '../../../../../../financeiro/receber/components/manual-settlement/useManualSettlementForm';
import { isManualEnrollmentSettlementAccount, manualEnrollmentAccountsErrorMessage } from '../ciclo-manual-settlement-account';
import { matriculaTecnicaFinanceiroKeys } from '../matricula-tecnica-financeiro.keys';
import type { AlunoExtratoRecebivel } from './alunoExtrato.mapper';
import { canSettleExtratoReceivable } from './alunoExtrato.settlement-policy';
import { alunoExtratoQueryKey } from './useAlunoExtratoRealtime';

interface Options {
  matriculaId: string;
  turmaId?: string;
  canSettle: boolean;
  recebiveis?: AlunoExtratoRecebivel[];
  toast: {
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
  };
}

export const useAlunoExtratoSettlement = ({ matriculaId, turmaId, canSettle, recebiveis, toast }: Options) => {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<AlunoExtratoRecebivel | null>(null);
  const inFlight = useRef(false);
  const poloId = selected?.poloId || '';
  const current = recebiveis?.find((item) => item.id === selected?.id);
  const eligible = Boolean(current && canSettleExtratoReceivable(current, canSettle));
  const accountsQuery = useQuery({
    queryKey: [...financeiroQueryKeys.contasBancariasSaldos, poloId, 'extrato-baixa-manual'],
    queryFn: () => financeiroService.getContasBancariasSaldos(poloId),
    enabled: Boolean(selected && canSettle && poloId),
    staleTime: 0,
    retry: false,
  });
  const accounts = useMemo(() => (accountsQuery.data || []).filter((account) =>
    isManualEnrollmentSettlementAccount(account, poloId)
  ), [accountsQuery.data, poloId]);
  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: alunoExtratoQueryKey(matriculaId), exact: true }),
    queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
    queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.alunoReceivables }),
    queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
    queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
    queryClient.invalidateQueries({ queryKey: ['aluno-financeiro'] }),
    ...(turmaId ? [
      queryClient.invalidateQueries({ queryKey: matriculaTecnicaFinanceiroKeys.turma(turmaId) }),
      queryClient.invalidateQueries({ queryKey: ['turma-financeiro', turmaId] }),
    ] : []),
  ]);
  const mutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ManualSettlementPayload }) => {
      if (!canSettle) throw new Error('Seu perfil não possui permissão para registrar recebimentos.');
      const result = await financeiroService.markReceivablePaid(id, payload);
      if (result?.success !== true) throw new Error('O servidor não confirmou o recebimento. Confira a situação antes de tentar novamente.');
      return result;
    },
    onSuccess: (result) => {
      toast.success('Recebimento confirmado', result.futureSyncWarning
        ? `Baixa registrada. ${result.futureSyncWarning}`
        : 'O recebimento foi registrado na conta selecionada.');
      setSelected(null);
    },
    onError: (error) => toast.error('Recebimento não confirmado',
      error instanceof Error ? error.message : 'Confira os dados e tente novamente.'),
    onSettled: async () => {
      // Reconcile even an ambiguous response: the server may have committed.
      try { await invalidate(); } finally { inFlight.current = false; }
    },
  });
  return {
    selected, accounts,
    pending: mutation.isPending,
    submitDisabled: !eligible || accountsQuery.isFetching || accountsQuery.isError || accounts.length === 0,
    error: mutation.error instanceof Error ? mutation.error.message
      : accountsQuery.isError ? manualEnrollmentAccountsErrorMessage(accountsQuery.error)
        : selected && !eligible ? 'Esta cobrança foi atualizada e não está disponível para recebimento.' : null,
    open: (item: AlunoExtratoRecebivel, alunoNome: string) => {
      if (inFlight.current || !canSettleExtratoReceivable(item, canSettle)) return;
      mutation.reset();
      setSelected({ ...item, turmaId, clienteNome: alunoNome });
    },
    close: () => { if (!inFlight.current) { mutation.reset(); setSelected(null); } },
    confirm: (payload: ManualSettlementPayload) => {
      if (!selected || !eligible || inFlight.current || accountsQuery.isFetching || accountsQuery.isError
        || !accounts.some((account) => account.id === payload.contaBancariaId)) return;
      inFlight.current = true;
      mutation.mutate({ id: selected.id, payload });
    },
  };
};

export type AlunoExtratoSettlement = ReturnType<typeof useAlunoExtratoSettlement>;
