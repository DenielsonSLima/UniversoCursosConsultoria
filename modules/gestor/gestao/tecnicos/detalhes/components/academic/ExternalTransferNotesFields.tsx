import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { ExternalCreditDraft, ExternalTransferDraft } from './external-transfer-draft';
import type { ExternalTransferModule } from './external-transfer-grade';

interface Props {
  draft: ExternalTransferDraft;
  onChange: <K extends keyof ExternalTransferDraft>(field: K, value: ExternalTransferDraft[K]) => void;
  modules: ExternalTransferModule[];
  loading: boolean;
  error: string | null;
  disabled: boolean;
  onRetry: () => void;
}
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-violet-500';
const emptyCredit = (): ExternalCreditDraft => ({ selected: false, mediaFinal: '', frequenciaPercent: '', situacao: 'EQUIVALENCIA' });
const creditStatuses: Array<{ value: ExternalCreditDraft['situacao']; label: string }> = [
  { value: 'EQUIVALENCIA', label: 'Equivalência' },
  { value: 'APROVEITADO', label: 'Aproveitado' },
  { value: 'DISPENSADO', label: 'Dispensado' },
];

const ExternalTransferNotesFields: React.FC<Props> = ({ draft, onChange, modules, loading, error, disabled, onRetry }: Props) => {
  const updateCredit = (id: string, patch: Partial<ExternalCreditDraft>) => onChange('credits', {
    ...draft.credits, [id]: { ...(draft.credits[id] || emptyCredit()), ...patch },
  });
  const count = modules.reduce((total, module) => total + module.disciplinas.length, 0);
  const disciplineIds = new Set(modules.flatMap((module) => module.disciplinas.map((discipline) => discipline.id)));
  const hasUnavailableCredit = Object.entries(draft.credits).some(([id, credit]) => credit.selected && !disciplineIds.has(id));
  return <fieldset disabled={disabled} className="space-y-4">
    <div className="flex gap-2 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-violet-800">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div><h4 className="text-xs font-black uppercase">Notas e aproveitamentos</h4>
        <p className="mt-1 text-xs">A grade abaixo é do nosso curso de destino. Marque as disciplinas com equivalência aprovada pela escola anterior. Média e frequência são opcionais; as demais continuam na turma.</p>
      </div>
    </div>
    {error ? <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-xs text-red-700">
      <p>{error}</p>
      <button type="button" onClick={onRetry} disabled={loading} className="mt-2 font-bold underline">Recarregar grade</button>
    </div> : loading ? <p role="status" className="flex items-center gap-2 text-xs text-violet-700">
      <Loader2 size={14} className="animate-spin" />Carregando módulos e disciplinas...
    </p> : <>
      <p className="text-xs font-bold text-slate-500">{modules.length} módulos · {count} disciplinas</p>
      {hasUnavailableCredit && <div role="alert" className="rounded-xl bg-amber-50 p-4 text-xs text-amber-800">
        <p>Há aproveitamentos selecionados fora da grade atual. Confira a matriz antes de continuar.</p>
        <button type="button" onClick={() => onChange('credits', Object.fromEntries(Object.entries(draft.credits).filter(([id]) => disciplineIds.has(id))))}
          className="mt-2 font-bold underline">Remover somente os aproveitamentos fora da grade</button>
      </div>}
      {count === 0 && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
        <p>A matriz do curso de destino está sem disciplinas. Você pode seguir sem aproveitamentos ou conferir a Grade da turma.</p>
        <button type="button" onClick={onRetry} className="mt-2 font-bold underline">Recarregar grade</button>
      </div>}
      {modules.map((module) => <section key={module.id} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h4 className="text-sm font-black text-[#001a33]">{module.nome}</h4>
        {module.disciplinas.length === 0 && <p className="text-xs text-slate-500">Este módulo não possui disciplinas cadastradas.</p>}
        {module.disciplinas.map((discipline) => {
          const credit = draft.credits[discipline.id] || emptyCredit();
          return <div key={discipline.id} className="rounded-xl border border-violet-100 bg-white p-3">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <input type="checkbox" checked={credit.selected} onChange={(event) => updateCredit(discipline.id, { selected: event.target.checked })} />
              <span>{discipline.nome}</span><span className="ml-auto whitespace-nowrap text-[10px] text-slate-400">{discipline.cargaHoraria}h</span>
            </label>
            {credit.selected && <div className="mt-3 space-y-3">
              <div role="group" aria-label={`Situação de ${discipline.nome}`} className="flex flex-wrap gap-2">
                {creditStatuses.map((status) => <button key={status.value} type="button" aria-pressed={credit.situacao === status.value}
                  onClick={() => updateCredit(discipline.id, { situacao: status.value })}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold ${credit.situacao === status.value ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-slate-200 text-slate-600'}`}>{status.label}</button>)}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-slate-600">Média final (0 a 10)
                  <input type="number" min={0} max={10} step={0.1} className={inputClass} value={credit.mediaFinal} onChange={(event) => updateCredit(discipline.id, { mediaFinal: event.target.value })} />
                </label>
                <label className="space-y-1 text-xs text-slate-600">Frequência (%)
                  <input type="number" min={0} max={100} step={0.01} className={inputClass} value={credit.frequenciaPercent} onChange={(event) => updateCredit(discipline.id, { frequenciaPercent: event.target.value })} />
                </label>
              </div>
            </div>}
          </div>;
        })}
      </section>)}
    </>}
  </fieldset>;
};
export default ExternalTransferNotesFields;
