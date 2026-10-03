import { formatCentsInput, parseCurrencyToCents } from './renegociacoes.presentation.ts';
import type { PreviewRenegociacaoInput, RenegociacaoPolicyDefaults, RenegociacaoPolicyOverrides, RenegociacaoTerms } from './renegociacoes.types';

export interface RenegociacaoTermsForm {
  amountMode: 'TARGET' | 'ADJUSTMENTS';
  targetNegotiated: string;
  targetDirty: boolean;
  commercialDiscount: string;
  downPayment: string;
  installmentCount: string;
  firstDueDate: string;
  cadence: 'MONTHLY' | 'FIXED_DAYS';
  intervalDays: string;
  customPunctual: boolean;
  customInterest: boolean;
  customPenalty: boolean;
  punctualDiscount: string;
  monthlyInterest: string;
  penalty: string;
  waivedInterest: string;
  waivedPenalty: string;
}

export const initialTermsForm = (): RenegociacaoTermsForm => ({
  amountMode: 'TARGET', targetNegotiated: '', targetDirty: false,
  commercialDiscount: '0,00', downPayment: '0,00', installmentCount: '1', firstDueDate: '',
  cadence: 'MONTHLY', intervalDays: '30', customPunctual: false, customInterest: false, customPenalty: false,
  punctualDiscount: '0,00', monthlyInterest: '0', penalty: '0,00', waivedInterest: '0,00', waivedPenalty: '0,00',
});

export const applyTermsDefaults = (form: RenegociacaoTermsForm, defaults: RenegociacaoPolicyDefaults): RenegociacaoTermsForm => ({
  ...form,
  punctualDiscount: form.customPunctual ? form.punctualDiscount : formatCentsInput(defaults.punctualDiscount.amountCents),
  monthlyInterest: form.customInterest ? form.monthlyInterest : String(defaults.monthlyInterest.basisPoints / 100).replace('.', ','),
  penalty: form.customPenalty ? form.penalty : defaults.penalty.kind === 'PERCENTAGE'
    ? String((defaults.penalty.basisPoints || 0) / 100).replace('.', ',')
    : formatCentsInput(defaults.penalty.amountCents || 0),
});

const basisPoints = (value: string) => {
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(value.trim())) return Number.NaN;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : Number.NaN;
};

export const termsFormError = (form: RenegociacaoTermsForm, defaults?: RenegociacaoPolicyDefaults | null): string | null => {
  if (!defaults) return 'As regras financeiras precisam ser conferidas antes de continuar.';
  if (form.amountMode === 'TARGET' && parseCurrencyToCents(form.targetNegotiated) <= 0)
    return 'Informe o total do acordo, já incluindo a entrada.';
  const count = Number(form.installmentCount);
  if (!form.installmentCount.trim() || !Number.isInteger(count) || count < 0 || count > 60)
    return 'Informe de 0 a 60 novas parcelas. Use zero somente quando a entrada cobrir todo o acordo.';
  if (count > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(form.firstDueDate)) return 'Informe o primeiro vencimento das novas parcelas.';
  if (count > 0 && form.cadence === 'FIXED_DAYS' && (!/^\d+$/.test(form.intervalDays) || Number(form.intervalDays) < 1 || Number(form.intervalDays) > 365))
    return 'Informe um intervalo inteiro de 1 a 365 dias.';
  if (form.customInterest && !Number.isFinite(basisPoints(form.monthlyInterest)))
    return 'Informe juros mensais válidos, com até duas casas decimais.';
  if (form.customPenalty && defaults.penalty.kind === 'PERCENTAGE' && !Number.isFinite(basisPoints(form.penalty)))
    return 'Informe uma multa percentual válida, com até duas casas decimais.';
  return null;
};

export const buildTermsInput = (
  form: RenegociacaoTermsForm,
  defaults: RenegociacaoPolicyDefaults,
  selectedIds: string[],
  asOf?: string | null,
): PreviewRenegociacaoInput | null => {
  if (!selectedIds.length || termsFormError(form, defaults)) return null;
  const count = Number(form.installmentCount);
  const terms: RenegociacaoTerms = {
    ...(form.amountMode === 'TARGET'
      ? { targetNegotiatedCents: parseCurrencyToCents(form.targetNegotiated) }
      : { commercialDiscountCents: parseCurrencyToCents(form.commercialDiscount) }),
    downPaymentCents: parseCurrencyToCents(form.downPayment), installmentCount: count, cadence: count > 0 ? form.cadence : 'MONTHLY',
    ...(count > 0 ? { firstDueDate: form.firstDueDate } : {}),
    ...(count > 0 && form.cadence === 'FIXED_DAYS' ? { intervalDays: Number(form.intervalDays) } : {}),
  };
  const policyOverrides: RenegociacaoPolicyOverrides = {};
  if (form.customPunctual) policyOverrides.punctualDiscountCents = parseCurrencyToCents(form.punctualDiscount);
  if (form.customInterest) policyOverrides.monthlyInterestBasisPoints = basisPoints(form.monthlyInterest);
  if (form.customPenalty) policyOverrides.penalty = defaults.penalty.kind === 'PERCENTAGE'
    ? { kind: 'PERCENTAGE', basisPoints: basisPoints(form.penalty) }
    : { kind: 'FIXED_CENTS', amountCents: parseCurrencyToCents(form.penalty) };
  const waivedInterestCents = parseCurrencyToCents(form.waivedInterest);
  const waivedPenaltyCents = parseCurrencyToCents(form.waivedPenalty);
  if (waivedInterestCents) policyOverrides.waivedInterestCents = waivedInterestCents;
  if (waivedPenaltyCents) policyOverrides.waivedPenaltyCents = waivedPenaltyCents;
  return { receivableIds: [...selectedIds], terms, policyOverrides, asOf: asOf || null };
};
