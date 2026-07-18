import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import type { CrachaPeriodoEleitoralEditor } from '../useCrachaPeriodoEleitoralEditor';
import CrachaPeriodoEleitoralPreview from './CrachaPeriodoEleitoralPreview';

interface Props {
  editor: CrachaPeriodoEleitoralEditor;
}

const CrachaPeriodoEleitoralPreviewPanel: React.FC<Props> = ({ editor }) => {
  const {
    activeTab,
    formData,
    handleZoomIn,
    handleZoomOut,
    previewMode,
    selectedFieldId,
    setFormData,
    setPreviewMode,
    setSelectedFieldId,
    zoomLevel,
  } = editor;

  return (
    <div className="flex-1 bg-slate-200 rounded-2xl overflow-hidden flex flex-col relative border border-slate-300">
      <div className="bg-[#0d1527] text-white p-3 flex justify-between items-center text-xs font-bold uppercase shadow-md z-10 shrink-0">
        <span className="tracking-widest hidden sm:inline text-slate-350">Visualização Prévia (Horizontal)</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg">
            <button onClick={handleZoomOut} className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded"><ZoomOut size={14} /></button>
            <span className="text-[10px] w-8 text-center">{zoomLevel}%</span>
            <button onClick={handleZoomIn} className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded"><ZoomIn size={14} /></button>
          </div>
          <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg">
            <button onClick={() => setPreviewMode('frente')} className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'frente' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}>FRENTE</button>
            {formData.hasVerso !== false && <button onClick={() => setPreviewMode('verso')} className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'verso' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}>VERSO</button>}
            {formData.hasVerso !== false && <button onClick={() => setPreviewMode('ambos')} className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'ambos' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}>AMBOS</button>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar p-8 bg-slate-200 flex flex-col items-center justify-start gap-8 min-h-0 select-none">
        {(previewMode === 'frente' || previewMode === 'ambos') && (
          <div className="flex flex-col items-center gap-2 mx-auto">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Frente</span>
            <CrachaPeriodoEleitoralPreview formData={formData} page="frente" zoomLevel={zoomLevel} isEditable={activeTab === 'frente'} selectedFieldId={selectedFieldId} onSelectField={setSelectedFieldId} onChangePositions={(updatedFields) => setFormData((prev: any) => ({ ...prev, fields: updatedFields }))} />
          </div>
        )}
        {(previewMode === 'verso' || previewMode === 'ambos') && formData.hasVerso !== false && (
          <div className="flex flex-col items-center gap-2 mx-auto">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Verso</span>
            <CrachaPeriodoEleitoralPreview formData={formData} page="verso" zoomLevel={zoomLevel} isEditable={activeTab === 'verso'} selectedFieldId={selectedFieldId} onSelectField={setSelectedFieldId} onChangePositions={(updatedFields) => setFormData((prev: any) => ({ ...prev, fields: updatedFields }))} />
          </div>
        )}
      </div>
    </div>
  );
};

export default CrachaPeriodoEleitoralPreviewPanel;
