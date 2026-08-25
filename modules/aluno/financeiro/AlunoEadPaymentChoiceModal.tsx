import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CreditCard, FileText, X, Zap } from 'lucide-react';

import {
  formatAlunoFinancialCurrency,
  formatAlunoFinancialDate,
} from './financeiro.presentation';
import type {
  AlunoEadPaymentMethod,
  AlunoFinancialItem,
} from './financeiro.types';

interface AlunoEadPaymentChoiceModalProps {
  item: AlunoFinancialItem;
  method: AlunoEadPaymentMethod;
  isStarting: boolean;
  onMethodChange: (method: AlunoEadPaymentMethod) => void;
  onClose: () => void;
  onStart: () => void;
}

const paymentMethods = [
  { method: 'PIX' as const, label: 'Pix', icon: Zap },
  { method: 'BOLETO' as const, label: 'Boleto', icon: FileText },
  { method: 'CREDIT_CARD' as const, label: 'Cartão', icon: CreditCard },
];

const AlunoEadPaymentChoiceModal: React.FC<AlunoEadPaymentChoiceModalProps> = ({
  item,
  method,
  isStarting,
  onMethodChange,
  onClose,
  onStart,
}) => {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLElement>('[data-finance-modal-close]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isStarting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [isStarting, onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex h-dvh w-screen items-end justify-center overflow-hidden bg-slate-950/70 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm md:items-center md:p-4"
      onClick={onClose}
    >
      <section
        ref={dialogRef}
        className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-t-[1.75rem] border border-white/20 bg-white shadow-2xl md:max-h-[calc(100dvh-2rem)] md:rounded-[1.75rem]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ead-payment-choice-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 md:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">Pagamento EAD</p>
            <h3 id="ead-payment-choice-title" className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33] md:text-xl">
              Escolha como pagar
            </h3>
            <p className="mt-1 text-xs font-bold leading-relaxed text-slate-500">
              O curso será liberado somente após a confirmação bancária canônica.
            </p>
          </div>
          <button
            data-finance-modal-close
            type="button"
            onClick={onClose}
            disabled={isStarting}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-100 text-slate-400 disabled:opacity-50"
            aria-label="Fechar escolha de pagamento"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 md:px-5">
          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Curso</p>
            <p className="mt-1 text-sm font-black text-[#001a33]">{item.cursoNome || item.descricao}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Saldo</p>
                <p className="mt-1 text-lg font-black text-[#001a33]">
                  {formatAlunoFinancialCurrency(item.financialSummary.highlightValue)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vencimento</p>
                <p className="mt-1 text-lg font-black text-[#001a33]">
                  {formatAlunoFinancialDate(item.data_vencimento)}
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {paymentMethods.map((option) => {
              const Icon = option.icon;
              const active = method === option.method;
              return (
                <button
                  key={option.method}
                  type="button"
                  onClick={() => onMethodChange(option.method)}
                  disabled={isStarting}
                  className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-60 ${active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                >
                  <Icon size={15} /> {option.label}
                </button>
              );
            })}
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs font-bold leading-relaxed text-blue-700">
            A forma escolhida usa a rota bancária configurada para este curso.
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={isStarting} className="min-h-12 rounded-xl border border-slate-200 px-4 text-[10px] font-black uppercase tracking-widest text-slate-600">
              Fechar
            </button>
            <button type="button" onClick={onStart} disabled={isStarting} className="min-h-12 rounded-xl bg-emerald-600 px-5 text-[10px] font-black uppercase tracking-widest text-white disabled:bg-slate-300">
              {isStarting ? 'Preparando...' : 'Continuar pagamento'}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default AlunoEadPaymentChoiceModal;
