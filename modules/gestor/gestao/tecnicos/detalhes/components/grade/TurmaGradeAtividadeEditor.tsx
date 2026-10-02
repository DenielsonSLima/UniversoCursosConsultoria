import React, { useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import type { TurmaAtividadeExtraClasse } from '../../turma-grade.types';
import { validateTurmaAtividadeDraft, type TurmaAtividadeEditDraft } from './turma-grade-atividade.utils';

interface Props {
  atividade: TurmaAtividadeExtraClasse;
  pending: boolean;
  revisionChanged: boolean;
  onSave: (draft: TurmaAtividadeEditDraft) => Promise<void>;
  onCancel: () => void;
}

const TurmaGradeAtividadeEditor: React.FC<Props> = ({ atividade, pending, revisionChanged, onSave, onCancel }) => {
  const [draft, setDraft] = useState<TurmaAtividadeEditDraft>({
    titulo: atividade.titulo,
    prazoEntrega: atividade.prazoEntrega || '',
    horas: String(atividade.cargaHoraria),
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const update = (field: keyof TurmaAtividadeEditDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setValidationError(null);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || revisionChanged) return;
    const error = validateTurmaAtividadeDraft(draft);
    setValidationError(error);
    if (error) return;
    try {
      await onSave(draft);
    } catch {
      // A mutation mostra o erro; o rascunho permanece aberto para correção.
    }
  };
  const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500 disabled:opacity-60';

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3 rounded-xl border border-emerald-200 bg-white p-3" aria-label="Editar atividade extra-classe" onKeyDown={(event) => {
      if (event.key === 'Escape' && !pending) onCancel();
    }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-emerald-900">Editar atividade extra-classe</p>
        <button type="button" onClick={onCancel} disabled={pending} aria-label="Cancelar edição da atividade" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X size={15} /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(160px,1fr)_150px_100px]">
        <label className="space-y-1 text-[10px] font-bold text-slate-600">
          <span>Tema / título</span>
          <input type="text" value={draft.titulo} onChange={(event) => update('titulo', event.target.value)} maxLength={1000} disabled={pending} className={inputClass} autoFocus />
        </label>
        <label className="space-y-1 text-[10px] font-bold text-slate-600">
          <span>Prazo de entrega</span>
          <input type="date" value={draft.prazoEntrega} onChange={(event) => update('prazoEntrega', event.target.value)} disabled={pending} className={inputClass} />
        </label>
        <label className="space-y-1 text-[10px] font-bold text-slate-600">
          <span>Carga horária</span>
          <input type="number" min="0.1" step="0.1" value={draft.horas.replace(',', '.')} onChange={(event) => update('horas', event.target.value)} disabled={pending} className={inputClass} />
        </label>
      </div>
      <p className="text-[10px] text-slate-500">Datas anteriores são permitidas para registrar atividades já realizadas. O prazo continua valendo para novas entregas dos alunos.</p>
      {revisionChanged && <p role="alert" className="text-xs font-semibold text-amber-700">A atividade foi alterada enquanto você editava. Cancele e reabra a edição para revisar os dados atuais.</p>}
      {validationError && <p role="alert" className="text-xs font-semibold text-red-600">{validationError}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={pending} className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-50">Cancelar</button>
        <button type="submit" disabled={pending || revisionChanged} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar atividade
        </button>
      </div>
    </form>
  );
};

export default TurmaGradeAtividadeEditor;
