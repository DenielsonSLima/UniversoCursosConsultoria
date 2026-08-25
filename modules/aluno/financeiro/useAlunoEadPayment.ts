import React, { useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';

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
    const paymentWindow = method === 'BOLETO' ? preparePaymentWindow() : null;
    setIsStarting(true);
    try {
      const result = await paymentCheckoutService.getPublicCheckout(
        selectedPayment.cursoId,
        alunoId,
        selectedPayment.turma_id || undefined,
        { method },
      );
      const checkoutResult = result as unknown as {
        url?: string;
        receivableId?: string;
        paymentLinkUrl?: string;
        payment?: {
          provider?: string;
          invoiceUrl?: string;
          pixQrCode?: { payload?: string; encodedImage?: string };
        };
      };
      const provider = String(checkoutResult.payment?.provider || '').toLowerCase();
      const checkoutUrl = checkoutResult.url
        || checkoutResult.payment?.invoiceUrl
        || checkoutResult.paymentLinkUrl;
      const hasPix = Boolean(
        checkoutResult.payment?.pixQrCode?.payload
        || checkoutResult.payment?.pixQrCode?.encodedImage,
      );

      if (method === 'PIX' && hasPix) {
        setSelectedPayment(null);
        setPanel(result as EadPaymentPanelData);
        invalidateFinance();
        return;
      }
      if (method === 'CREDIT_CARD') {
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
      if (method === 'BOLETO' && !checkoutUrl) {
        throw new Error('O Banese registrou a cobrança, mas não retornou a rota autenticada do boleto.');
      }
      if (method === 'BOLETO' && checkoutUrl) {
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
    isStarting,
    panel,
    setMethod,
    setPanel,
    open,
    close,
    start,
  };
};

export default useAlunoEadPayment;
