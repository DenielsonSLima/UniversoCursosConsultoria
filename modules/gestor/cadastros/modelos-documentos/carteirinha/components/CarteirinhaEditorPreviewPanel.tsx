import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import CarteirinhaPreview from './CarteirinhaPreview';
import type {
  CarteirinhaEditorFormData,
  CarteirinhaEditorFormSetter,
  CarteirinhaPreviewMode,
} from './carteirinha-editor.types';

interface CarteirinhaEditorPreviewPanelProps {
  formData: CarteirinhaEditorFormData;
  onZoomIn: () => void;
  onZoomOut: () => void;
  previewAluno?: any;
  previewMode: CarteirinhaPreviewMode;
  setFormData: CarteirinhaEditorFormSetter;
  setPreviewMode: React.Dispatch<React.SetStateAction<CarteirinhaPreviewMode>>;
  zoomLevel: number;
}

const CarteirinhaEditorPreviewPanel: React.FC<CarteirinhaEditorPreviewPanelProps> = ({
  formData,
  onZoomIn,
  onZoomOut,
  previewAluno,
  previewMode,
  setFormData,
  setPreviewMode,
  zoomLevel,
}) => (
  <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-300 bg-slate-200">
    <div className="z-10 flex shrink-0 items-center justify-between bg-slate-800 p-3 text-xs font-bold uppercase text-white shadow-md">
      <span className="hidden tracking-widest sm:inline">Visualização Prévia (CR80)</span>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-slate-700/50 p-1">
          <button onClick={onZoomOut} className="rounded p-1 text-slate-300 hover:bg-slate-600 hover:text-white"><ZoomOut size={14} /></button>
          <span className="w-8 text-center text-[10px]">{zoomLevel}%</span>
          <button onClick={onZoomIn} className="rounded p-1 text-slate-300 hover:bg-slate-600 hover:text-white"><ZoomIn size={14} /></button>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-slate-700 p-1">
          <button onClick={() => setPreviewMode('frente')} className={`rounded px-3 py-1 text-[10px] font-black transition-colors ${previewMode === 'frente' ? 'bg-pink-500 text-white' : 'text-slate-300 hover:bg-slate-600 hover:text-white'}`}>FRENTE</button>
          {formData.hasVerso && <button onClick={() => setPreviewMode('verso')} className={`rounded px-3 py-1 text-[10px] font-black transition-colors ${previewMode === 'verso' ? 'bg-pink-500 text-white' : 'text-slate-300 hover:bg-slate-600 hover:text-white'}`}>VERSO</button>}
          {formData.hasVerso && <button onClick={() => setPreviewMode('ambos')} className={`rounded px-3 py-1 text-[10px] font-black transition-colors ${previewMode === 'ambos' ? 'bg-pink-500 text-white' : 'text-slate-300 hover:bg-slate-600 hover:text-white'}`}>AMBOS</button>}
        </div>
      </div>
    </div>
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 overflow-auto bg-slate-300 p-8 custom-scrollbar">
      {(previewMode === 'frente' || previewMode === 'ambos') && <CarteirinhaPreview formData={formData} page="frente" zoomLevel={zoomLevel} aluno={previewAluno} isEditable onChangePositions={(positions) => setFormData({ ...formData, posicoes: positions })} />}
      {(previewMode === 'verso' || previewMode === 'ambos') && formData.hasVerso && <CarteirinhaPreview formData={formData} page="verso" zoomLevel={zoomLevel} aluno={previewAluno} isEditable onChangePositions={(positions) => setFormData({ ...formData, posicoes: positions })} />}
    </div>
  </div>
);

export default CarteirinhaEditorPreviewPanel;
