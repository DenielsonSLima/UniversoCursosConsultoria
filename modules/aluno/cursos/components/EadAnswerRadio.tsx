import React, { type InputHTMLAttributes, type ReactNode } from 'react';

interface EadAnswerRadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'children'> {
  children: ReactNode;
}

/** Mantém o alvo nativo de foco dentro do mesmo retângulo da alternativa. */
export const EadAnswerRadio = ({ children, disabled, ...inputProps }: EadAnswerRadioProps) => (
  <label className={`relative block rounded-xl has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-2 ${
    disabled ? 'cursor-default' : 'cursor-pointer'
  }`}>
    <input
      {...inputProps}
      type="radio"
      disabled={disabled}
      className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
    />
    {children}
  </label>
);
