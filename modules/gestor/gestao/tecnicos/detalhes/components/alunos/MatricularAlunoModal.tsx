import React from 'react';
import { AlertCircle, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { formatCpfCnpj, formatPhone } from '../../../../../../../lib/documentFormatters';
import { getTechnicalEnrollmentMissingFields } from '../../../../../../shared/utils/technicalEnrollmentRequirements';

interface MatricularAlunoModalProps {
  searchTerm: string;
  loadingAvailable: boolean;
  enrollPending: boolean;
  loadError?: string | null;
  retrying?: boolean;
  students: any[];
  requireTechnicalProfile?: boolean;
  onSearchChange: (value: string) => void;
  onConfirmStudent: (student: any) => void;
  onRetry?: () => void;
  onClose: () => void;
}

const MatricularAlunoModal: React.FC<MatricularAlunoModalProps> = ({
  searchTerm,
  loadingAvailable,
  enrollPending,
  loadError = null,
  retrying = false,
  students,
  requireTechnicalProfile = false,
  onSearchChange,
  onConfirmStudent,
  onRetry,
  onClose,
}) => {
  const hasSearch = searchTerm.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden max-h-[82vh] flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="font-black text-[#001a33] text-lg uppercase">Matricular aluno</h3>
            <p className="text-xs text-slate-500">A matrícula será registrada no histórico acadêmico.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 rounded-full">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              value={searchTerm}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar por nome, CPF ou telefone..."
              className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-emerald-500"
            />
          </div>
        </div>
        <div className="p-4 overflow-y-auto space-y-2">
          {loadError ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center text-xs font-bold text-red-700">
              <p>{loadError}</p>
              {onRetry ? (
                <button type="button" onClick={onRetry} disabled={retrying}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase disabled:opacity-50">
                  <RefreshCw size={13} className={retrying ? 'animate-spin' : ''} /> Tentar novamente
                </button>
              ) : null}
            </div>
          ) : loadingAvailable ? (
            <Loader2 className="animate-spin text-emerald-600 mx-auto my-12" />
          ) : !hasSearch ? (
            <p className="text-center text-sm text-slate-400 py-12">Digite nome ou CPF para buscar aluno.</p>
          ) : students.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-12">Nenhum aluno encontrado.</p>
          ) : students.map((student: any) => {
            const missingFields = requireTechnicalProfile ? getTechnicalEnrollmentMissingFields(student) : [];
            const canEnroll = missingFields.length === 0;
            const formattedDocument = formatCpfCnpj(student.cpf_cnpj) || 'CPF não informado';
            const formattedPhone = formatPhone(student.telefone || student.responsavel_telefone);

            return (
              <div key={student.id} className={`p-4 rounded-2xl border flex justify-between items-center gap-4 ${
                canEnroll ? 'border-slate-100' : 'border-amber-100 bg-amber-50/50'
              }`}>
                <div className="min-w-0">
                  <p className="font-bold text-[#001a33]">{student.nome}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                      CPF: <span className="font-mono text-slate-700">{formattedDocument}</span>
                    </span>
                    <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                      Telefone: <span className="font-mono text-slate-700">{formattedPhone}</span>
                    </span>
                  </div>
                  {!canEnroll && (
                    <p className="mt-2 flex items-start gap-1.5 text-[10px] font-bold leading-relaxed text-amber-700">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" />
                      Complete no cadastro: {missingFields.map((field) => field.label).join(', ')}.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onConfirmStudent(student)}
                  disabled={enrollPending || Boolean(loadError)}
                  className={`shrink-0 px-4 py-2 rounded-xl text-xs font-black uppercase disabled:opacity-50 ${
                    canEnroll
                      ? 'bg-emerald-600 text-white'
                      : 'border border-amber-200 bg-white text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  {canEnroll ? 'Matricular' : 'Ver pendências'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MatricularAlunoModal;
