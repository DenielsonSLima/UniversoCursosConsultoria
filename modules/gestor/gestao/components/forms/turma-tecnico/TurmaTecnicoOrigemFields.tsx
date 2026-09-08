import React from 'react';
import { TURMA_TECNICO_FINANCIAL_STATE_OPTIONS } from './turma-tecnico-form.constants';
import { selectTurmaTecnicoOrigem } from './turma-tecnico-origem';
import type { TurmaTecnicoFormData } from './turma-tecnico-form.types';

export default function TurmaTecnicoOrigemFields({ formData, onChange }: {
  formData: TurmaTecnicoFormData;
  onChange: (patch: Partial<TurmaTecnicoFormData>) => void;
}) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 p-4">
      <legend className="px-2 text-xs font-black uppercase text-[#001a33]">Como deseja cadastrar a turma?</legend>
      <p className="text-xs text-slate-500">Escolha antes de configurar os valores. Criar a turma ou adicionar alunos não emite cobranças.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {TURMA_TECNICO_FINANCIAL_STATE_OPTIONS.map((option) => (
          <label key={option.value} className="cursor-pointer rounded-xl border border-slate-200 p-4 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 has-[:focus-visible]:ring-2">
            <input type="radio" name="estado-financeiro-inicial" value={option.value}
              checked={formData.estadoFinanceiroInicial === option.value}
              onChange={() => onChange(selectTurmaTecnicoOrigem(option.value))}
              className="mr-2 accent-blue-600" />
            <span className="text-[10px] font-bold uppercase text-blue-700">{option.eyebrow}</span>
            <span className="mt-2 block text-xs font-black text-[#001a33]">{option.title}</span>
            <span className="mt-2 block text-xs leading-relaxed text-slate-600">{option.description}</span>
            <span className="mt-3 block text-xs font-bold text-blue-800">{option.nextAction}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
