import React from 'react';
import { Banknote, CheckCircle2, CreditCard, QrCode, Sparkles } from 'lucide-react';
import type { TechnicalPaymentMethod } from '../technicalLanding.types';

interface TechnicalPaymentMethodFieldsProps {
  value: TechnicalPaymentMethod | '';
  onChange: (value: TechnicalPaymentMethod) => void;
  methods: TechnicalPaymentMethod[];
  disabled?: boolean;
}

const METHODS = [
  { value: 'PIX', label: 'Pix', description: 'Aprovação instantânea', badge: 'Mais Rápido', icon: QrCode },
  { value: 'CREDIT_CARD', label: 'Cartão de Crédito', description: 'Parcele com segurança', badge: 'Até 12x', icon: CreditCard },
  { value: 'BOLETO', label: 'Boleto Bancário', description: 'Vencimento informado no checkout', badge: null, icon: Banknote },
] as const;

const TechnicalPaymentMethodFields: React.FC<TechnicalPaymentMethodFieldsProps> = ({
  value,
  onChange,
  methods,
  disabled = false,
}) => (methods.length > 0 ? (
  <fieldset disabled={disabled} className="space-y-3">
    <legend className="text-xs font-black uppercase tracking-wider text-[#001a33] flex items-center justify-between w-full">
      <span>Forma de pagamento da matrícula</span>
      <span className="text-[10px] font-bold text-slate-400">Escolha uma opção</span>
    </legend>
    <div className="grid gap-3 sm:grid-cols-3">
      {METHODS.filter((method) => methods.includes(method.value)).map((method) => {
        const Icon = method.icon;
        const selected = value === method.value;
        return (
          <label
            key={method.value}
            className={`relative flex cursor-pointer flex-col justify-between rounded-2xl border p-4 transition-all duration-200 select-none ${
              selected
                ? 'border-blue-600 bg-gradient-to-b from-blue-50/90 to-blue-50/40 text-blue-950 shadow-md ring-2 ring-blue-500/20'
                : 'border-slate-200/80 bg-white text-slate-700 hover:border-blue-300 hover:bg-slate-50/50'
            }`}
          >
            <input
              type="radio"
              name="technical-payment-method"
              value={method.value}
              checked={selected}
              onChange={() => onChange(method.value)}
              className="sr-only"
            />
            <div>
              <div className="flex items-center justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                  selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  <Icon size={18} />
                </div>
                {selected ? (
                  <CheckCircle2 size={18} className="text-blue-600 shrink-0" />
                ) : method.badge ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[8px] font-black uppercase text-emerald-800">
                    <Sparkles size={8} /> {method.badge}
                  </span>
                ) : null}
              </div>
              <span className="mt-3 block text-xs font-black">{method.label}</span>
              <span className="mt-1 block text-[10px] font-semibold leading-snug text-slate-500">{method.description}</span>
            </div>
          </label>
        );
      })}
    </div>
  </fieldset>
) : (
  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900">
    Esta turma ainda não possui uma forma de pagamento online disponível. Procure a secretaria do polo.
  </div>
));

export default TechnicalPaymentMethodFields;
