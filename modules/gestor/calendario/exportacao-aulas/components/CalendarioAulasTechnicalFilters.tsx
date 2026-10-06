import React from 'react';
import type { CalendarioAulasTurmaModulo } from '../types';
import type { CalendarioAulasSelection } from '../calendarioAulasSelection';
import CalendarioAulasPicker from './CalendarioAulasPicker';

interface Props {
  selection: CalendarioAulasSelection;
  modulos: CalendarioAulasTurmaModulo[];
  onChange: (selection: CalendarioAulasSelection) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
}

export default function CalendarioAulasTechnicalFilters({
  selection, modulos, onChange, disabled, loading, error, onRetry,
}: Props) {
  const update = (patch: Partial<CalendarioAulasSelection>) => onChange({ ...selection, ...patch });
  const toggleModule = (id: string) => update({
    moduloIds: selection.moduloIds.includes(id)
      ? selection.moduloIds.filter((selectedId) => selectedId !== id)
      : [...selection.moduloIds, id],
  });

  return (
    <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
      <fieldset disabled={disabled} className="flex flex-wrap gap-2">
        <legend className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Organização do documento</legend>
        {[
          { id: 'MODULO_COMPLETO', label: 'Módulo completo' },
          { id: 'CRONOLOGICO', label: 'Calendário cronológico da turma' },
        ].map((mode) => (
          <label key={mode.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${selection.modoExportacao === mode.id ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
            <input type="radio" name="calendario-aulas-modo" value={mode.id} checked={selection.modoExportacao === mode.id} onChange={() => update({ modoExportacao: mode.id as CalendarioAulasSelection['modoExportacao'] })} className="accent-blue-600" />
            {mode.label}
          </label>
        ))}
      </fieldset>

      {selection.modoExportacao === 'MODULO_COMPLETO' ? (
        <div className="max-w-xl">
          <CalendarioAulasPicker label="Módulo" value={selection.moduloId} options={modulos.map((modulo) => ({ id: modulo.moduloId, label: modulo.moduloNome }))} onChange={(moduloId) => update({ moduloId })} placeholder="Selecione um módulo" disabled={disabled} loading={loading} error={error} onRetry={onRetry} />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <fieldset disabled={disabled || loading || error} className="min-w-0 space-y-2">
            <legend className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Módulos incluídos</legend>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={selection.todosModulos} onChange={(event) => update({ todosModulos: event.target.checked })} className="accent-blue-600" />
              Todos os módulos disponíveis
            </label>
            {loading ? <p role="status" className="text-xs text-slate-500">Carregando módulos...</p> : error ? (
              <p role="alert" className="text-xs text-rose-700">Não foi possível carregar os módulos.</p>
            ) : !modulos.length ? <p role="status" className="text-xs text-slate-500">Nenhum módulo disponível nesta turma.</p> : !selection.todosModulos ? (
              <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                {modulos.map((modulo) => (
                  <label key={modulo.moduloId} className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={selection.moduloIds.includes(modulo.moduloId)} onChange={() => toggleModule(modulo.moduloId)} className="mt-0.5 shrink-0 accent-blue-600" />
                    {modulo.moduloNome}
                  </label>
                ))}
              </div>
            ) : <p className="text-xs leading-relaxed text-slate-500">As aulas de todos os módulos da grade entram em um único documento, na ordem de data e horário.</p>}
          </fieldset>

          <fieldset disabled={disabled} className="space-y-2">
            <legend className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Período</legend>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={selection.definirPeriodo} onChange={(event) => update({ definirPeriodo: event.target.checked })} className="accent-blue-600" />
              Definir datas inicial e final
            </label>
            {selection.definirPeriodo ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  De
                  <input type="date" value={selection.dataInicio} max={selection.dataFim || undefined} onChange={(event) => update({ dataInicio: event.target.value })} className="mt-1.5 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-blue-400" />
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Até
                  <input type="date" value={selection.dataFim} min={selection.dataInicio || undefined} onChange={(event) => update({ dataFim: event.target.value })} className="mt-1.5 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-blue-400" />
                </label>
              </div>
            ) : <p className="text-xs text-slate-500">Todas as aulas programadas, inclusive passadas e futuras.</p>}
          </fieldset>
        </div>
      )}
    </div>
  );
}
