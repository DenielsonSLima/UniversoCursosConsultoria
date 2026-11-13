import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { NfseScope } from '../../types/nfse.types';
import type { NfseServiceFinancialPreview, NfseServiceFinancialPlan } from '../types/nfse-partner-services.types';
import { nfsePartnerServices } from '../services/nfse-partner-services.service';
import { initialOtherCreditPlanTerms, type OtherCreditPlanTermsForm } from '../../../financeiro/outros-creditos/other-credit-plan.model';
import { currencyInputToCents } from '../../../../shared/utils/currency-input';

export type NfseServicePlanForm = OtherCreditPlanTermsForm & {
  quantity: string; firstDueDate: string;
  periodicity: NfseServiceFinancialPlan['periodicity']; issueBolePix: boolean;
};
const decimalValue = (value: string) => {
  const cents = currencyInputToCents(value);
  return cents === null ? Number.NaN : cents / 100;
};

export function useNfsePartnerFinancialPlan(scope: NfseScope, partnerId: string, amount: string, description: string, categoryId: string) {
  const [form, setForm] = useState<NfseServicePlanForm>(() => ({ ...initialOtherCreditPlanTerms(), quantity: '1',
    interest: '0,00', penalty: '0,00', discount: '0,00',
    firstDueDate: '', periodicity: 'MENSAL_CALENDARIO', issueBolePix: false }));
  const [confirmed, setConfirmed] = useState<{ signature: string; data: NfseServiceFinancialPreview } | null>(null);
  const input = useMemo((): NfseServiceFinancialPlan => ({ installments: Number(form.quantity), firstDueDate: form.firstDueDate,
    categoryId, monthlyInterestPercent: decimalValue(form.interest),
    penaltyPercent: decimalValue(form.penalty), discountType: form.discountType,
    discountValue: decimalValue(form.discount),
    discountDaysBeforeDue: Number(form.discountDays), periodicity: form.periodicity, issueBolePix: form.issueBolePix }), [form, categoryId]);
  const signature = JSON.stringify({ scope, partnerId, amount, description, input });
  const preview = useMutation({ mutationFn: () => nfsePartnerServices.previewFinancialPlan(scope, partnerId, amount, description, input), retry: false });
  const ready = Boolean(partnerId && amount && Number.isInteger(input.installments) && input.installments >= 1 && input.installments <= 60
    && /^\d{4}-\d{2}-\d{2}$/.test(input.firstDueDate) && input.categoryId
    && [input.monthlyInterestPercent, input.penaltyPercent, input.discountValue].every(value => Number.isFinite(value) && value >= 0)
    && input.monthlyInterestPercent < 100 && input.penaltyPercent < 100
    && (input.discountType !== 'PERCENTUAL' || input.discountValue < 100)
    && Number.isInteger(input.discountDaysBeforeDue) && input.discountDaysBeforeDue >= 0 && input.discountDaysBeforeDue <= 60);
  return { form, input, ready, preview, current: confirmed?.signature === signature ? confirmed.data : null,
    change: (patch: Partial<NfseServicePlanForm>) => { setForm(previous => ({ ...previous, ...patch })); preview.reset(); },
    prepare: async () => { const data = await preview.mutateAsync(); setConfirmed({ signature, data }); return data; } };
}
