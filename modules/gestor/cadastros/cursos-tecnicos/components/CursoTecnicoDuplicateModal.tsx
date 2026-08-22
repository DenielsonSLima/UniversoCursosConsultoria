import React from "react";
import { Copy, X } from "lucide-react";

interface CursoTecnicoDuplicateModalProps {
  isDuplicating: boolean;
  nome: string;
  versao: string;
  onClose: () => void;
  onNomeChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onVersaoChange: (value: string) => void;
}

const CursoTecnicoDuplicateModal: React.FC<CursoTecnicoDuplicateModalProps> = ({
  isDuplicating,
  nome,
  versao,
  onClose,
  onNomeChange,
  onSubmit,
  onVersaoChange,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fadeIn">
    <div className="relative w-full max-w-md rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-2xl">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-6 top-6 rounded-xl p-2 text-slate-400 transition-all hover:bg-slate-50 hover:text-red-500"
        aria-label="Fechar duplicação"
      >
        <X size={20} />
      </button>
      <h3 className="mb-6 flex items-center gap-2 text-xl font-black uppercase tracking-tight text-[#001a33]">
        <Copy size={20} className="text-emerald-500" />
        <span>Duplicar Curso</span>
      </h3>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
            Nome da Nova Versão/Cópia
          </label>
          <input
            required
            type="text"
            value={nome}
            onChange={(event) => onNomeChange(event.target.value)}
            placeholder="Ex: Técnico em Enfermagem 2.0"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none transition-all focus:border-blue-500 focus:bg-white"
          />
        </div>
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">
            Versão
          </label>
          <input
            required
            type="text"
            value={versao}
            onChange={(event) => onVersaoChange(event.target.value)}
            placeholder="Ex: 2.0"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none transition-all focus:border-blue-500 focus:bg-white"
          />
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-medium leading-relaxed text-blue-800">
          Esta ação criará um novo curso clonando toda a estrutura curricular
          (módulos, disciplinas e aulas) do curso original. O curso original
          permanecerá intacto.
        </div>
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={isDuplicating}
            className="flex-1 rounded-xl bg-[#001a33] py-3 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition-colors hover:bg-blue-900 disabled:opacity-75"
          >
            {isDuplicating ? "Clonando..." : "Confirmar Duplicação"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-200"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  </div>
);

export default CursoTecnicoDuplicateModal;
