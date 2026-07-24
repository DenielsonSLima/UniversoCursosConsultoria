import { useCallback, useEffect, useState } from 'react';
import { useMutation, type QueryClient } from '@tanstack/react-query';
import type { CheckoutPaymentSelection } from '../../../asaas/asaas.service';
import { paymentCheckoutService } from '../../../asaas/asaas.service';
import type { EadPaymentPanelData } from '../../../ead/components/EadPaymentModal';
import { useEadPaymentConfirmationWatcher } from '../../../ead/hooks/useEadPaymentConfirmationWatcher';
import { defaultEadCheckoutMethod, resolveEadCheckoutOptions } from '../eadCheckoutOptions';
import type { EadCheckoutPaymentMethod } from '../eadCheckoutOptions';
import type { TechnicalProfileGate } from '../cursosPage.types';
import {
  navigatePaymentWindow,
  preparePaymentWindow,
  renderPdfInPaymentWindow,
  renderPaymentWindowError,
} from '../../shared/paymentWindow';
import { fetchBaneseBoletoDocument } from '../../shared/baneseBoletoDocument';

interface UseCourseCheckoutInput {
  alunoId?: string;
  hasAlunoContext: boolean;
  queryClient: QueryClient;
  loadingTechnicalEnrollmentProfile: boolean;
  technicalEnrollmentMissingFields: TechnicalProfileGate['missingFields'];
  invalidateStudentCourseAccess: () => void;
}

