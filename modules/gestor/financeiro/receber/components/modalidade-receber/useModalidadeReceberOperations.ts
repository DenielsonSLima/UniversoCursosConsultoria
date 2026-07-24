import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { asaasIntegrationService } from '../../../../../asaas/asaas.service';
import { copyTextToClipboard } from '../../../../../../lib/clipboard';
import { printReciboDespesa } from '../../../../cadastros/modelos-documentos/recibo/ReciboDespesaPreview';
import { financeiroQueryKeys } from '../../../financeiro.queryKeys';
import type { ContasReceber } from '../../../financeiro.service';
import { financeiroService } from '../../../financeiro.service';
import { gestorBanesePaymentService } from '../../banese/gestor-banese-payment.service';
import type { ManualSettlementPayload } from '../manual-settlement/useManualSettlementForm';
import {
  isPaidThroughAsaas,
  paymentGatewayCode,
  paymentGatewayLabel,
  paymentMethodLabel,
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
  const [reversalReason, setReversalReason] = useState('');
  const [recreateAsaas, setRecreateAsaas] = useState(true);

  const closePaymentModal = () => setSelected(null);
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeiroQueryKeys.receivablesRoot }),
    onError: (error: any) => console.error('Não foi possível enviar a cobrança ao banco configurado:', error),
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
        result.gatewayRecreated && reversedReceivable
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
    if (!selected && !reversalItem) return;

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (selected && !paymentMutation.isPending) setSelected(null);
      if (reversalItem && !reversalMutation.isPending) {
        setReversalItem(null);
        setReversalReason('');
        setRecreateAsaas(true);
      }
    };

    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
  }, [paymentMutation.isPending, reversalItem, reversalMutation.isPending, selected]);

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

  const printInstitutionalReceipt = (item: ContasReceber) => {
    printReciboDespesa({
      reciboTitulo: 'Recibo de Pagamento',
      reciboNumero: item.id ? item.id.slice(0, 8).toUpperCase() : undefined,
      contraparteLabel: 'Aluno / Pagador',
      assinaturaNome: 'Responsável Financeiro',
      empresaNome: 'Universo Cursos e Consultoria',
      empresaCnpj: item.poloCnpj,
      descricao: item.descricao,
      valor: item.valor,
      valorPago: item.valorPago ?? item.valor,
      dataVencimento: item.dataVencimento,
      dataPagamento: item.dataPagamento,
      fornecedorNome: item.clienteNome,
      fornecedorId: item.clienteCpfCnpj,
      categoriaNome: [item.cursoNome, item.turmaNome, item.tipoLancamento].filter(Boolean).join(' • '),
      formaPagamento: paymentMethodLabel(item),
      poloNome: item.poloNome,
      parcelaNumero: item.parcelaNumero,
      observacao: 'Pagamento manual registrado no sistema da Universo Cursos e Consultoria.',
      status: item.status,
    });
  };

  const openPaidReceipt = (item: ContasReceber) => {
    if (isPaidThroughAsaas(item)) {
      openAsaasReceipt(item);
      return;
    }
    printInstitutionalReceipt(item);
  };

  const openReversal = (item: ContasReceber) => {
    setReversalItem(item);
    setReversalReason('');
    setRecreateAsaas(Boolean(item.asaasPaymentId));
  };

  return {
    selected,
    reversalItem,
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
    closeReversalModal,
    copyInvoiceUrl,
    openCharge,
    openPaidReceipt,
    openReversal,
  };
};

export type ModalidadeReceberOperations = ReturnType<typeof useModalidadeReceberOperations>;
