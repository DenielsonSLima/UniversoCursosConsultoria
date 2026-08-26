import React, { useState } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { paymentCheckoutService } from '../../asaas/asaas.service';
import type { EadPaymentPanelData } from '../../ead/components/EadPaymentModal';
import { useEadPaymentConfirmationWatcher } from '../../ead/hooks/useEadPaymentConfirmationWatcher';
import { fetchBaneseBoletoDocument } from '../shared/baneseBoletoDocument';
import {
  preparePaymentWindow,
  renderPdfInPaymentWindow,
  renderPaymentWindowError,
} from '../shared/paymentWindow';
import {
  alunoEadPaymentErrorMessage,
  normalizeAlunoEadPaymentMethod,
} from './financeiro.presentation';
import {
  buildAlunoEadCheckoutSelection,
  isAlunoEadBolePixFallback,
  isInlineAlunoBolePix,
  matchesAlunoEadCheckoutReceivable,
} from './alunoEadPaymentOptions';
import type {
  AlunoEadPaymentMethod,
  AlunoFinancialItem,
} from './financeiro.types';

interface UseAlunoEadPaymentOptions {
  alunoId: string;
  queryClient: QueryClient;
  invalidateFinance: () => void;
  showNotice: (message: string, duration?: number) => void;
}

