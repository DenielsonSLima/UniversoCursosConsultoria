export type EadCheckoutPaymentMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD';

export interface EadCheckoutPaymentOption {
  method: EadCheckoutPaymentMethod;
  label: string;
}

export type EadCheckoutPresentation = 'BOLETO' | 'PIX';

export interface EadCheckoutSubmission {
  method: EadCheckoutPaymentMethod;
  installments: number;
  presentation?: EadCheckoutPresentation;
}

export interface EadCheckoutOptions {
  amount: number;
  parcelasPadrao: number;
  maxParcelas: number;
  allowInstallments: boolean;
  options: EadCheckoutPaymentOption[];
}

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampInstallments = (value: number, max: number) =>
  Math.max(1, Math.min(max, Math.floor(value || 1)));

const EAD_CARD_CHECKOUT_TEMPORARILY_DISABLED = true;

export const formatEadCheckoutMoney = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export const resolveEadCheckoutOptions = (course: any): EadCheckoutOptions => {
  const financeiroConfig = course?.financeiro_config || {};
  const metodos = financeiroConfig.metodosRecebimento || {};
  const cartao = financeiroConfig.cartao || {};
  const cardEnabled = !EAD_CARD_CHECKOUT_TEMPORARILY_DISABLED
    && metodos.cartao !== false
    && cartao.aceitar !== false;
  const parcelasPadrao = Math.max(1, toNumber(financeiroConfig.parcelasPadrao, 1));
  const configuredMaxParcelas = cardEnabled
    ? Math.max(parcelasPadrao, toNumber(cartao.maxParcelas, parcelasPadrao))
    : 1;
  const maxParcelas = clampInstallments(configuredMaxParcelas, 21);
  const options: EadCheckoutPaymentOption[] = [];

  // As duas apresentações usam o mesmo título BolePix. A escolha "Pix" muda
  // apenas a experiência do aluno; o backend continua registrando um boleto
  // Banese único e devolve o QR oficial vinculado a ele.
  if (metodos.boleto !== false) {
    options.push({ method: 'BOLETO', label: 'Boleto com Pix' });
    options.push({ method: 'PIX', label: 'Pix' });
  }
  if (cardEnabled) options.push({ method: 'CREDIT_CARD', label: 'Cartão' });

  return {
    amount: toNumber(course?.valor, 0),
    parcelasPadrao: clampInstallments(parcelasPadrao, maxParcelas),
    maxParcelas,
    allowInstallments: cardEnabled && maxParcelas > 1,
    options,
  };
};

export const defaultEadCheckoutMethod = (options: EadCheckoutOptions): EadCheckoutPaymentMethod =>
  options.options[0]?.method || 'PIX';

export const buildEadCheckoutSubmission = (
  method: EadCheckoutPaymentMethod,
  installments = 1,
): EadCheckoutSubmission => {
  if (method === 'PIX') {
    return {
      method: 'BOLETO',
      installments: 1,
      presentation: 'PIX',
    };
  }
  if (method === 'BOLETO') {
    return {
      method: 'BOLETO',
      installments: 1,
      presentation: 'BOLETO',
    };
  }
  return {
    method: 'CREDIT_CARD',
    installments: Math.max(1, Math.floor(installments || 1)),
  };
};
