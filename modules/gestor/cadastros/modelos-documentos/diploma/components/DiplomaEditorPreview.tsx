import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import DiplomaPreview, { getTemplateBackgroundUrl } from './DiplomaPreview';
import { DiplomaEditorTab, DiplomaPreviewMode } from './diploma-editor.helpers';

interface DiplomaEditorPreviewProps {
  formData: any;
  activeTab: DiplomaEditorTab;
  previewMode: DiplomaPreviewMode;
  selectedBlockId: string | null;
  zoomLevel: number;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  setPreviewMode: React.Dispatch<React.SetStateAction<DiplomaPreviewMode>>;
  setSelectedBlockId: React.Dispatch<React.SetStateAction<string | null>>;
  onZoomOut: () => void;
  onZoomIn: () => void;
}

const DiplomaEditorPreview: React.FC<DiplomaEditorPreviewProps> = ({
  formData,
  activeTab,
  previewMode,
  selectedBlockId,
  zoomLevel,
  setFormData,
  setPreviewMode,
  setSelectedBlockId,
  onZoomOut,
  onZoomIn,
}) => (
  <div className="flex-1 bg-slate-200 rounded-2xl overflow-hidden flex flex-col relative border border-slate-300 min-h-[520px] xl:h-[calc(100vh-17rem)]">
    <div className="bg-slate-800 text-white p-3 flex justify-between items-center text-xs font-bold uppercase shadow-md z-10 shrink-0">
      <div className="flex items-center gap-1.5">
        <span className="tracking-widest">Visualização / Tela de Trabalho</span>
        {(activeTab === 'frente' || activeTab === 'verso') && <span className="bg-purple-650 text-white font-black text-[8px] px-2 py-0.5 rounded tracking-wide animate-pulse">ARRASTAR PARA MOVER</span>}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-slate-700/50 p-1 rounded-lg">
          <button onClick={onZoomOut} className="p-1 text-slate-300 hover:text-white hover:bg-slate-600 rounded"><ZoomOut size={14} /></button>
          <span className="text-[10px] w-8 text-center">{zoomLevel}%</span>
          <button onClick={onZoomIn} className="p-1 text-slate-300 hover:text-white hover:bg-slate-600 rounded"><ZoomIn size={14} /></button>
        </div>
        <div className="flex items-center gap-1 bg-slate-700 p-1 rounded-lg">
          <button onClick={() => setPreviewMode('frente')} disabled={activeTab === 'verso'} className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'frente' ? 'bg-purple-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-600 disabled:opacity-30'}`}>FRENTE</button>
          {formData.hasVerso && <button onClick={() => setPreviewMode('verso')} disabled={activeTab === 'frente'} className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'verso' ? 'bg-purple-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-600 disabled:opacity-30'}`}>VERSO</button>}
          {formData.hasVerso && activeTab === 'visualizar' && <button onClick={() => setPreviewMode('ambos')} className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'ambos' ? 'bg-purple-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-600'}`}>AMBOS</button>}
        </div>
      </div>
    </div>

    <div onClick={() => setSelectedBlockId(null)} className="flex-1 overflow-auto overscroll-contain custom-scrollbar p-8 pb-24 bg-slate-300 flex flex-col items-center gap-8 min-h-0 cursor-default">
      {(previewMode === 'frente' || previewMode === 'ambos') && (
        <DiplomaPreview
          key={`frente-${getTemplateBackgroundUrl(formData, 'frente')}-${formData.bgFrenteUpdatedAt || ''}`}
          formData={formData}
          page="frente"
          zoomLevel={zoomLevel}
          isEditable={activeTab === 'frente'}
          selectedBlockId={selectedBlockId}
          onSelectBlock={setSelectedBlockId}
          onChangeBlocks={(updated) => setFormData({ ...formData, blocks: updated })}
        />
      )}
      {(previewMode === 'verso' || previewMode === 'ambos') && formData.hasVerso && (
        <DiplomaPreview
          key={`verso-${getTemplateBackgroundUrl(formData, 'verso')}-${formData.bgVersoUpdatedAt || ''}`}
          formData={formData}
          page="verso"
          zoomLevel={zoomLevel}
          isEditable={activeTab === 'verso'}
          selectedBlockId={selectedBlockId}
          onSelectBlock={setSelectedBlockId}
          onChangeBlocks={(updated) => setFormData({ ...formData, blocks: updated })}
        />
      )}
    </div>
  </div>
);

export default DiplomaEditorPreview;
