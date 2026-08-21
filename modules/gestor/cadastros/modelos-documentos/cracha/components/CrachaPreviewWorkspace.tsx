import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import CrachaPreview from './CrachaPreview';
import type { CrachaTemplateVariant } from './cracha-editor.model';

type PreviewMode = 'frente' | 'verso' | 'ambos';

interface CrachaPreviewWorkspaceProps {
  formData: any;
  variant?: CrachaTemplateVariant;
  previewMode: PreviewMode;
  selectedFieldId: string | null;
  zoomLevel: number;
  onFieldsChange: (fields: any[]) => void;
  onPreviewModeChange: (mode: PreviewMode) => void;
  onSelectField: (fieldId: string | null) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const PreviewButton: React.FC<{
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}> = ({ active, children, onClick }) => (
  <button
    type="button"
  onClick={onClick}
    aria-pressed={active}
    className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${active ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
  >
    {children}
  </button>
);

const CrachaPreviewWorkspace: React.FC<CrachaPreviewWorkspaceProps> = ({
  formData,
  variant = 'estagio',
  previewMode,
  selectedFieldId,
  zoomLevel,
  onFieldsChange,
  onPreviewModeChange,
  onSelectField,
  onZoomIn,
  onZoomOut,
}) => (
  <div className="flex-1 bg-slate-200 rounded-2xl overflow-hidden flex flex-col relative border border-slate-300">
    <div className="bg-slate-850 bg-[#0d1527] text-white p-3 flex justify-between items-center text-xs font-bold uppercase shadow-md z-10 shrink-0">
      <span className="tracking-widest hidden sm:inline text-slate-350">Visualização Prévia (CR80 Vertical)</span>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg">
          <button type="button" onClick={onZoomOut} aria-label="Diminuir zoom" className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded">
            <ZoomOut size={14} />
          </button>
          <span className="text-[10px] w-8 text-center">{zoomLevel}%</span>
          <button type="button" onClick={onZoomIn} aria-label="Aumentar zoom" className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded">
            <ZoomIn size={14} />
          </button>
        </div>
        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg">
          <PreviewButton active={previewMode === 'frente'} onClick={() => onPreviewModeChange('frente')}>
            Frente
          </PreviewButton>
          {formData.hasVerso ? (
            <>
              <PreviewButton active={previewMode === 'verso'} onClick={() => onPreviewModeChange('verso')}>
                Verso
              </PreviewButton>
              <PreviewButton active={previewMode === 'ambos'} onClick={() => onPreviewModeChange('ambos')}>
                Ambos
              </PreviewButton>
            </>
          ) : null}
        </div>
      </div>
    </div>

    <div className="flex-1 overflow-auto custom-scrollbar p-8 bg-slate-200 flex flex-col sm:flex-row items-start justify-start gap-8 min-h-0 select-none">
      {(previewMode === 'frente' || previewMode === 'ambos') ? (
        <div className="flex flex-col items-center gap-2 mx-auto">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Frente</span>
          <CrachaPreview
            formData={formData}
            variant={variant}
            page="frente"
            zoomLevel={zoomLevel}
            isEditable
            selectedFieldId={selectedFieldId}
            onSelectField={onSelectField}
            onChangePositions={onFieldsChange}
          />
        </div>
      ) : null}
      {(previewMode === 'verso' || previewMode === 'ambos') && formData.hasVerso ? (
        <div className="flex flex-col items-center gap-2 mx-auto">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Verso</span>
          <CrachaPreview
            formData={formData}
            variant={variant}
            page="verso"
            zoomLevel={zoomLevel}
            isEditable
            selectedFieldId={selectedFieldId}
            onSelectField={onSelectField}
            onChangePositions={onFieldsChange}
          />
        </div>
      ) : null}
    </div>
  </div>
);

export default CrachaPreviewWorkspace;
