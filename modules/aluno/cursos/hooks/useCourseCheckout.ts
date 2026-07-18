import { useCallback, useEffect, useState } from 'react';
import { useMutation, type QueryClient } from '@tanstack/react-query';
import type { CheckoutPaymentSelection } from '../../../asaas/asaas.service';
import { paymentCheckoutService } from '../../../asaas/asaas.service';
import type { EadPaymentPanelData } from '../../../ead/components/EadPaymentModal';
import { useEadPaymentConfirmationWatcher } from '../../../ead/hooks/useEadPaymentConfirmationWatcher';
import { defaultEadCheckoutMethod, resolveEadCheckoutOptions } from '../eadCheckoutOptions';
import type { EadCheckoutPaymentMethod } from '../eadCheckoutOptions';
import type { TechnicalProfileGate } from '../cursosPage.types';
import { escapeCheckoutHtml } from '../cursosPage.utils';

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
    onSuccess: ({ url, payment, matriculaId, receivableId, checkoutWindow, sameTab, alreadyPaid, alreadyPending, awaitingWebhook }) => {
      setEadCheckoutReview(null);
      const paymentMethod = String(payment?.method || '').toUpperCase();
      const paymentProvider = String((payment as any)?.provider || 'asaas').toLowerCase();
      const hasPixQrCode = Boolean((payment as any)?.pixQrCode?.payload || (payment as any)?.pixQrCode?.encodedImage);
      const usesInlinePaymentPanel = paymentProvider === 'asaas' || (paymentMethod === 'PIX' && hasPixQrCode);
      if (payment && usesInlinePaymentPanel && ['PIX', 'BOLETO'].includes(paymentMethod)) {
        if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.close();
        if (paymentMethod === 'BOLETO') {
          const boletoUrl = payment.bankSlipUrl || payment.invoiceUrl || url;
          if (boletoUrl) {
            invalidateStudentCourseAccess();
            window.location.assign(boletoUrl);
            return;
          }
        }
        setEadPaymentPanel({ url, payment, matriculaId, receivableId, alreadyPaid, alreadyPending, awaitingWebhook });
        setCheckoutError(awaitingWebhook
          ? 'Pagamento localizado. O curso será liberado assim que o webhook do gateway bancário confirmar no sistema.'
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
        checkoutWindow.opener = null;
        checkoutWindow.location.href = url;
        checkoutWindow.focus();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer') || window.location.assign(url);
      }
      if (alreadyPending) setCheckoutError('Você já tinha uma cobrança em aberto para este curso. Reabrimos o link existente.');
      invalidateStudentCourseAccess();
    },
    onError: (error: any, variables) => {
      const message = error?.message || 'Não foi possível iniciar o pagamento deste curso.';
      if (variables?.checkoutWindow && !variables.checkoutWindow.closed) {
        variables.checkoutWindow.document.title = 'Pagamento não iniciado';
        variables.checkoutWindow.document.body.innerHTML = `
          <main style="font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 48px 24px; color: #0f172a;">
            <p style="margin: 0 0 12px; color: #dc2626; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase;">Pagamento não iniciado</p>
            <h1 style="margin: 0 0 12px; font-size: 28px; line-height: 1.15;">Não foi possível preparar a cobrança.</h1>
            <p style="margin: 0 0 24px; color: #475569; font-size: 15px; line-height: 1.6;">${escapeCheckoutHtml(message)}</p>
            <button onclick="window.close()" style="border: 0; border-radius: 12px; background: #2563eb; color: white; padding: 12px 18px; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; cursor: pointer;">Fechar</button>
          </main>
        `;
        variables.checkoutWindow.focus();
      }
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
    const checkoutWindow = isEadCheckout ? null : window.open('', '_blank');
    if (checkoutWindow) {
      checkoutWindow.document.title = 'Preparando pagamento';
      checkoutWindow.document.body.innerHTML = '<p style="font-family: sans-serif; padding: 24px;">Preparando pagamento...</p>';
    }
    checkoutMutation.mutate({
      course,
      turmaId: turma?.id || null,
      checkoutWindow,
      sameTab: isEadCheckout,
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
