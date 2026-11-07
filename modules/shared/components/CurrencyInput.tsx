import React, { useEffect, useState } from 'react';
import {
  currencyInputToCents,
  formatCentsAsCurrencyInput,
  sanitizeCurrencyInput,
} from '../utils/currency-input';

type CurrencyInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number;
  onValueChange: (value: number) => void;
  prefix?: string;
};

/** Collects centavo-based typing while preserving the form's numeric contract. */
const CurrencyInput: React.FC<CurrencyInputProps> = ({ value, onValueChange, prefix = '', onFocus, onBlur, ...props }) => {
  const cents = Math.round((Number.isFinite(value) ? Math.max(0, value) : 0) * 100);
  const [text, setText] = useState(() => formatCentsAsCurrencyInput(cents));
  useEffect(() => {
    setText((current) => (currencyInputToCents(current) ?? 0) === cents
      ? current : formatCentsAsCurrencyInput(cents));
  }, [cents]);

  return <input {...props} type="text" inputMode="decimal" autoComplete="off"
    value={text ? `${prefix}${text}` : ''}
    onFocus={(event) => { event.currentTarget.select(); onFocus?.(event); }}
    onChange={(event) => {
      const raw = prefix && event.target.value.startsWith(prefix) ? event.target.value.slice(prefix.length) : event.target.value;
      const next = sanitizeCurrencyInput(raw, text);
      setText(next);
      onValueChange((currencyInputToCents(next) ?? 0) / 100);
    }}
    onBlur={(event) => {
      setText(formatCentsAsCurrencyInput(cents));
      onBlur?.(event);
    }} />;
};

export default CurrencyInput;
