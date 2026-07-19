import React from 'react';
import { ArrowLeft, Save } from 'lucide-react';

interface DeclaracaoEditorToolbarProps {
  editorTitle: string;
  hideBackButton: boolean;
  onBack: () => void;
  onSave: () => void;
  poloName: string;
  saving: boolean;
  scopeLabel?: string;
}

const DeclaracaoEditorToolbar: React.FC<DeclaracaoEditorToolbarProps> = ({
  editorTitle,
  hideBackButton,
  onBack,
  onSave,
  poloName,
  saving,
  scopeLabel,
}) => (
  <div className="flex justify-between items-center mb-6 pb-6 border-b border-slate-100 shrink-0">
    <div className="flex items-center gap-4">
      {!hideBackButton && (
        <button
          onClick={onBack}
          className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
      )}
      <div>
        <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">{editorTitle}</h3>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">
          {scopeLabel ? 'Modalidade' : 'Unidade'}:{' '}
          <span className="text-blue-600">{scopeLabel || poloName}</span>
        </p>
      </div>
    </div>
    <button
      onClick={onSave}
      disabled={saving}
      className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg"
    >
      <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Alterações'}
    </button>
  </div>
);

export default DeclaracaoEditorToolbar;
