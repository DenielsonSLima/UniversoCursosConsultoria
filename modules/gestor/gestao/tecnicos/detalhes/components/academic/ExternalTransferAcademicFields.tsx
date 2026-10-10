import React from 'react';
import { Loader2 } from 'lucide-react';
import ManualSettlementCombobox from '../../../../../financeiro/receber/components/manual-settlement/ManualSettlementCombobox';
import type { ExternalTransferDraft } from './external-transfer-draft';
import type { ExternalTransferStudent } from './useReceiveExternalTransfer';
import { getMaceioIsoDate } from '../../../technicalClassDates';

export type { ExternalTransferDiscipline } from './external-transfer-grade';
interface Props {
  draft: ExternalTransferDraft;
  onChange: <K extends keyof ExternalTransferDraft>(field: K, value: ExternalTransferDraft[K]) => void;
  students: ExternalTransferStudent[];
  destinationLabel?: string;
  studentFixed: boolean;
  loading: boolean;
  loadError: boolean;
  disabled: boolean;
  onRetry: () => void;
}
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-violet-500';

const ExternalTransferAcademicFields: React.FC<Props> = ({
  draft, onChange, students, destinationLabel, studentFixed, loading, loadError, disabled, onRetry,
}) => {
  return <fieldset disabled={disabled} className="space-y-4">
    {loadError ? <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-xs text-red-700">
      <p>Os alunos não foram carregados. Tente novamente antes de continuar.</p>
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
    {destinationLabel && <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Nosso curso e turma de destino</p>
      <p className="mt-1 text-sm font-bold text-[#001a33]">{destinationLabel}</p>
    </div>}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-xs font-bold text-slate-600">Escola anterior / instituição de origem *
        <input className={inputClass} value={draft.institution} onChange={(event) => onChange('institution', event.target.value)} maxLength={300} />
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
  </fieldset>;
};

export default ExternalTransferAcademicFields;
