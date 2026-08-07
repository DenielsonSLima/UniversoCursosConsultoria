import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { financeiroQueryKeys } from '../../../financeiro/financeiro.queryKeys';
import { financeiroService } from '../../../financeiro/financeiro.service';
import type { SecretariaFinanceiraRecebivel } from '../secretariaFinanceira.service';
import { secretariaFinanceiraService } from '../secretariaFinanceira.service';
import type { SettlementForm } from '../secretaria-financeira.types';
import {
  formatCurrencyInput,
  safeRandomUUID,
  today,
} from '../secretaria-financeira.utils';

type ToastApi = {
  success: (title: string, message: string) => void;
  error: (title: string, message: string) => void;
};

type UseSecretariaSettlementInput = {
  poloId: string;
  financeKey: QueryKey;
  toast: ToastApi;
};

const initialForm = (): SettlementForm => ({
  accountId: '',
  paymentDate: today(),
  paymentMethod: 'DINHEIRO',
  paidValue: '',
  interestValue: '',
  penaltyValue: '',
  discountValue: '',
  additionValue: '',
});

export const useSecretariaSettlement = ({
  poloId,
  financeKey,
  toast,
}: UseSecretariaSettlementInput) => {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<SecretariaFinanceiraRecebivel | null>(null);
  const [form, setForm] = useState<SettlementForm>(initialForm);
  const [settlementAttemptId, setSettlementAttemptId] = useState(safeRandomUUID);

  const contasQuery = useQuery({
    queryKey: [...financeKey, 'contas'],
    queryFn: () => secretariaFinanceiraService.getContasParaRecebimento(poloId),
    enabled: Boolean(selected),
    staleTime: 60_000,
  });

  const open = (item: SecretariaFinanceiraRecebivel) => {
    setSelected(item);
    setForm({
      ...initialForm(),
      paidValue: formatCurrencyInput(item.valor),
    });
    setSettlementAttemptId(safeRandomUUID());
  };

  const close = () => setSelected(null);

  const setField = <Key extends keyof SettlementForm>(
    field: Key,
    value: SettlementForm[Key],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const mutation = useMutation({
    mutationFn: () => financeiroService.markReceivablePaid(selected!.id, {
      idempotencyKey: settlementAttemptId,
      contaBancariaId: form.accountId,
      valorPago: form.paidValue,
      valorJuros: form.interestValue || '0',
      valorMulta: form.penaltyValue || '0',
      valorDesconto: form.discountValue || '0',
      valorAcrescimo: form.additionValue || '0',
      dataPagamento: form.paymentDate,
      formaPagamento: form.paymentMethod,
    }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeKey }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({
          queryKey: financeiroQueryKeys.contasBancariasSaldos,
          exact: true,
        }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.alunoReceivables }),
        queryClient.invalidateQueries({ queryKey: ['aluno-financeiro'] }),
      ]);
      toast.success(
        'Recebimento confirmado',
        result.futureSyncWarning
          ? `Baixa registrada. Atenção: ${result.futureSyncWarning}`
          : 'A dívida foi baixada e saiu dos agrupamentos financeiros.',
      );
      close();
    },
    onError: (error: any) => toast.error(
      'Não foi possível dar baixa',
      error?.message || 'Confira os dados e tente novamente.',
    ),
  });

  const confirmDisabled = !form.accountId
    || !form.paymentDate
    || !/[1-9]/.test(form.paidValue)
    || mutation.isPending;

  return {
    selected,
    form,
    accounts: contasQuery.data || [],
    accountsLoading: contasQuery.isLoading,
    confirmDisabled,
    isPending: mutation.isPending,
    open,
    close,
    setField,
    confirm: mutation.mutate,
  };
};

export type SecretariaSettlementController = ReturnType<typeof useSecretariaSettlement>;
