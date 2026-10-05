export interface EadPurchaseState {
  matriculaId: string;
  cursoId: string;
  turmaId: string;
  poloId?: string;
  attemptId: string;
  receivableId: string;
  inscricaoId: string;
  attemptState: string;
  canRebuy: boolean;
  canPay: boolean;
  reviewRequired: boolean;
}

export const parseEadPurchaseStates = (value: unknown): EadPurchaseState[] => {
  if (!Array.isArray(value)) throw new Error('Não foi possível confirmar o estado das compras EAD.');
  return value.map((item) => {
    if (!item || typeof item !== 'object' ||
      typeof item.cursoId !== 'string' || typeof item.matriculaId !== 'string' ||
      typeof item.attemptState !== 'string' || typeof item.canRebuy !== 'boolean' ||
      typeof item.canPay !== 'boolean' || typeof item.reviewRequired !== 'boolean') {
      throw new Error('O estado da compra EAD retornou dados incompletos.');
    }
    return item as EadPurchaseState;
  });
};

export const getEadPurchaseUi = (purchase?: Pick<EadPurchaseState, 'attemptState' | 'canRebuy' | 'canPay' | 'reviewRequired'> | null) => {
  if (!purchase) return { message: '', label: 'Comprar curso', disabled: false };
  if (purchase.reviewRequired) return {
    message: 'Pagamento em análise. A secretaria está verificando a confirmação ou uma possível duplicidade.',
    label: 'Pagamento em análise', disabled: true,
  };
  if (purchase.attemptState === 'EXPIRED' && purchase.canRebuy) return {
    message: 'Compra expirada. O boleto anterior foi encerrado. Você pode iniciar uma nova compra.',
    label: 'Nova compra', disabled: false,
  };
  if (purchase.attemptState === 'PAID') return {
    message: 'Pagamento confirmado. Estamos atualizando o acesso ao curso.',
    label: 'Pagamento confirmado', disabled: true,
  };
  if (purchase.canPay) return { message: 'Compra aguardando pagamento.', label: 'Continuar pagamento', disabled: false };
  return {
    message: 'Aguardando confirmação. Estamos conferindo a situação do boleto antes de liberar outra compra.',
    label: 'Aguardando confirmação', disabled: true,
  };
};

export const eadPurchaseNeedsRefresh = (purchase?: EadPurchaseState | null, hasAccess = false) =>
  Boolean(purchase && (purchase.attemptState === 'PAID' ? !hasAccess : purchase.attemptState !== 'EXPIRED'));

export const getEadBlockedCheckoutUi = (result?: { awaitingConfirmation?: boolean; paymentReviewRequired?: boolean }) => {
  if (!result?.awaitingConfirmation && !result?.paymentReviewRequired) return null;
  return getEadPurchaseUi({ attemptState: 'PAYMENT_RECOVERY_FENCED', canPay: false, canRebuy: false,
    reviewRequired: result.paymentReviewRequired === true });
};
