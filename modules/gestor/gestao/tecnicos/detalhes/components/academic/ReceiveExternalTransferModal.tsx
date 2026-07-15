import React from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { ExternalTransferCredit } from '../../academic-lifecycle.service';

export interface ExternalCreditDraft {
  selected: boolean;
  mediaFinal: string;
  frequenciaPercent: string;
  situacao: NonNullable<ExternalTransferCredit['situacao']>;
}

interface ReceiveExternalTransferModalProps {
  students: any[];
  disciplines: any[];
  loading: boolean;
  loadError: boolean;
  retrying: boolean;
  pending: boolean;
  selectedStudentId: string;
  originInstitution: string;
  originCourse: string;
  reason: string;
  credits: Record<string, ExternalCreditDraft>;
  onStudentChange: (value: string) => void;
  onInstitutionChange: (value: string) => void;
  onCourseChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onCreditsChange: (value: Record<string, ExternalCreditDraft>) => void;
  onRetry: () => void;
  onClose: () => void;
  onConfirm: () => void;
}

const emptyCredit = (): ExternalCreditDraft => ({
  selected: false,
  mediaFinal: '',
  frequenciaPercent: '',
  situacao: 'EQUIVALENCIA',
});

const ReceiveExternalTransferModal: React.FC<ReceiveExternalTransferModalProps> = ({
  students,
  disciplines,
  loading,
  loadError,
  retrying,
  pending,
  selectedStudentId,
  originInstitution,
  originCourse,
  reason,
  credits,
  onStudentChange,
  onInstitutionChange,
  onCourseChange,
  onReasonChange,
  onCreditsChange,
  onRetry,
  onClose,
  onConfirm,
}) => {
  const updateCredit = (disciplineId: string, patch: Partial<ExternalCreditDraft>) => {
    onCreditsChange({
      ...credits,
      [disciplineId]: { ...(credits[disciplineId] || emptyCredit()), ...patch },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between bg-violet-700 p-6 text-white">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-200">Entrada acadêmica</p>
            <h3 className="mt-1 text-xl font-black">Receber transferência externa</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10"><X size={18} /></button>
        </header>

        <div className="space-y-4 p-6">
          {loadError ? (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700">
              <p>Alunos ou disciplinas não foram carregados. O recebimento foi bloqueado.</p>
              <button onClick={onRetry} disabled={retrying} className="mt-2 rounded-lg bg-white px-3 py-2 text-[10px] font-black uppercase disabled:opacity-50">
                Tentar novamente
              </button>
            </div>
          ) : (
            <select value={selectedStudentId} onChange={(event) => onStudentChange(event.target.value)} disabled={loading} className="w-full rounded-xl border border-slate-200 p-3.5 outline-none focus:border-violet-500 disabled:opacity-50">
              <option value="">{loading ? 'Carregando alunos...' : 'Selecione o aluno já cadastrado...'}</option>
              {students.map((student) => <option key={student.id} value={student.id}>{student.nome} — {student.cpf_cnpj || 'sem CPF'}</option>)}
            </select>
          )}
          <input value={originInstitution} onChange={(event) => onInstitutionChange(event.target.value)} placeholder="Instituição de origem" className="w-full rounded-xl border border-slate-200 p-3.5 outline-none focus:border-violet-500" />
          <input value={originCourse} onChange={(event) => onCourseChange(event.target.value)} placeholder="Curso de origem (opcional)" className="w-full rounded-xl border border-slate-200 p-3.5 outline-none focus:border-violet-500" />
          <textarea value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="Motivo e contexto da transferência" className="min-h-24 w-full resize-none rounded-xl border border-slate-200 p-3.5 outline-none focus:border-violet-500" />

          <section className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
            <div className="mb-3 flex gap-2 text-violet-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-black uppercase">Equivalências aprovadas</p>
                <p className="mt-1 text-xs">Marque somente as disciplinas já analisadas. Média e frequência são opcionais.</p>
              </div>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {disciplines.map((discipline) => {
                const credit = credits[discipline.id] || emptyCredit();
                return (
                  <div key={discipline.id} className="rounded-xl border border-violet-100 bg-white p-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <input type="checkbox" checked={credit.selected} onChange={(event) => updateCredit(discipline.id, { selected: event.target.checked })} />
                      <span>{discipline.nome}</span>
                      <span className="ml-auto text-[10px] text-slate-400">{discipline.carga_horaria || 0}h</span>
                    </label>
                    {credit.selected && (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <select value={credit.situacao} onChange={(event) => updateCredit(discipline.id, { situacao: event.target.value as ExternalCreditDraft['situacao'] })} className="rounded-lg border border-slate-200 p-2 text-xs">
                          <option value="EQUIVALENCIA">Equivalência</option>
                          <option value="APROVEITADO">Aproveitado</option>
                          <option value="DISPENSADO">Dispensado</option>
                        </select>
                        <input type="number" min={0} max={10} step={0.1} value={credit.mediaFinal} onChange={(event) => updateCredit(discipline.id, { mediaFinal: event.target.value })} placeholder="Média (0–10)" className="rounded-lg border border-slate-200 p-2 text-xs" />
                        <input type="number" min={0} max={100} step={0.01} value={credit.frequenciaPercent} onChange={(event) => updateCredit(discipline.id, { frequenciaPercent: event.target.value })} placeholder="Frequência %" className="rounded-lg border border-slate-200 p-2 text-xs" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <button onClick={onConfirm} disabled={loading || loadError || !selectedStudentId || !originInstitution.trim() || !reason.trim() || pending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 py-3 text-xs font-black uppercase text-white disabled:opacity-40">
            {pending && <Loader2 size={14} className="animate-spin" />}
            {pending ? 'Registrando...' : 'Registrar recebimento'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiveExternalTransferModal;
