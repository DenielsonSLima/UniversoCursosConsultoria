import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { asaasIntegrationService } from '../../../../../asaas/asaas.service';
import { copyTextToClipboard } from '../../../../../../lib/clipboard';
import { financeiroQueryKeys } from '../../../financeiro.queryKeys';
import type { ContasReceber } from '../../../financeiro.service';
import { financeiroService } from '../../../financeiro.service';
import { gestorBanesePaymentService } from '../../banese/gestor-banese-payment.service';
import type { ManualSettlementPayload } from '../manual-settlement/useManualSettlementForm';
import {
  isPaidThroughAsaas,
  paymentGatewayCode,
  paymentGatewayLabel,
} from './modalidade-receber.utils';

interface OperationToast {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

export const useModalidadeReceberOperations = (toast: OperationToast) => {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ContasReceber | null>(null);
  const [reversalItem, setReversalItem] = useState<ContasReceber | null>(null);
  const [receiptItem, setReceiptItem] = useState<ContasReceber | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [recreateAsaas, setRecreateAsaas] = useState(true);

  const closePaymentModal = () => setSelected(null);
  const closeReceiptModal = () => setReceiptItem(null);
  const closeReversalModal = () => {
    setReversalItem(null);
    setReversalReason('');
    setRecreateAsaas(true);
  };

  const paymentMutation = useMutation({
    mutationFn: (payload: ManualSettlementPayload) =>
      financeiroService.markReceivablePaid(selected!.id!, payload),
    onSuccess: async (result) => {
      const paidReceivable = selected;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-aluno-receivables'] }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
        queryClient.invalidateQueries({ queryKey: ['aluno-financeiro'] }),
        selected?.turmaId
          ? queryClient.invalidateQueries({ queryKey: ['turma-financeiro', selected.turmaId] })
          : Promise.resolve(),
      ]);
      toast.success(
        'Recebimento confirmado',
        result.futureSyncWarning
          ? `Baixa registrada. Atenção na sincronização futura: ${result.futureSyncWarning}`
          : result.gatewayCanceled && paidReceivable
            ? `Baixa manual registrada e título ${result.gatewayPaymentId || paidReceivable.asaasPaymentId || ''} cancelado no ${paymentGatewayLabel(paidReceivable)}.`
            : paidReceivable?.asaasPaymentId
              ? `Baixa manual registrada. A cobrança no ${paymentGatewayLabel(paidReceivable)} já estava confirmada/recebida ou não exigia cancelamento.`
              : 'Baixa manual registrada na conta selecionada.',
      );
      setSelected(null);
    },
    onError: (error: any) => toast.error(
      'Erro ao confirmar recebimento',
      error.message || 'Não foi possível registrar a baixa manual.',
    ),
  });

  const syncMutation = useMutation({
    mutationFn: (receivableId: string) => asaasIntegrationService.syncReceivable(receivableId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot });
      toast.success('Cobrança enviada', 'O banco confirmou o processamento da cobrança.');
    },
    onError: (error: any) => toast.error(
      'Erro ao enviar cobrança',
      error?.message || 'Não foi possível enviar a cobrança ao banco configurado.',
    ),
  });

  const refreshMutation = useMutation({
    mutationFn: (receivableId: string) => asaasIntegrationService.refreshReceivableStatus(receivableId),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-aluno-receivables'] }),
        queryClient.invalidateQueries({ queryKey: ['aluno-financeiro'] }),
        result.receivable?.turma_id
          ? queryClient.invalidateQueries({ queryKey: ['turma-financeiro', result.receivable.turma_id] })
          : Promise.resolve(),
      ]);
    },
    onError: (error: any) => console.error('Não foi possível atualizar o status bancário:', error),
  });

  const baneseDetailsMutation = useMutation({
    mutationFn: ({
      receivableId,
      preparedTab,
    }: {
      receivableId: string;
      preparedTab: Window;
    }) => gestorBanesePaymentService.openBoletoPdfInNewTab(receivableId, preparedTab),
    onError: (error: any) => toast.error(
      'Boleto Banese indisponível',
      error?.message || 'Não foi possível montar o boleto para impressão.',
    ),
  });

  const reversalMutation = useMutation({
    mutationFn: () => financeiroService.reverseManualSettlement(reversalItem!.id!, {
      recreateAsaas,
      reason: reversalReason,
    }),
    onSuccess: async (result) => {
      const reversedReceivable = reversalItem;
      if (result.requiresDependencyCheckout && reversedReceivable?.id) {
        sessionStorage.setItem(
          'dependencia:checkout-after-reversal',
          reversedReceivable.id,
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-aluno-receivables'] }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.resumoKpis }),
        queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.contasBancariasSaldos }),
        queryClient.invalidateQueries({ queryKey: ['aluno-financeiro'] }),
        reversedReceivable?.turmaId
          ? queryClient.invalidateQueries({ queryKey: ['turma-financeiro', reversedReceivable.turmaId] })
          : Promise.resolve(),
      ]);
      toast.success(
        'Baixa manual estornada',
        result.requiresDependencyCheckout
          ? 'O recebível voltou para pendente. Reemita o mesmo boleto pela tela de Dependências Acadêmicas.'
          : result.gatewayRecreated && reversedReceivable
          ? `O recebível voltou para pendente e uma nova cobrança ${paymentGatewayLabel(reversedReceivable)} foi gerada.`
          : 'O recebível voltou para pendente para nova conferência.',
      );
      closeReversalModal();
    },
    onError: (error: any) => toast.error(
      'Erro ao estornar baixa',
      error.message || 'Não foi possível desfazer a baixa manual.',
    ),
  });

  useEffect(() => {
    if (!selected && !reversalItem && !receiptItem) return;

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (selected && !paymentMutation.isPending) setSelected(null);
      if (receiptItem) setReceiptItem(null);
      if (reversalItem && !reversalMutation.isPending) {
        setReversalItem(null);
        setReversalReason('');
        setRecreateAsaas(true);
      }
    };

    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
  }, [paymentMutation.isPending, receiptItem, reversalItem, reversalMutation.isPending, selected]);

  const copyInvoiceUrl = async (item: ContasReceber) => {
    const url = item.asaasInvoiceUrl || item.asaasBankSlipUrl;
    if (!url) return;
    if (await copyTextToClipboard(url)) {
      toast.success('Link copiado', 'O link da cobrança foi copiado para envio ao aluno.');
      return;
    }
    toast.error('Não foi possível copiar', 'Seu navegador bloqueou a cópia automática deste link.');
  };

  const openCharge = (item: ContasReceber) => {
    if (['banese_card', 'banese'].includes(paymentGatewayCode(item) || '')) {
      if (!item.id) return;
      const preparedTab = window.open('about:blank', '_blank');
      if (!preparedTab) {
        toast.error(
          'Nova aba bloqueada',
          'Permita pop-ups para este portal e tente abrir o boleto novamente.',
        );
        return;
      }
      preparedTab.opener = null;
      baneseDetailsMutation.mutate({ receivableId: item.id, preparedTab });
      return;
    }

    const url = item.asaasBankSlipUrl || item.asaasInvoiceUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openAsaasReceipt = (item: ContasReceber) => {
    if (item.asaasTransactionReceiptUrl) {
      window.open(item.asaasTransactionReceiptUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    toast.info(
      'Comprovante Asaas indisponível',
      'O Asaas ainda não retornou o comprovante oficial desta cobrança. Use Atualizar Asaas para consultar novamente.',
    );
  };

  const openPaidReceipt = (item: ContasReceber) => {
    if (isPaidThroughAsaas(item)) {
      openAsaasReceipt(item);
      return;
    }
    setReceiptItem(item);
  };

  const openReversal = (item: ContasReceber) => {
    setReversalItem(item);
    setReversalReason('');
    setRecreateAsaas(Boolean(item.asaasPaymentId));
  };

  return {
    selected,
    reversalItem,
    receiptItem,
    reversalReason,
    recreateAsaas,
    paymentMutation,
    syncMutation,
    refreshMutation,
    baneseDetailsMutation,
    reversalMutation,
    setReversalReason,
    setRecreateAsaas,
    openPayment: setSelected,
    closePaymentModal,
    closeReceiptModal,
    closeReversalModal,
    copyInvoiceUrl,
    openCharge,
    openPaidReceipt,
    openReversal,
  };
};

export type ModalidadeReceberOperations = ReturnType<typeof useModalidadeReceberOperations>;
