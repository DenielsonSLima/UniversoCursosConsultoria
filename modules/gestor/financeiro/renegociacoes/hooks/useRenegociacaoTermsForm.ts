import { useEffect, useState } from 'react';
import type { RenegociacaoPolicyDefaults } from '../renegociacoes.types';
import { applyTermsDefaults, initialTermsForm, type RenegociacaoTermsForm } from '../renegociacoes.terms-form';
import { formatCentsInput } from '../renegociacoes.presentation';

export const useRenegociacaoTermsForm = (defaults?: RenegociacaoPolicyDefaults | null, grossDebtCents?: number) => {
  const [form, setForm] = useState(initialTermsForm);
  useEffect(() => {
    if (defaults) setForm((current) => applyTermsDefaults(current, defaults));
  }, [defaults]);
  useEffect(() => {
    setForm((current) => current.targetDirty
      ? current : { ...current, targetNegotiated: grossDebtCents === undefined ? '' : formatCentsInput(grossDebtCents) });
  }, [grossDebtCents]);
  const setField = <K extends keyof RenegociacaoTermsForm>(field: K, value: RenegociacaoTermsForm[K]) => {
    setForm((current) => {
      const next = { ...current, [field]: value, ...(field === 'targetNegotiated' ? { targetDirty: true } : {}) };
      return defaults ? applyTermsDefaults(next, defaults) : next;
    });
  };
  return { form, setField };
};
