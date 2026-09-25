import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeiroQueryKeys } from '../../../../../../financeiro/financeiro.queryKeys';
import { financeiroService, type ContasReceber } from '../../../../../../financeiro/financeiro.service';
import type { ManualSettlementPayload } from '../../../../../../financeiro/receber/components/manual-settlement/useManualSettlementForm';
import type { MatriculaTecnicaFinanceiroRow } from '../matricula-tecnica-financeiro.types';
import { isProvenLocalEnrollment } from '../matricula-tecnica-ciclo-manual-destination';
import { matriculaTecnicaFinanceiroKeys } from '../matricula-tecnica-financeiro.keys';
import { isManualEnrollmentSettlementAccount, manualEnrollmentAccountsErrorMessage } from '../ciclo-manual-settlement-account';

interface Options {
  turmaId: string;
  poloId: string;
  canSettle: boolean;
  toast: {
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
  };
}

export const useCicloManualEnrollmentSettlement = ({ turmaId, poloId, canSettle, toast }: Options) => {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ContasReceber | null>(null);
  const inFlight = useRef(false);
  const accountsQuery = useQuery({
    queryKey: [...financeiroQueryKeys.contasBancariasSaldos, poloId, 'matricula-ciclo-manual'],
    queryFn: () => financeiroService.getContasBancariasSaldos(poloId),
    enabled: Boolean(selected && canSettle),
    staleTime: 0,
    retry: false,
  });
  const accounts = useMemo(() => (accountsQuery.data || []).filter((account) =>
    isManualEnrollmentSettlementAccount(account, poloId)
  ), [accountsQuery.data, poloId]);
  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: matriculaTecnicaFinanceiroKeys.turma(turmaId) }),
    queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
    queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.alunoReceivables }),
    queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
    queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
    queryClient.invalidateQueries({ queryKey: ['aluno-financeiro'] }),
    queryClient.invalidateQueries({ queryKey: ['turma-financeiro', turmaId] }),
  ]);
  const mutation = useMutation({
    mutationFn: ({ receivableId, payload }: { receivableId: string; payload: ManualSettlementPayload }) => {
      if (!canSettle) throw new Error('Seu perfil não possui permissão para registrar recebimentos.');
      return financeiroService.markReceivablePaid(receivableId, payload);
    },
    onSuccess: (result) => {
      toast.success('Recebimento da matrícula confirmado', result.futureSyncWarning
        ? `Baixa registrada. ${result.futureSyncWarning}`
        : 'O recebimento foi registrado na conta selecionada. O ciclo já gerado foi preservado.');
      setSelected(null);
    },
    onError: (error) => toast.error('Recebimento não confirmado',
      `${error instanceof Error ? error.message : 'Confira os dados e tente novamente.'} O ciclo permanece criado.`),
    onSettled: async () => {
      try { await invalidate(); } finally { inFlight.current = false; }
    },
  });
  const open = (row: MatriculaTecnicaFinanceiroRow, local = row.cicloManual.matriculaLocal) => {
    if (!canSettle || inFlight.current || !isProvenLocalEnrollment(local)
      || !local || !['PENDENTE', 'VENCIDO'].includes(local.status)) return;
    mutation.reset();
    setSelected({
      id: local.id, poloId, turmaId, matriculaId: row.matriculaId,
      clienteNome: row.alunoNome, descricao: local.descricao, valor: Number(local.valor),
      dataVencimento: local.vencimento, status: local.status, categoria: 'MENSALIDADE',
      tipoLancamento: 'MATRICULA',
    });
  };
  return {
    selected, accounts, open,
    pending: mutation.isPending,
    accountsLoading: accountsQuery.isFetching,
    accountsUnavailable: accountsQuery.isError,
    error: mutation.error instanceof Error ? mutation.error.message
      : accountsQuery.isError ? manualEnrollmentAccountsErrorMessage(accountsQuery.error) : null,
    close: () => { if (!inFlight.current) { mutation.reset(); setSelected(null); } },
    confirm: (payload: ManualSettlementPayload) => {
      if (!selected?.id || !canSettle || inFlight.current || accountsQuery.isFetching || accountsQuery.isError) return;
      inFlight.current = true;
      mutation.mutate({ receivableId: selected.id, payload });
    },
  };
};

export type CicloManualEnrollmentSettlement = ReturnType<typeof useCicloManualEnrollmentSettlement>;
