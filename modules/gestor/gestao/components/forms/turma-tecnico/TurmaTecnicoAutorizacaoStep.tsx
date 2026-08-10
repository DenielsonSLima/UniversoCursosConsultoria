import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import type { TurmaTecnicoFormData } from './turma-tecnico-form.types';

interface TurmaTecnicoAutorizacaoStepProps {
  formData: TurmaTecnicoFormData;
  onChange: (patch: Partial<TurmaTecnicoFormData>) => void;
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-11 text-sm font-bold text-slate-700 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100';

const TurmaTecnicoAutorizacaoStep: React.FC<TurmaTecnicoAutorizacaoStepProps> = ({ formData, onChange }) => {
  const [showCode, setShowCode] = useState(false);
  const validLength = formData.codigoCondicaoIndividual.length >= 8 && formData.codigoCondicaoIndividual.length <= 32;
  const hasLetter = /[A-Za-z]/.test(formData.codigoCondicaoIndividual);
  const hasNumber = /[0-9]/.test(formData.codigoCondicaoIndividual);
  const confirmationMatches = Boolean(formData.confirmarCodigoCondicaoIndividual)
    && formData.codigoCondicaoIndividual === formData.confirmarCodigoCondicaoIndividual;

  return (
    <section aria-labelledby="authorization-step-title" className="space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-600">Etapa 4</p>
        <h4 id="authorization-step-title" className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">Proteção de condições individuais</h4>
        <p className="mt-1 text-xs font-medium text-slate-500">Este código será solicitado antes de liberar bolsa, incentivo, convênio ou valor especial para um aluno.</p>
      </div>

      <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700"><ShieldCheck size={20} /></span>
          <div>
            <p className="text-xs font-black uppercase text-[#001a33]">Autorização complementar</p>
            <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-600">O código não substitui a permissão financeira do gestor. Ele protege apenas a concessão de uma condição diferente da regra oficial da turma.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-600"><KeyRound size={14} /> Criar código</span>
          <span className="relative block">
            <input
              type={showCode ? 'text' : 'password'}
              autoComplete="new-password"
              value={formData.codigoCondicaoIndividual}
              onChange={(event) => onChange({ codigoCondicaoIndividual: event.target.value })}
              className={inputClass}
              placeholder="Ex.: Bolsa2026"
            />
            <button type="button" onClick={() => setShowCode((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-50" aria-label={showCode ? 'Ocultar código' : 'Mostrar código'}>
              {showCode ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        <label className="space-y-2">
          <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-600"><LockKeyhole size={14} /> Confirmar código</span>
          <input
            type={showCode ? 'text' : 'password'}
            autoComplete="new-password"
            value={formData.confirmarCodigoCondicaoIndividual}
            onChange={(event) => onChange({ confirmarCodigoCondicaoIndividual: event.target.value })}
            className={inputClass}
            placeholder="Digite novamente"
          />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {[
          [validLength, '8 a 32 caracteres'],
          [hasLetter && hasNumber, 'Letra e número'],
          [confirmationMatches, 'Confirmação igual'],
        ].map(([valid, label]) => (
          <div key={String(label)} className={`rounded-xl border px-3 py-2.5 text-[10px] font-black uppercase ${valid ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
            {valid ? '✓' : '○'} {label}
          </div>
        ))}
      </div>

      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[11px] font-semibold leading-relaxed text-amber-900">Depois que a turma for criada, o código não poderá ser consultado. Em Configurações da turma será possível redefini-lo, invalidando o anterior.</p>
    </section>
  );
};

export default TurmaTecnicoAutorizacaoStep;
