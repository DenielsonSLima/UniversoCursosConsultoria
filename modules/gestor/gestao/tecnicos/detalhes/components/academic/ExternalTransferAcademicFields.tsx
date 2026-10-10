import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import ManualSettlementCombobox from '../../../../../financeiro/receber/components/manual-settlement/ManualSettlementCombobox';
import type { ExternalCreditDraft, ExternalTransferDraft } from './external-transfer-draft';
import type { ExternalTransferStudent } from './useReceiveExternalTransfer';
import { getMaceioIsoDate } from '../../../technicalClassDates';

export interface ExternalTransferDiscipline { id: string; nome: string; carga_horaria: number | null }
interface Props {
  draft: ExternalTransferDraft;
  onChange: <K extends keyof ExternalTransferDraft>(field: K, value: ExternalTransferDraft[K]) => void;
  students: ExternalTransferStudent[];
  disciplines: ExternalTransferDiscipline[];
  studentFixed: boolean;
  loading: boolean;
  loadError: boolean;
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

const ExternalTransferAcademicFields: React.FC<Props> = ({
  draft, onChange, students, disciplines, studentFixed, loading, loadError, disabled, onRetry,
}) => {
  const updateCredit = (id: string, patch: Partial<ExternalCreditDraft>) => onChange('credits', {
    ...draft.credits, [id]: { ...(draft.credits[id] || emptyCredit()), ...patch },
  });
  return <fieldset disabled={disabled} className="space-y-4">
    {loadError ? <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-xs text-red-700">
      <p>Alunos ou disciplinas não foram carregados. Tente novamente antes de continuar.</p>
      <button type="button" onClick={onRetry} disabled={loading} className="mt-2 font-bold underline">Tentar novamente</button>
    </div> : loading ? <p role="status" className="flex items-center gap-2 text-xs text-violet-700"><Loader2 size={14} className="animate-spin" />Carregando dados acadêmicos...</p> : null}
    {studentFixed ? <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-wider text-violet-700">Aluno selecionado</p>
      <p className="mt-1 text-sm font-bold text-[#001a33]">{students.find((student) => student.id === draft.studentId)?.nome}</p>
    </div> : <ManualSettlementCombobox
      label="Aluno cadastrado" value={draft.studentId} onChange={(id) => onChange('studentId', id)}
      options={students.map((student) => ({ value: student.id, label: student.nome, description: student.cpf_cnpj || 'CPF não informado' }))}
      placeholder={loading ? 'Carregando alunos...' : 'Buscar aluno por nome ou CPF...'}
      emptyMessage="Nenhum aluno encontrado" disabled={disabled || loading || loadError}
    />}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-xs font-bold text-slate-600">Instituição de origem *
        <input className={inputClass} value={draft.institution} onChange={(event) => onChange('institution', event.target.value)} maxLength={300} />
      </label>
      <label className="space-y-1 text-xs font-bold text-slate-600">Curso de origem (opcional)
        <input className={inputClass} value={draft.course} onChange={(event) => onChange('course', event.target.value)} maxLength={300} />
      </label>
      <label className="space-y-1 text-xs font-bold text-slate-600">Data efetiva da transferência *
        <input type="date" max={getMaceioIsoDate()} className={inputClass} value={draft.transferDate} onChange={(event) => onChange('transferDate', event.target.value)} />
      </label>
    </div>
    <label className="block space-y-1 text-xs font-bold text-slate-600">Motivo e contexto da transferência *
      <textarea className={`${inputClass} min-h-20 resize-none`} value={draft.reason} onChange={(event) => onChange('reason', event.target.value)} maxLength={2000} />
    </label>
    <label className="block space-y-1 text-xs font-bold text-slate-600">Observações (opcional)
      <textarea className={`${inputClass} min-h-16 resize-none`} value={draft.notes} onChange={(event) => onChange('notes', event.target.value)} maxLength={2000} />
    </label>
    <section className="space-y-3 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
      <div className="flex gap-2 text-violet-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div><p className="text-xs font-black uppercase">Notas e aproveitamentos da escola de origem</p>
          <p className="mt-1 text-xs">Marque as disciplinas com equivalência já aprovada. Média e frequência são opcionais; as demais continuam na turma de destino.</p>
        </div>
      </div>
      {!loading && !loadError && disciplines.length === 0 && <p className="text-xs text-slate-600">A turma não possui disciplinas configuradas para aproveitamento.</p>}
      {disciplines.map((discipline) => {
        const credit = draft.credits[discipline.id] || emptyCredit();
        return <div key={discipline.id} className="rounded-xl border border-violet-100 bg-white p-3">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <input type="checkbox" checked={credit.selected} onChange={(event) => updateCredit(discipline.id, { selected: event.target.checked })} />
            <span>{discipline.nome}</span><span className="ml-auto whitespace-nowrap text-[10px] text-slate-400">{discipline.carga_horaria || 0}h</span>
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
    </section>
  </fieldset>;
};

export default ExternalTransferAcademicFields;
