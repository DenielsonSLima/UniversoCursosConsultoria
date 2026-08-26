import type {
  CheckoutPaymentSelection,
  StudentEadPaymentOption,
} from '../../asaas/asaas.service';

export const buildAlunoEadCheckoutSelection = (
  option: StudentEadPaymentOption,
): CheckoutPaymentSelection => ({
  method: option.checkoutMethod,
  installments: 1,
  ...(option.presentation ? { presentation: option.presentation } : {}),
});

export const isInlineAlunoBolePix = (
  option: StudentEadPaymentOption,
  returnedMethod: unknown,
  returnedPresentation: unknown,
  pixQrCode?: { payload?: unknown; encodedImage?: unknown } | null,
) => option.presentation === 'PIX'
  && String(returnedMethod || '').toUpperCase() === 'BOLETO'
  && String(returnedPresentation || '').toUpperCase() === 'PIX'
  && Boolean(
    String(pixQrCode?.payload || '').trim()
      || String(pixQrCode?.encodedImage || '').trim(),
  );

export const isAlunoEadBolePixFallback = (
  option: StudentEadPaymentOption,
  returnedMethod: unknown,
  returnedPresentation: unknown,
  pixQrCode?: { payload?: unknown; encodedImage?: unknown } | null,
) => option.presentation === 'PIX'
  && String(returnedMethod || '').toUpperCase() === 'BOLETO'
  && ['PIX', 'BOLETO'].includes(
    String(returnedPresentation || '').toUpperCase(),
  )
  && !(
    String(pixQrCode?.payload || '').trim()
      || String(pixQrCode?.encodedImage || '').trim()
  );

export const matchesAlunoEadCheckoutReceivable = (
  expectedReceivableId: unknown,
  returnedReceivableId: unknown,
) => Boolean(expectedReceivableId)
  && String(returnedReceivableId || '') === String(expectedReceivableId);