export const useCourseCheckout = ({
  alunoId,
  hasAlunoContext,
  queryClient,
  loadingTechnicalEnrollmentProfile,
  technicalEnrollmentMissingFields,
  invalidateStudentCourseAccess,
}: UseCourseCheckoutInput) => {
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutReview, setCheckoutReview] = useState<{ course: any; turma: any } | null>(null);
  const [technicalProfileGate, setTechnicalProfileGate] = useState<TechnicalProfileGate | null>(null);
  const [eadCheckoutReview, setEadCheckoutReview] = useState<{ course: any } | null>(null);
  const [eadPaymentPanel, setEadPaymentPanel] = useState<EadPaymentPanelData | null>(null);
  const [eadPaymentConfirmation, setEadPaymentConfirmation] = useState('');
  const [eadPaymentMethod, setEadPaymentMethod] = useState<EadCheckoutPaymentMethod>('PIX');
  const [eadInstallments, setEadInstallments] = useState(1);
  const [acceptedOnlineTerms, setAcceptedOnlineTerms] = useState(false);

  useEffect(() => {
    if (!eadCheckoutReview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [eadCheckoutReview]);

  const confirmEadPayment = useCallback((message = 'Pagamento confirmado automaticamente. Curso liberado em Meus Cursos.') => {
    setEadPaymentPanel(null);
    setEadPaymentConfirmation(message);
    invalidateStudentCourseAccess();
    window.setTimeout(() => setEadPaymentConfirmation(''), 6500);
  }, [invalidateStudentCourseAccess]);

  useEadPaymentConfirmationWatcher({
    alunoId,
    panel: eadPaymentPanel,
    queryClient,
    enabled: hasAlunoContext,
    onConfirmed: confirmEadPayment,
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({
      course,
      turmaId,
      checkoutWindow,
      sameTab,
      paymentSelection,
    }: {
      course: any;
      turmaId?: string | null;
      checkoutWindow: Window | null;
      sameTab?: boolean;
      paymentSelection?: CheckoutPaymentSelection;
    }) => {
      if (!alunoId) throw new Error('Aluno não identificado para iniciar a compra.');
      const result = await paymentCheckoutService.getPublicCheckout(course.id, alunoId, turmaId, paymentSelection);
      if (!result?.url || typeof result.url !== 'string') {
        throw new Error('A resposta do checkout não retornou um link válido.');
      }
      return {
        url: result.url,
        payment: result.payment,
        requestedPaymentMethod: String(paymentSelection?.method || '').toUpperCase(),
        matriculaId: result.matriculaId,
        receivableId: result.receivableId,
        checkoutWindow,
        sameTab: sameTab === true,
        alreadyPaid: result.alreadyPaid === true,
        alreadyPending: result.alreadyPending === true,
        awaitingWebhook: result.awaitingWebhook === true,
      };
    },
    onMutate: () => setCheckoutError(''),
    onSuccess: async ({ url, payment, requestedPaymentMethod, matriculaId, receivableId, checkoutWindow, sameTab, alreadyPaid, alreadyPending, awaitingWebhook }) => {
      setEadCheckoutReview(null);
      const paymentMethod = String(payment?.method || requestedPaymentMethod || '').toUpperCase();
      const paymentProvider = String((payment as any)?.provider || 'asaas').toLowerCase();
      const hasPixQrCode = Boolean((payment as any)?.pixQrCode?.payload || (payment as any)?.pixQrCode?.encodedImage);
      const usesInlinePaymentPanel = paymentProvider === 'asaas' || (paymentMethod === 'PIX' && hasPixQrCode);
      if (paymentMethod === 'BOLETO') {
        invalidateStudentCourseAccess();
        try {
          const pdf = await fetchBaneseBoletoDocument(String(receivableId || ''));
          if (!renderPdfInPaymentWindow(checkoutWindow, pdf)) {
            throw new Error('O navegador bloqueou a nova aba do boleto.');
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Não foi possível abrir o boleto Banese.';
          renderPaymentWindowError(checkoutWindow, message);
          setEadPaymentPanel({ url, payment, matriculaId, receivableId, alreadyPaid, alreadyPending, awaitingWebhook });
          setCheckoutError(`${message} Use o botão “Abrir boleto” para tentar novamente sem sair do portal.`);
          return;
        }
        if (alreadyPending) {
          setCheckoutError('Você já tinha uma cobrança em aberto para este curso. Reabrimos o boleto existente.');
        }
        return;
      }
      if (payment && usesInlinePaymentPanel && paymentMethod === 'PIX') {
        if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.close();
        setEadPaymentPanel({ url, payment, matriculaId, receivableId, alreadyPaid, alreadyPending, awaitingWebhook });
        setCheckoutError(awaitingWebhook
          ? 'Pagamento localizado. O curso será liberado assim que a confirmação bancária canônica for registrada no sistema.'
          : alreadyPending
            ? 'Você já tinha uma cobrança EAD em aberto. Reabrimos os dados de pagamento.'
            : '');
        invalidateStudentCourseAccess();
        return;
      }
      if (alreadyPaid) {
        if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.close();
        setCheckoutError('');
        invalidateStudentCourseAccess();
        return;
      }
      if (sameTab) {
        invalidateStudentCourseAccess();
        window.location.assign(url);
        return;
      }
      if (checkoutWindow && !checkoutWindow.closed) {
        navigatePaymentWindow(checkoutWindow, url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer') || window.location.assign(url);
      }
      if (alreadyPending) setCheckoutError('Você já tinha uma cobrança em aberto para este curso. Reabrimos o link existente.');
      invalidateStudentCourseAccess();
    },
    onError: (error: any, variables) => {
      const message = error?.message || 'Não foi possível iniciar o pagamento deste curso.';
      renderPaymentWindowError(variables?.checkoutWindow || null, message);
      setCheckoutError(message);
      invalidateStudentCourseAccess();
    },
  });

  const startCheckout = (course: any, turma?: any | null, paymentSelection?: CheckoutPaymentSelection) => {
    const isEadCheckout = String(course?.modalidade || '').toUpperCase() === 'EAD';
    const isTechnicalCheckout = String(course?.modalidade || '').toUpperCase() === 'TECNICO';
    if (isTechnicalCheckout) {
      if (loadingTechnicalEnrollmentProfile) {
        setCheckoutError('Estamos conferindo seu perfil antes da matrícula técnica. Tente novamente em alguns segundos.');
        return;
      }
      if (technicalEnrollmentMissingFields.length > 0) {
        setTechnicalProfileGate({ course, missingFields: technicalEnrollmentMissingFields });
        return;
      }
    }
    const paymentMethod = String(paymentSelection?.method || '').toUpperCase();
    const opensBoletoInNewTab = isEadCheckout && paymentMethod === 'BOLETO';
    const checkoutWindow = !isEadCheckout || opensBoletoInNewTab
      ? preparePaymentWindow()
      : null;
    checkoutMutation.mutate({
      course,
      turmaId: turma?.id || null,
      checkoutWindow,
      sameTab: isEadCheckout && !opensBoletoInNewTab,
      paymentSelection,
    });
  };

  const openOnlineClassCheckoutReview = (course: any, turma: any) => {
    if (String(course?.modalidade || '').toUpperCase() === 'TECNICO') {
      if (loadingTechnicalEnrollmentProfile) {
        setCheckoutError('Estamos conferindo seu perfil antes da matrícula técnica. Tente novamente em alguns segundos.');
        return;
      }
      if (technicalEnrollmentMissingFields.length > 0) {
        setTechnicalProfileGate({ course, missingFields: technicalEnrollmentMissingFields });
        return;
      }
    }
    setAcceptedOnlineTerms(false);
    setCheckoutReview({ course, turma });
  };

  const openEadCheckoutReview = (course: any) => {
    const options = resolveEadCheckoutOptions(course);
    const initialMethod = defaultEadCheckoutMethod(options);
    setCheckoutError('');
    setEadPaymentMethod(initialMethod);
    setEadInstallments(initialMethod === 'CREDIT_CARD' ? options.parcelasPadrao : 1);
    setEadCheckoutReview({ course });
  };

  return {
    checkoutError,
    checkoutReview,
    setCheckoutReview,
    technicalProfileGate,
    setTechnicalProfileGate,
    eadCheckoutReview,
    setEadCheckoutReview,
    eadPaymentPanel,
    setEadPaymentPanel,
    eadPaymentConfirmation,
    eadPaymentMethod,
    setEadPaymentMethod,
    eadInstallments,
    setEadInstallments,
    acceptedOnlineTerms,
    setAcceptedOnlineTerms,
    checkoutMutation,
    startCheckout,
    openOnlineClassCheckoutReview,
    openEadCheckoutReview,
  };
};
