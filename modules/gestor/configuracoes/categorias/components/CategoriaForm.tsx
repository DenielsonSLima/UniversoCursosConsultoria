import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { Categoria } from '../categorias.service';

interface CategoriaFormProps {
  onClose: () => void;
  onSave: (data: Omit<Categoria, 'id'>) => void;
  categoria?: Categoria | null;
  isSaving: boolean;
}

const CategoriaForm: React.FC<CategoriaFormProps> = ({ onClose, onSave, categoria, isSaving }) => {
  const [nome, setNome] = useState(categoria?.nome || '');
  const [tipo, setTipo] = useState<Categoria['tipo']>(categoria?.tipo || 'pj');
  const [descricao, setDescricao] = useState(categoria?.descricao || '');
  const [status, setStatus] = useState<Categoria['status']>(categoria?.status || 'ativo');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      alert('Nome da categoria é obrigatório.');
      return;
    }
    onSave({
      nome,
      tipo,
      descricao,
      status,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-[#001a33]">
              {categoria ? 'Editar Categoria' : 'Nova Categoria'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Configure as opções da categoria de parceiro/cadastro.
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Nome da Categoria
              </label>
              <input 
                type="text" 
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Fornecedores de Tecnologia"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Grupo de Cadastro
              </label>
              <select 
                value={tipo}
                onChange={(e) => setTipo(e.target.value as Categoria['tipo'])}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all text-slate-900"
              >
                <option value="aluno">Aluno</option>
                <option value="professor">Professor</option>
                <option value="pf">Pessoa Física (PF)</option>
                <option value="pj">Pessoa Jurídica (PJ)</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Descrição (Opcional)
              </label>
              <textarea 
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={3}
                placeholder="Detalhes sobre esta categoria..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all resize-none"
              ></textarea>
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Status
              </label>
              <select 
                value={status}
                onChange={(e) => setStatus(e.target.value as Categoria['status'])}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>

          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
          <button 
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors uppercase tracking-wider"
          >
            Cancelar
          </button>
          <button 
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#001a33] hover:bg-blue-900 text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-blue-900/20 uppercase tracking-wider disabled:opacity-50"
          >
            <Save size={18} />
            {isSaving ? 'Salvando...' : 'Salvar Categoria'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CategoriaForm;
