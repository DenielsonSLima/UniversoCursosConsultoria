import React, { useMemo } from 'react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';

export interface NfseFiscalCodeOption { code: string; description: string }

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: readonly NfseFiscalCodeOption[];
  required?: boolean;
  loading: boolean;
  error: boolean;
}

export default function NfseFiscalCodeField({
  id, label, value, onChange, options, required = false, loading, error,
}: Props) {
  const missing = Boolean(value && options && !loading && !error
    && !options.some((option) => option.code === value));
  const choices = useMemo(() => {
    const available = (options || []).map((option) => ({
      value: option.code, label: `${option.code} · ${option.description}`, keywords: option.code,
    }));
    return missing ? [{ value, label: `${value} · Código não encontrado no catálogo`, keywords: value, disabled: true }, ...available] : available;
  }, [options, missing, value]);

  return (
    <div className="nfse-field nfse-wide">
      <label htmlFor={id}>{label}{required && <span className="nfse-model-required" aria-hidden="true"> *</span>}</label>
      <InstitutionalSelect
        id={id}
        ariaLabel={label}
        ariaDescribedBy={missing ? `${id}-validation` : undefined}
        className={missing ? 'nfse-fiscal-code-invalid' : ''}
        value={value}
        options={choices}
        required={required}
        allowClear={!required}
        loading={loading}
        error={error ? 'Não foi possível carregar o catálogo.' : undefined}
        placeholder="Buscar por código ou descrição"
        onValueChange={(nextValue) => {
          if ((!nextValue && !required) || options?.some((option) => option.code === nextValue)) onChange(nextValue);
        }}
      />
      {missing && <small id={`${id}-validation`} className="nfse-model-field-error" role="alert">O código salvo não está neste catálogo. Selecione uma opção{required ? '.' : ' ou limpe o campo.'}</small>}
    </div>
  );
}
