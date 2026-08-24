import React from 'react';
import { Move } from 'lucide-react';
import { DocumentValidationQrCodeImage } from '../../../../../shared/document-validation/DocumentValidationQrCodeImage';
import { CapaCampo, DiarioTemplate, diariosService } from '../diarios.service';
import { DiarioEditorTab } from '../diarios-editor.types';

interface DiarioEditorCanvasProps {
  activeTab: DiarioEditorTab;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  capaCampos: CapaCampo[];
  currentField?: CapaCampo;
  draggingField: string | null;
  form: DiarioTemplate;
  getPxFontSize: (ptSize: number) => number;
  handleMouseDown: (event: React.MouseEvent, fieldId: string, currentX: number, currentY: number) => void;
  previewLogoUrl: string | null;
  previewWatermark: Awaited<ReturnType<typeof diariosService.getLandscapeWatermark>> | undefined;
  selectedFieldId: string | null;
  setShowCrosshairs: React.Dispatch<React.SetStateAction<boolean>>;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  setSnapToGrid: React.Dispatch<React.SetStateAction<boolean>>;
  showCrosshairs: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
}

const DiarioEditorCanvas: React.FC<DiarioEditorCanvasProps> = (props) => {
  const fields = props.activeTab === 'capa'
    ? props.capaCampos
    : (props.form.contracapaCampos || []);
  return (
    <div className="relative">
      <CanvasToolbar {...props} />
      <div
        ref={props.canvasRef}
        className="relative aspect-[297/210] w-full select-none overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner"
      >
        {props.activeTab === 'capa' ? (
          <VectorCoverBackground logoUrl={props.previewLogoUrl} />
        ) : props.form.contracapaUrl ? (
          <img src={props.form.contracapaUrl} alt="Fundo da contracapa" className="pointer-events-none absolute inset-0 z-0 h-full w-full object-fill" />
        ) : null}
        <WatermarkLayer watermark={props.previewWatermark} />
        {props.showGrid && <GridLines />}
        {props.currentField && props.showCrosshairs && <Crosshairs field={props.currentField} />}
        {(props.activeTab === 'capa' || props.form.imprimirValidacaoContracapa) && fields
          .filter((field) => field.visible)
          .map((field) => (
            <DraggableField
              key={field.id}
              field={field}
              displayValue={previewFieldValue(field, props.form)}
              isDragging={props.draggingField === field.id}
              isSelected={props.selectedFieldId === field.id}
              getPxFontSize={props.getPxFontSize}
              onMouseDown={props.handleMouseDown}
              singleLine={props.activeTab === 'capa'}
            />
          ))}
      </div>
    </div>
  );
};

const CanvasToolbar: React.FC<DiarioEditorCanvasProps> = ({
  activeTab, setShowCrosshairs, setShowGrid, setSnapToGrid,
  showCrosshairs, showGrid, snapToGrid,
}) => (
  <div className="mb-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
      {activeTab === 'capa'
        ? 'Capa vetorial oficial (clique e arraste os campos)'
        : 'Contracapa emitida (todos os campos são posicionáveis)'}
    </p>
    <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-wider text-slate-500">
      <ToolbarToggle label="Grade 10%" checked={showGrid} onChange={setShowGrid} />
      <ToolbarToggle label="Linhas Guia" checked={showCrosshairs} onChange={setShowCrosshairs} />
      <ToolbarToggle label="Atrair (Snap)" checked={snapToGrid} onChange={setSnapToGrid} />
    </div>
  </div>
);

const ToolbarToggle: React.FC<{
  checked: boolean;
  label: string;
  onChange: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ checked, label, onChange }) => (
  <label className="flex cursor-pointer items-center gap-1.5">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-600" />
    {label}
  </label>
);

const VectorCoverBackground: React.FC<{ logoUrl: string | null }> = ({ logoUrl }) => (
  <div className="pointer-events-none absolute inset-0 z-0 bg-white">
    <div className="absolute inset-y-0 left-0 w-[8.08%] bg-[#0879d8] [background-image:repeating-linear-gradient(145deg,transparent_0,transparent_12px,rgba(41,167,239,.8)_13px,transparent_14px)]" />
    <div className="absolute inset-y-0 left-[8.08%] w-[.74%] bg-white" />
    <div className="absolute inset-y-0 left-[8.82%] w-[1.68%] bg-[#e30613]" />
    <div className="absolute left-[31.65%] top-[4.76%] flex h-[15.24%] w-[41.08%] items-center justify-center">
      {logoUrl ? <img src={logoUrl} alt="Logotipo institucional" className="h-full w-full object-contain" /> : (
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Logotipo institucional</span>
      )}
    </div>
    <div className="absolute left-[20%] top-[26%] w-[66.7%] text-center text-[clamp(18px,3vw,40px)] font-black text-[#071a73]">DIÁRIO DE CLASSE</div>
    <div className="absolute bottom-[6.2%] left-[20%] w-[66.7%] text-center text-[clamp(5px,.75vw,10px)] font-medium text-[#071a73]">
      EDUCAÇÃO QUE TRANSFORMA <span className="font-black text-[#e30613]">•</span> CONHECIMENTO QUE CONECTA <span className="font-black text-[#e30613]">•</span> FUTURO QUE CONSTRUÍMOS
    </div>
    <div className="absolute bottom-[3.1%] left-[21.5%] w-[62%] border-t border-slate-500 text-center text-[clamp(5px,.65vw,9px)] font-bold text-slate-600">DESDE 2011</div>
  </div>
);

