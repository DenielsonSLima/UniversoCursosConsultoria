import React from 'react';
import { Building2, Check, ClipboardCheck, KeyRound, Megaphone, WalletCards } from 'lucide-react';
import type { TurmaTecnicoStep } from './turma-tecnico-form.types';

interface TurmaTecnicoStepperProps {
  currentStep: number;
  steps: TurmaTecnicoStep[];
}

const icons = [Building2, Megaphone, WalletCards, KeyRound, ClipboardCheck];

const TurmaTecnicoStepper: React.FC<TurmaTecnicoStepperProps> = ({ currentStep, steps }) => (
  <nav aria-label="Etapas de criação da turma" className="border-y border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-7">
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((step, index) => {
        const Icon = icons[index];
        const isCurrent = index === currentStep;
        const isComplete = index < currentStep;
        return (
          <li key={step.id} aria-current={isCurrent ? 'step' : undefined} className="relative min-w-0">
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={`absolute right-1/2 top-4 h-px w-full -translate-y-1/2 ${isComplete || isCurrent ? 'bg-emerald-400' : 'bg-slate-200'}`}
              />
            ) : null}
            <div className="relative z-10 flex flex-col items-center text-center">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                isComplete
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : isCurrent
                    ? 'border-[#001a33] bg-[#001a33] text-white shadow-md shadow-slate-900/15'
                    : 'border-slate-200 bg-white text-slate-400'
              }`}>
                {isComplete ? <Check size={15} strokeWidth={3} /> : <Icon size={14} />}
              </span>
              <span className={`mt-2 truncate text-[9px] font-black uppercase tracking-wide sm:text-[10px] ${
                isCurrent ? 'text-[#001a33]' : isComplete ? 'text-emerald-700' : 'text-slate-400'
              }`}>
                {step.shortLabel}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  </nav>
);

export default TurmaTecnicoStepper;
