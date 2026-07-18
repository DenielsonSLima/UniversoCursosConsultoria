import React from 'react';
import { AlertTriangle, CheckCircle2, LayoutTemplate, Loader2, Save } from 'lucide-react';
import CrachaPeriodoEleitoralPreviewPanel from './components/CrachaPeriodoEleitoralPreviewPanel';
import CrachaPeriodoEleitoralSidebar from './components/CrachaPeriodoEleitoralSidebar';
import { useCrachaPeriodoEleitoralEditor } from './useCrachaPeriodoEleitoralEditor';

const CrachaPeriodoEleitoralPage: React.FC = () => {
  const editor = useCrachaPeriodoEleitoralEditor();

  if (editor.isLoading) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center text-slate-400">
        <Loader2 className="mx-auto mb-3 animate-spin text-blue-600" />
        <p className="text-xs font-black uppercase tracking-widest">Carregando modelos SES...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2.5rem] p-4 lg:p-8 border border-slate-200 shadow-sm animate-fadeIn flex flex-col min-h-[calc(100vh-10rem)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 pb-6 border-b border-slate-100 gap-4">
        <div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <LayoutTemplate size={24} className="text-blue-600" />
            Crachá SES
          </h3>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">
            Salve variações por hospital ou período e escolha qual modelo ficará em uso
          </p>
        </div>
        <button
          onClick={editor.handleSave}
          disabled={editor.isSaving}
          className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 w-full sm:w-auto justify-center disabled:opacity-50"
        >
          {editor.isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar Alterações
        </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-8 flex-1">
        <CrachaPeriodoEleitoralSidebar editor={editor} />
        <CrachaPeriodoEleitoralPreviewPanel editor={editor} />
      </div>

      {editor.toast && (
        <div className="fixed right-6 top-6 z-[99999] animate-fadeIn">
          <div className={`flex items-center gap-3 rounded-2xl border px-6 py-3.5 text-white shadow-2xl ${
            editor.toast.type === 'success'
              ? 'border-emerald-400 bg-emerald-500/95'
              : editor.toast.type === 'warning'
                ? 'border-amber-400 bg-amber-500/95'
                : 'border-red-400 bg-red-500/95'
          }`}>
            {editor.toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span className="text-xs font-black uppercase tracking-wider">{editor.toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrachaPeriodoEleitoralPage;
