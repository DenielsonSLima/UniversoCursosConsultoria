import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { NfseScope } from '../../types/nfse.types';
import type { NfseServiceFinancialPreview, NfseServiceFinancialPlan } from '../types/nfse-partner-services.types';
import { nfsePartnerServices } from '../services/nfse-partner-services.service';
import { initialOtherCreditPlanTerms, type OtherCreditPlanTermsForm } from '../../../financeiro/outros-creditos/other-credit-plan.model';
import { parseCurrencyInput } from '../../../financeiro/outros-creditos/outros-creditos.presentation';

export type NfseServicePlanForm = OtherCreditPlanTermsForm & {
  quantity: string; firstDueDate: string; categoryId: string;
  periodicity: NfseServiceFinancialPlan['periodicity']; issueBolePix: boolean;
};
export function useNfsePartnerFinancialPlan(scope: NfseScope, partnerId: string, amount: string, description: string) {
  const [form, setForm] = useState<NfseServicePlanForm>(() => ({ ...initialOtherCreditPlanTerms(), quantity: '1',
    firstDueDate: '', categoryId: '', periodicity: 'MENSAL_CALENDARIO', issueBolePix: false }));
  const [confirmed, setConfirmed] = useState<{ signature: string; data: NfseServiceFinancialPreview } | null>(null);
  const input = useMemo((): NfseServiceFinancialPlan => ({ installments: Number(form.quantity), firstDueDate: form.firstDueDate,
    categoryId: form.categoryId, monthlyInterestPercent: Number(form.interest.replace(',', '.') || 0),
    penaltyPercent: Number(form.penalty.replace(',', '.') || 0), discountType: form.discountType,
    discountValue: form.discountType === 'FIXO' ? parseCurrencyInput(form.discount) : Number(form.discount.replace(',', '.') || 0),
    discountDaysBeforeDue: Number(form.discountDays), periodicity: form.periodicity, issueBolePix: form.issueBolePix }), [form]);
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
