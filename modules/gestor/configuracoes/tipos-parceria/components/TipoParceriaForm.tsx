import React, { useState } from 'react';
import { Handshake, Save, X } from 'lucide-react';
import { TipoParceria } from '../tipos-parceria.service';

interface TipoParceriaFormProps {
  tipo?: TipoParceria | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (data: Omit<TipoParceria, 'id'>) => void;
  statusFixo?: TipoParceria['status'];
}

const TipoParceriaForm: React.FC<TipoParceriaFormProps> = ({
  tipo,
  isSaving,
  onClose,
  onSave,
  statusFixo,
}) => {
  const [nome, setNome] = useState(tipo?.nome || '');
  const [descricao, setDescricao] = useState(tipo?.descricao || '');
  const [status, setStatus] = useState<TipoParceria['status']>(statusFixo || tipo?.status || 'ativo');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!nome.trim()) return;
          onSave({ nome, descricao: descricao.trim(), status: statusFixo || status });
        }}
        className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
              <Handshake size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#001a33]">
                {tipo ? 'Editar tipo de parceria' : 'Novo tipo de parceria'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Opção usada em convênios e relacionamentos com empresas.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">Nome do tipo</label>
            <input
              autoFocus
              value={nome}
              onChange={(event) => setNome(event.target.value.toUpperCase())}
              placeholder="Ex: Convênio de estágio"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-[#001a33] outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">Descrição</label>
            <textarea
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              rows={3}
              placeholder="Explique quando este tipo deve ser utilizado."
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-[#001a33] outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">Status</label>
            <select
              value={statusFixo || status}
              onChange={(event) => setStatus(event.target.value as TipoParceria['status'])}
              disabled={Boolean(statusFixo)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-[#001a33] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 p-6">
          <button type="button" onClick={onClose} className="rounded-xl px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-200">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving || !nome.trim()}
            className="flex items-center gap-2 rounded-xl bg-[#001a33] px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-blue-950/15 transition-colors hover:bg-blue-900 disabled:opacity-50"
          >
            <Save size={18} />
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TipoParceriaForm;
