import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeiroQueryKeys } from '../../financeiro/financeiro.queryKeys';
import {
  financeiroService,
  isContaDisponivelNoPolo,
} from '../../financeiro/financeiro.service';
import type { ManualSettlementPayload } from '../../financeiro/receber/components/manual-settlement/useManualSettlementForm';
import {
  DASHBOARD_EXISTING_TITLE_SETTLEMENT_CONTEXT,
  dashboardSettlementGuidance,
  getDashboardSettlementBlock,
  type DashboardStudentReceivable,
} from './dashboard-student-finance.model';

interface SettlementToast {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

interface UseDashboardStudentSettlementOptions {
  activePoloId?: string | null;
  canSettle: boolean;
  toast: SettlementToast;
}

interface SettlementVariables {
  receivable: DashboardStudentReceivable;
  payload: ManualSettlementPayload;
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

type DashboardSettlementResult = Awaited<
  ReturnType<typeof financeiroService.markReceivablePaid>
> & { futureSyncSuppressed?: boolean };

const settlementSuccessMessage = (
  receivable: DashboardStudentReceivable,
  result: DashboardSettlementResult,
) => {
  const futureScope = result.futureSyncSuppressed
    ? ' A ação rápida não gerou nem sincronizou parcelas futuras.'
    : '';
  if (result.futureSyncWarning) {
    return `Baixa registrada. Atenção na sincronização futura: ${result.futureSyncWarning}${futureScope}`;
  }

  const remoteCanceled = Boolean(
    result.gatewayCanceled
    || result.asaasCanceled
    || result.asaasPaymentLinkCanceled
    || result.baneseCanceled,
  );
  if (remoteCanceled) {
    const provider = result.gatewayProvider || receivable.gatewayProvider || 'integração bancária';
    return `Baixa registrada e cancelamento remoto confirmado em ${provider}.${futureScope}`;
  }
  if (receivable.hasRemoteCharge) {
    return `Baixa registrada pelo fluxo canônico. Nenhum novo cancelamento remoto foi informado pela integração.${futureScope}`;
  }
  return `Baixa manual registrada na conta selecionada.${futureScope}`;
};

export const useDashboardStudentSettlement = ({
  activePoloId,
  canSettle,
  toast,
}: UseDashboardStudentSettlementOptions) => {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<DashboardStudentReceivable | null>(null);

  const selectedBlock = selected
    ? getDashboardSettlementBlock(selected, canSettle, activePoloId)
    : null;

  const accountsQuery = useQuery({
    queryKey: [
      ...financeiroQueryKeys.contasBancariasSaldos,
      selected?.poloId || 'sem-polo',
      'dashboard-settlement',
    ],
    queryFn: () => financeiroService.getContasBancariasSaldos(selected?.poloId),
    enabled: Boolean(selected && !selectedBlock),
    staleTime: 0,
    gcTime: 30 * 60_000,
  });

  const accounts = useMemo(
    () => (accountsQuery.data || []).filter((account) =>
      account.ativo !== false
      && Boolean(account.id)
      && isContaDisponivelNoPolo(account, selected?.poloId)
    ),
    [accountsQuery.data, selected?.poloId],
  );

  const invalidateSettlementCaches = (receivable: DashboardStudentReceivable) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.alunoReceivables }),
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
      queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
      queryClient.invalidateQueries({ queryKey: ['aluno-financeiro'] }),
      receivable.turmaId
        ? queryClient.invalidateQueries({ queryKey: ['turma-financeiro', receivable.turmaId] })
        : Promise.resolve(),
    ]);

  const mutation = useMutation({
    mutationFn: ({ receivable, payload }: SettlementVariables) => {
      const block = getDashboardSettlementBlock(receivable, canSettle, activePoloId);
      if (block) throw new Error(dashboardSettlementGuidance(block));
      const canonicalPayload = {
        ...payload,
        settlementContext: DASHBOARD_EXISTING_TITLE_SETTLEMENT_CONTEXT,
      };
      return financeiroService.markReceivablePaid(receivable.id, canonicalPayload);
    },
    onSuccess: async (result, { receivable }) => {
      await invalidateSettlementCaches(receivable);
      toast.success('Recebimento confirmado', settlementSuccessMessage(receivable, result));
      setSelected((current) => current?.id === receivable.id ? null : current);
    },
    onError: async (error, { receivable }) => {
      await invalidateSettlementCaches(receivable);
      toast.error(
        'Erro ao confirmar recebimento',
        errorMessage(error, 'Não foi possível registrar a baixa manual.'),
      );
    },
  });

  const openSettlement = (receivable: DashboardStudentReceivable) => {
    const block = getDashboardSettlementBlock(receivable, canSettle, activePoloId);
    if (block) {
      toast.info('Baixa indisponível', dashboardSettlementGuidance(block));
      return;
    }
    mutation.reset();
    setSelected(receivable);
  };

  const closeSettlement = () => {
    if (mutation.isPending) return;
    mutation.reset();
    setSelected(null);
  };

  const confirmSettlement = (payload: ManualSettlementPayload) => {
    if (!selected || mutation.isPending) return;
    mutation.mutate({ receivable: selected, payload });
  };

  return {
    selected,
    accounts,
    accountsLoading: accountsQuery.isLoading,
    pending: mutation.isPending,
    error: mutation.error
      ? errorMessage(mutation.error, 'Não foi possível registrar a baixa manual.')
      : accountsQuery.error
        ? errorMessage(accountsQuery.error, 'Não foi possível carregar as contas deste polo.')
        : null,
    openSettlement,
    closeSettlement,
    confirmSettlement,
  };
};
