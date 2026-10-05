export interface PublicCheckoutResult {
  url: string;
  presentation?: 'BOLETO' | 'PIX';
  presentationFallbackReason?: 'PIX_UNAVAILABLE_USE_BOLETO';
  alreadyPaid?: boolean;
  alreadyPending?: boolean;
  awaitingWebhook?: boolean;
  awaitingConfirmation?: boolean;
  paymentReviewRequired?: boolean;
  attemptId?: string;
  matriculaId?: string;
  receivableId?: string;
  payment?: {
    id?: string | null;
    provider?: string | null;
    method?: string | null;
    installments?: number | null;
    status?: string | null;
    value?: number | null;
    displayValue?: string | null;
    dueDate?: string | null;
    invoiceUrl?: string | null;
    bankSlipUrl?: string | null;
    courseName?: string | null;
    recipient?: { name?: string | null; document?: string | null } | null;
    pixQrCode?: {
      encodedImage?: string | null;
      payload?: string | null;
      expirationDate?: string | null;
    } | null;
  };
}
