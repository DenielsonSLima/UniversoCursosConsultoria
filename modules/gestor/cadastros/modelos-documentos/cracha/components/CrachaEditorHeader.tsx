import React from 'react';
import { ArrowLeft, LayoutTemplate, Save } from 'lucide-react';

interface CrachaEditorHeaderProps {
  onCancel: () => void;
  onSave: () => void;
}

const CrachaEditorHeader: React.FC<CrachaEditorHeaderProps> = ({ onCancel, onSave }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 pb-6 border-b border-slate-100 gap-4">
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onCancel}
        className="p-3 bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shrink-0"
      >
        <ArrowLeft size={20} />
      </button>
      <div>
        <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
          <LayoutTemplate size={24} className="text-blue-600" />
          Editar Crachá de Estágio
        </h3>
        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">
          Personalize o layout, posicione e edite os elementos do crachá
        </p>
      </div>
    </div>
    <button
      type="button"
      onClick={onSave}
      className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 w-full sm:w-auto justify-center"
    >
      <Save size={16} /> Salvar Alterações
    </button>
  </div>
);

export default CrachaEditorHeader;
