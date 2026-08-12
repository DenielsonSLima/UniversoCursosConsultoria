import React, { useEffect, useState } from 'react';
import { formatCurrencyBRL, parseCurrencyBRLInput } from './turma-plano-unico-form.utils';

interface CurrencyInputProps {
  value: number;
  onValueChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  'aria-label'?: string;
}

const formatEditableCurrencyBRL = (value: number) => new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? Math.max(0, value) : 0);

/**
 * Mantém o valor canônico como número no formulário, mas apresenta moeda
 * brasileira com duas casas fora do estado de edição.
 */
const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onValueChange,
  className,
  disabled = false,
  placeholder,
  'aria-label': ariaLabel,
}) => {
  const [focused, setFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState(() => formatCurrencyBRL(value));

  useEffect(() => {
    if (!focused) setDisplayValue(formatCurrencyBRL(value));
  }, [focused, value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={className}
      disabled={disabled}
      aria-label={ariaLabel}
      value={displayValue}
      placeholder={placeholder}
      onFocus={(event) => {
        const input = event.currentTarget;
        setFocused(true);
        setDisplayValue(formatEditableCurrencyBRL(value));
        window.requestAnimationFrame(() => input.select());
      }}
      onChange={(event) => {
        const nextDisplayValue = event.target.value;
        setDisplayValue(nextDisplayValue);
        onValueChange(parseCurrencyBRLInput(nextDisplayValue));
      }}
      onBlur={(event) => {
        const nextValue = parseCurrencyBRLInput(event.target.value);
        onValueChange(nextValue);
        setFocused(false);
        setDisplayValue(formatCurrencyBRL(nextValue));
      }}
    />
  );
};

export default CurrencyInput;