const useAlunoEadPayment = ({
  alunoId,
  queryClient,
  invalidateFinance,
  showNotice,
}: UseAlunoEadPaymentOptions) => {
  const [selectedPayment, setSelectedPayment] = useState<AlunoFinancialItem | null>(null);
  const [method, setMethod] = useState<AlunoEadPaymentMethod>('PIX');
  const [isStarting, setIsStarting] = useState(false);
  const [panel, setPanel] = useState<EadPaymentPanelData | null>(null);
  const paymentOptionsQuery = useQuery({
    queryKey: [
      'aluno-ead-payment-options',
      alunoId,
      selectedPayment?.id || null,
    ],
    queryFn: () => paymentCheckoutService.getStudentEadPaymentOptions(
      String(selectedPayment?.id || ''),
    ),
    enabled: Boolean(alunoId && selectedPayment?.id),
    staleTime: 15_000,
    retry: 1,
  });
  const paymentOptions = React.useMemo(
    () => paymentOptionsQuery.data?.options || [],
    [paymentOptionsQuery.data],
  );

  React.useEffect(() => {
    if (!selectedPayment || paymentOptions.length === 0) return;
    if (!paymentOptions.some((option) => option.id === method)) {
      setMethod(paymentOptions[0].id);
    }
  }, [method, paymentOptions, selectedPayment]);

  const confirmPayment = React.useCallback(() => {
    setPanel(null);
    showNotice('Pagamento confirmado automaticamente. Curso liberado em Meus Cursos.', 6500);
    invalidateFinance();
  }, [invalidateFinance, showNotice]);

  useEadPaymentConfirmationWatcher({
    alunoId,
    panel,
    queryClient,
    onConfirmed: confirmPayment,
  });

  const open = (item: AlunoFinancialItem) => {
    if (!item.cursoId) {
      showNotice('Não foi possível localizar o curso desta cobrança EAD. Fale com a secretaria.', 4500);
      return;
    }
    setSelectedPayment(item);
    setMethod(normalizeAlunoEadPaymentMethod(item.forma_pagamento));
  };

  const close = () => {
    if (!isStarting) setSelectedPayment(null);
  };

  const start = async () => {
    if (!selectedPayment?.cursoId) return;
    const selectedOption = paymentOptions.find((option) => option.id === method);
    if (!selectedOption) {
      showNotice('Nenhuma forma de pagamento está disponível para esta cobrança EAD.', 4500);
      return;
    }
    const paymentSelection = buildAlunoEadCheckoutSelection(selectedOption);
    const paymentWindow = paymentSelection.presentation === 'BOLETO'
      ? preparePaymentWindow()
      : null;
    setIsStarting(true);
    try {
      const result = await paymentCheckoutService.getPublicCheckout(
        selectedPayment.cursoId,
        alunoId,
        selectedPayment.turma_id || undefined,
        paymentSelection,
        selectedPayment.id,
      );
      const checkoutResult = result as unknown as {
        url?: string;
        presentation?: 'BOLETO' | 'PIX';
        presentationFallbackReason?: 'PIX_UNAVAILABLE_USE_BOLETO';
        receivableId?: string;
        paymentLinkUrl?: string;
        alreadyPaid?: boolean;
        payment?: {
          provider?: string;
          method?: string;
          invoiceUrl?: string;
          pixQrCode?: { payload?: string; encodedImage?: string };
        };
      };
      const provider = String(checkoutResult.payment?.provider || '').toLowerCase();
      const checkoutUrl = checkoutResult.url
        || checkoutResult.payment?.invoiceUrl
        || checkoutResult.paymentLinkUrl;
      const returnedMethod = String(checkoutResult.payment?.method || '').toUpperCase();
      const returnedPresentation = checkoutResult.presentation;
      if (!matchesAlunoEadCheckoutReceivable(
        selectedPayment.id,
        checkoutResult.receivableId,
      )) {
        throw new Error('O backend não confirmou o mesmo título financeiro selecionado.');
      }
      if (checkoutResult.alreadyPaid) {
        paymentWindow?.close();
        setSelectedPayment(null);
        invalidateFinance();
        showNotice('Este pagamento já foi confirmado.', 4000);
        return;
      }
      const bolePixFallback = isAlunoEadBolePixFallback(
        selectedOption,
        returnedMethod,
        returnedPresentation,
        checkoutResult.payment?.pixQrCode,
      );
      if (
        paymentSelection.presentation
        && returnedPresentation !== paymentSelection.presentation
        && !bolePixFallback
      ) {
        throw new Error('O backend não confirmou a apresentação de pagamento solicitada.');
      }

      if (isInlineAlunoBolePix(
        selectedOption,
        returnedMethod,
        returnedPresentation,
        checkoutResult.payment?.pixQrCode,
      )) {
        setSelectedPayment(null);
        setPanel({
          ...(result as EadPaymentPanelData),
          presentation: 'PIX',
        });
        invalidateFinance();
        return;
      }
      if (bolePixFallback) {
        setSelectedPayment(null);
        setPanel({
          ...(result as EadPaymentPanelData),
          presentation: 'BOLETO',
        });
        invalidateFinance();
        showNotice(
          'O Pix não foi disponibilizado pelo banco. Use o boleto oficial deste mesmo título.',
          5500,
        );
        return;
      }
      if (selectedOption.checkoutMethod === 'CREDIT_CARD') {
        if (!checkoutUrl) throw new Error('O gateway não retornou o link do checkout do cartão.');
        if (provider === 'mercado_pago') {
          invalidateFinance();
          window.location.assign(checkoutUrl);
        } else {
          window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
        }
        setSelectedPayment(null);
        return;
      }
      if (paymentSelection.presentation === 'BOLETO' && !checkoutUrl) {
        throw new Error('O Banese registrou a cobrança, mas não retornou a rota autenticada do boleto.');
      }
      if (paymentSelection.presentation === 'BOLETO' && checkoutUrl) {
        invalidateFinance();
        setSelectedPayment(null);
        try {
          const pdf = await fetchBaneseBoletoDocument(String(checkoutResult.receivableId || ''));
          if (!renderPdfInPaymentWindow(paymentWindow, pdf)) {
            throw new Error('O navegador bloqueou a nova aba do boleto.');
          }
        } catch (error) {
          const message = alunoEadPaymentErrorMessage(error, 'BOLETO');
          renderPaymentWindowError(paymentWindow, message);
          setPanel(result as EadPaymentPanelData);
          showNotice(`${message} Use “Abrir boleto” para tentar novamente sem sair do portal.`, 5500);
        }
        return;
      }
      if ((provider === 'mercado_pago' || String(checkoutUrl || '').includes('mercadopago.com'))
          && checkoutUrl) {
        window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
        setSelectedPayment(null);
        return;
      }
      setSelectedPayment(null);
      setPanel(result as EadPaymentPanelData);
    } catch (error) {
      const message = alunoEadPaymentErrorMessage(error, 'CHECKOUT');
      renderPaymentWindowError(paymentWindow, message);
      showNotice(message, 5500);
    } finally {
      setIsStarting(false);
    }
  };

  return {
    selectedPayment,
    method,
    paymentOptions,
    isLoadingPaymentOptions: paymentOptionsQuery.isPending,
    paymentOptionsError: paymentOptionsQuery.isError
      ? alunoEadPaymentErrorMessage(paymentOptionsQuery.error, 'CHECKOUT')
      : null,
    isStarting,
    panel,
    setMethod,
    setPanel,
    retryPaymentOptions: () => { void paymentOptionsQuery.refetch(); },
    open,
    close,
    start,
  };
};

export default useAlunoEadPayment;
