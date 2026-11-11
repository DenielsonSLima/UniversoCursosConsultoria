import React from 'react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import type { AmountBase, NfseAmountRule } from './services/nfse-model-values.types';

export function NfseValuesChoice({ id, label, value, options, onChange, required = true, disabled = false }: {
  id: string; label: string; value: string | null;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void; required?: boolean; disabled?: boolean;
}) {
  return <div className="nfse-field"><label htmlFor={id}>{label}{required && <span className="nfse-model-required"> *</span>}</label>
    <InstitutionalSelect id={id} ariaLabel={label} value={value || ''} options={options} required={required} disabled={disabled}
      onValueChange={next => { if (options.some(option => option.value === next && !option.disabled)) onChange(next); }} />
  </div>;
}

function moneyDisplay(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  return `${whole.replace(/\B(?=([0-9]{3})+(?![0-9]))/g, '.')},${fraction.padEnd(2, '0')}`;
}
/** Centavo typing preserves the canonical string, including values beyond Number precision. */
export function NfseValuesDecimalField({ id, label, value, onChange, kind = 'MONEY', required = true }: {
  id: string; label: string; value: string | null; onChange: (value: string | null) => void;
  kind?: 'MONEY' | 'PERCENT'; required?: boolean;
}) {
  return <label className="nfse-field" htmlFor={id}><span>{label}{required && <span className="nfse-model-required"> *</span>}</span>
    <input id={id} type="text" inputMode="decimal" autoComplete="off" required={required}
      value={value === null ? '' : kind === 'MONEY' ? moneyDisplay(value) : value.replace('.', ',')}
      placeholder={kind === 'MONEY' ? '0,00' : '0,00 %'} onFocus={event => event.currentTarget.select()}
      onChange={event => {
        const raw = event.target.value;
        if (raw === '') { onChange(null); return; }
        if (kind === 'PERCENT') {
          const next = raw.replace(',', '.');
          if (/^(0|[1-9][0-9]{0,2})(\.[0-9]{0,2})?$/.test(next)) onChange(next);
          return;
        }
        const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=[0-9])/, '');
        if (!digits || digits.length > 17) return;
        const padded = digits.padStart(3, '0');
        onChange(`${padded.slice(0, -2)}.${padded.slice(-2)}`);
      }} />
  </label>;
}

export default function NfseModelAmountRuleField({ id, label, value, onChange, base = 'SERVICE', required = false,
  allowNone = true, noneLabel = 'Não aplicar', help }: {
  id: string; label: string; value: NfseAmountRule; onChange: (value: NfseAmountRule) => void;
  base?: AmountBase; required?: boolean; allowNone?: boolean; noneLabel?: string; help?: string;
}) {
  const choices = [...(allowNone ? [{ value: 'NONE', label: noneLabel }] : []),
    { value: 'FIXED', label: 'Valor fixo' }, { value: 'PERCENTAGE', label: 'Percentual da base' }];
  return <div className="nfse-model-grid nfse-wide">
    <NfseValuesChoice id={`${id}-source`} label={label} value={value.source === 'NONE' && !allowNone ? '' : value.source}
      required={required || !allowNone} options={choices} onChange={next => onChange({
        source: next as NfseAmountRule['source'], value: null, base: next === 'PERCENTAGE' ? base : null,
      })} />
    {value.source !== 'NONE' && <NfseValuesDecimalField id={`${id}-value`}
      label={`${label} · ${value.source === 'PERCENTAGE' ? 'percentual' : 'valor (R$)'}`} value={value.value}
      kind={value.source === 'PERCENTAGE' ? 'PERCENT' : 'MONEY'} onChange={amount => onChange({ ...value, value: amount })} />}
    {help && <small className="nfse-wide">{help}</small>}
  </div>;
}