const WatermarkLayer: React.FC<{
  watermark: Awaited<ReturnType<typeof diariosService.getLandscapeWatermark>> | undefined;
}> = ({ watermark }) => watermark?.url ? (
  <div className="pointer-events-none absolute inset-0 z-[1] flex select-none items-center justify-center overflow-hidden">
    <img
      src={watermark.url}
      alt="Marca d'água"
      style={{
        width: `${watermark.scale}%`, opacity: watermark.opacity,
        transform: watermark.rotate ? 'rotate(-22deg)' : 'none', objectFit: 'contain',
      }}
    />
  </div>
) : null;

const GridLines = () => (
  <div className="pointer-events-none absolute inset-0 z-[2]">
    {Array.from({ length: 9 }).map((_, index) => <div key={`v-${index}`} className="absolute h-full border-l border-dashed border-slate-300/40" style={{ left: `${(index + 1) * 10}%` }} />)}
    {Array.from({ length: 9 }).map((_, index) => <div key={`h-${index}`} className="absolute w-full border-t border-dashed border-slate-300/40" style={{ top: `${(index + 1) * 10}%` }} />)}
  </div>
);

const Crosshairs: React.FC<{ field: CapaCampo }> = ({ field }) => (
  <div className="pointer-events-none absolute inset-0 z-[3]">
    <div className="absolute h-full border-l border-blue-400/60" style={{ left: `${field.x}%` }} />
    <div className="absolute w-full border-t border-blue-400/60" style={{ top: `${field.y}%` }} />
  </div>
);

interface DraggableFieldProps {
  displayValue: string;
  field: CapaCampo;
  getPxFontSize: (ptSize: number) => number;
  isDragging: boolean;
  isSelected: boolean;
  onMouseDown: DiarioEditorCanvasProps['handleMouseDown'];
  singleLine: boolean;
}

const DraggableField: React.FC<DraggableFieldProps> = ({
  displayValue, field, getPxFontSize, isDragging, isSelected, onMouseDown, singleLine,
}) => (
  <div
    onMouseDown={(event) => onMouseDown(event, field.id, field.x, field.y)}
    className={`absolute z-10 border transition-colors ${isSelected ? 'border-blue-500 bg-blue-50/20 shadow-sm' : 'border-transparent hover:border-slate-300 hover:bg-slate-100/10'}`}
    style={{ left: `${field.x}%`, top: `${field.y}%`, width: `${field.width}%`, cursor: isDragging ? 'grabbing' : 'grab' }}
  >
    {isSelected && <div className="pointer-events-none absolute -top-6 left-0 flex items-center gap-1 rounded bg-blue-600 px-1.5 py-0.5 text-[8px] font-black text-white shadow-sm"><Move size={8} />{field.x}% , {field.y}%</div>}
    {field.isImage ? (
      <img src={field.imageUrl} alt={field.label} className="pointer-events-none h-auto w-full object-contain" />
    ) : field.id === 'contracapaQrCode' ? (
      <QrField field={field} fontSize={getPxFontSize(field.fontSize)} />
    ) : (
      <div style={{
        fontSize: `${getPxFontSize(field.fontSize)}px`, fontWeight: field.bold ? 'bold' : 'normal',
        color: field.color || '#071a33', textAlign: field.align || 'left',
        borderTop: field.borderTop ? `1px solid ${field.color || '#071a33'}` : 'none',
        lineHeight: '1.2',
        overflow: singleLine ? 'hidden' : 'visible',
        textOverflow: singleLine ? 'ellipsis' : 'clip',
        whiteSpace: singleLine ? 'nowrap' : 'normal',
        wordBreak: singleLine ? 'normal' : 'break-word',
      }}>
        {field.label}{displayValue}
      </div>
    )}
  </div>
);

const QrField: React.FC<{ field: CapaCampo; fontSize: number }> = ({ field, fontSize }) => (
  <div className="flex flex-col items-center" style={{ color: field.color, fontSize, fontWeight: field.bold ? 'bold' : 'normal' }}>
    <DocumentValidationQrCodeImage code="DIA-TECNICO-XXXXXXXX" size={240} alt="QR Code" className="aspect-square w-full bg-white object-contain" />
    <span className="mt-1 text-center leading-tight">{field.label}</span>
  </div>
);

const previewFieldValue = (field: CapaCampo, form: DiarioTemplate) => {
  if (field.id === 'contracapaRegulamento') return form.mensagemValidacao || '';
  if (field.id === 'contracapaAutenticacao') return 'DIA-TECNICO-XXXXXXXX · www.universocc.com.br/validador';
  if (field.id === 'contracapaQrCode') return '';
  return field.valuePlaceholder || '';
};

export default DiarioEditorCanvas;
