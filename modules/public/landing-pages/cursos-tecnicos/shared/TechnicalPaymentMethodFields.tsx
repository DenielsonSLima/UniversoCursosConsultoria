import React from 'react';
import { Banknote, CreditCard, QrCode } from 'lucide-react';
import type { TechnicalPaymentMethod } from '../technicalLanding.types';

interface TechnicalPaymentMethodFieldsProps {
  value: TechnicalPaymentMethod | '';
  onChange: (value: TechnicalPaymentMethod) => void;
  methods: TechnicalPaymentMethod[];
  disabled?: boolean;
}

const METHODS = [
  { value: 'PIX', label: 'Pix', description: 'Pagamento rápido', icon: QrCode },
  { value: 'BOLETO', label: 'Boleto', description: 'Vencimento informado no checkout', icon: Banknote },
  { value: 'CREDIT_CARD', label: 'Cartão', description: 'Conforme disponibilidade bancária', icon: CreditCard },
] as const;

const TechnicalPaymentMethodFields: React.FC<TechnicalPaymentMethodFieldsProps> = ({
  value,
  onChange,
  methods,
  disabled = false,
}) => methods.length > 0 ? (
  <fieldset disabled={disabled}>
    <legend className="text-sm font-black uppercase tracking-wider text-[#001a33]">Forma de pagamento</legend>
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      {METHODS.filter((method) => methods.includes(method.value)).map((method) => {
        const Icon = method.icon;
        const selected = value === method.value;
        return (
          <label
            key={method.value}
            className={`cursor-pointer rounded-2xl border p-3 transition ${selected
              ? 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-100'
              : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'}`}
          >
            <input
              type="radio"
              name="technical-payment-method"
              value={method.value}
              checked={selected}
              onChange={() => onChange(method.value)}
              className="sr-only"
            />
            <Icon size={18} className={selected ? 'text-blue-600' : 'text-slate-400'} />
            <span className="mt-2 block text-xs font-black">{method.label}</span>
            <span className="mt-1 block text-[10px] font-semibold leading-snug text-slate-400">{method.description}</span>
          </label>
        );
      })}
    </div>
  </fieldset>
) : (
  <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800">
    Esta turma ainda não possui uma forma de pagamento online disponível. Procure a secretaria.
  </p>
);

export default TechnicalPaymentMethodFields;
