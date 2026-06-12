
import React, { useState } from 'react';
import { X, Plus, Trash2, PlayCircle, FileText, Save } from 'lucide-react';
import { Aula, Disciplina } from '../cursos-tecnicos.types';

interface DisciplinaContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  disciplina: Disciplina;
  onSaveAulas: (aulas: Aula[]) => void;
}

const DisciplinaContentModal: React.FC<DisciplinaContentModalProps> = ({ 
  isOpen, 
  onClose, 
  disciplina, 
  onSaveAulas 
}) => {
  const [aulas, setAulas] = useState<Aula[]>(disciplina.aulas || []);
  const [newAulaTitulo, setNewAulaTitulo] = useState('');
  const [newAulaDesc, setNewAulaDesc] = useState('');

  // Sincroniza estado local quando a disciplina muda
  React.useEffect(() => {
    setAulas(disciplina.aulas || []);
  }, [disciplina]);

  if (!isOpen) return null;

  const handleAddAula = () => {
    if (!newAulaTitulo.trim()) return;
    const novaAula: Aula = {
      id: Math.random().toString(36).substr(2, 9),
      titulo: newAulaTitulo,
      descricao: newAulaDesc,
      cargaHoraria: 0
    };
    const updatedAulas = [...aulas, novaAula];
    setAulas(updatedAulas);
    setNewAulaTitulo('');
    setNewAulaDesc('');
  };

  const handleRemoveAula = (id: string) => {
    const updatedAulas = aulas.filter(a => a.id !== id);
    setAulas(updatedAulas);
  };

  const handleSaveAndClose = () => {
    onSaveAulas(aulas);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>

      <div className="relative bg-white rounded-[2rem] w-full max-w-2xl p-8 shadow-2xl animate-fadeIn border border-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Conteúdo Programático</h3>
            <p className="text-slate-500 text-sm mt-1">
              Disciplina: <span className="font-bold text-blue-600">{disciplina.nome}</span>
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Lista de Aulas */}
        <div className="flex-1 overflow-y-auto mb-6 pr-2 custom-scrollbar">
          {aulas.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <PlayCircle className="text-slate-300 mx-auto mb-3" size={32} />
              <p className="text-slate-500 font-medium text-sm">Nenhuma aula cadastrada nesta disciplina.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {aulas.map((aula, index) => (
                <div key={aula.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start justify-between group hover:border-blue-200 transition-colors">
                  <div className="flex gap-3">
                    <div className="mt-1 p-1.5 bg-white rounded-lg text-blue-500 shadow-sm h-fit">
                      <FileText size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-[#001a33] text-sm">
                        Aula {index + 1}: {aula.titulo}
                      </h4>
                      {aula.descricao && (
                        <p className="text-xs text-slate-500 mt-1">{aula.descricao}</p>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleRemoveAula(aula.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    title="Remover Aula"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Adicionar Nova Aula */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-6">
          <p className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
            <Plus size={12} /> Adicionar Nova Aula
          </p>
          <div className="flex flex-col gap-3">
            <input 
              type="text" 
              placeholder="Título da Aula (Ex: Introdução à Anatomia)" 
              className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-500"
              value={newAulaTitulo}
              onChange={(e) => setNewAulaTitulo(e.target.value)}
            />
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Descrição breve do conteúdo (Opcional)" 
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-500"
                value={newAulaDesc}
                onChange={(e) => setNewAulaDesc(e.target.value)}
              />
              <button 
                onClick={handleAddAula}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button 
            onClick={onClose}
            className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSaveAndClose}
            className="px-6 py-3 rounded-xl bg-[#001a33] text-white font-bold text-xs uppercase tracking-wider hover:bg-blue-900 shadow-lg shadow-blue-900/20 flex items-center gap-2"
          >
            <Save size={16} /> Salvar Conteúdo
          </button>
        </div>

      </div>
    </div>
  );
};

export default DisciplinaContentModal;