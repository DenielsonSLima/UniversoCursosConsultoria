import React from 'react';
import type { TurmaPlanoUnicoStep, TurmaPlanoUnicoTheme } from './turma-plano-unico-form.types';

interface TurmaPlanoUnicoStepperProps {
  currentStep: number;
  steps: TurmaPlanoUnicoStep[];
  theme: TurmaPlanoUnicoTheme;
}

const TurmaPlanoUnicoStepper: React.FC<TurmaPlanoUnicoStepperProps> = ({ currentStep, steps, theme }) => {
  const progress = steps.length > 1 ? (currentStep / (steps.length - 1)) * 100 : 100;

  return (
    <nav aria-label="Etapas de abertura da turma" className="shrink-0 border-y border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-8">
      <div className="relative mx-auto max-w-3xl">
        <div className="absolute left-3 right-3 top-3 h-px bg-slate-200" aria-hidden="true" />
        <div
          className={`absolute left-3 top-3 h-px ${theme.accentStepBg} transition-all duration-300`}
          style={{ width: `calc((100% - 1.5rem) * ${progress / 100})` }}
          aria-hidden="true"
        />
        <ol className="relative grid grid-cols-3 gap-1">
          {steps.map((step, index) => {
            const isCurrent = index === currentStep;
            const isDone = index < currentStep;
            return (
              <li key={step.id} aria-current={isCurrent ? 'step' : undefined} className="min-w-0 text-center">
                <span
                  className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-black transition ${
                    isCurrent || isDone
                      ? `${theme.accentStepBg} border-transparent text-white`
                      : 'border-slate-200 bg-white text-slate-400'
                  }`}
                >
                  {index + 1}
                </span>
                <span className={`mt-2 block truncate text-[9px] font-black uppercase tracking-wide sm:text-[10px] ${isCurrent ? theme.accentStepText : isDone ? 'text-slate-600' : 'text-slate-400'}`}>
                  <span className="sm:hidden">{step.shortLabel}</span>
                  <span className="hidden sm:inline">{step.label}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
};

export default TurmaPlanoUnicoStepper;
