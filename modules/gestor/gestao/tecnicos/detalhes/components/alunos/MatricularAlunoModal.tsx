import React from 'react';
import { Loader2, Search, X } from 'lucide-react';

interface MatricularAlunoModalProps {
  searchTerm: string;
  loadingAvailable: boolean;
  enrollPending: boolean;
  students: any[];
  onSearchChange: (value: string) => void;
  onConfirmStudent: (student: any) => void;
  onClose: () => void;
}

const MatricularAlunoModal: React.FC<MatricularAlunoModalProps> = ({
  searchTerm,
  loadingAvailable,
  enrollPending,
  students,
  onSearchChange,
  onConfirmStudent,
  onClose,
}) => (
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
            placeholder="Buscar por nome ou CPF..."
            className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-emerald-500"
          />
        </div>
      </div>
      <div className="p-4 overflow-y-auto space-y-2">
        {loadingAvailable ? (
          <Loader2 className="animate-spin text-emerald-600 mx-auto my-12" />
        ) : students.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-12">Nenhum aluno disponível.</p>
        ) : students.map((student: any) => (
          <div key={student.id} className="p-4 rounded-2xl border border-slate-100 flex justify-between items-center gap-4">
            <div>
              <p className="font-bold text-[#001a33]">{student.nome}</p>
              <p className="text-xs text-slate-500">{student.cpf_cnpj || 'CPF não informado'}</p>
            </div>
            <button
              onClick={() => onConfirmStudent(student)}
              disabled={enrollPending}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase disabled:opacity-50"
            >
              Matricular
            </button>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default MatricularAlunoModal;
