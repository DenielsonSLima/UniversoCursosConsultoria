import React from 'react';
import { Move } from 'lucide-react';
import capaDiarioPadrao from '../../../../../../Documentos/Capa-Diario.jpg';
import { getDocumentValidationQrUrl } from '../../../../../shared/document-validation/document-validation.url';
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
  previewWatermark: Awaited<ReturnType<typeof diariosService.getLandscapeWatermark>> | undefined;
  selectedFieldId: string | null;
  setShowCrosshairs: React.Dispatch<React.SetStateAction<boolean>>;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  setSnapToGrid: React.Dispatch<React.SetStateAction<boolean>>;
  showCrosshairs: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
}

const DiarioEditorCanvas: React.FC<DiarioEditorCanvasProps> = ({
  activeTab,
  canvasRef,
  capaCampos,
  currentField,
  draggingField,
  form,
  getPxFontSize,
  handleMouseDown,
  previewWatermark,
  selectedFieldId,
  setShowCrosshairs,
  setShowGrid,
  setSnapToGrid,
  showCrosshairs,
  showGrid,
  snapToGrid,
}) => (
  <div className="relative">
    <div className="mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        {activeTab === 'capa'
          ? 'Editor da Capa (Clique e arraste os textos)'
          : 'Visualização da Contracapa (Clique para selecionar/arrastar assinaturas e logos)'}
      </p>
      <div className="flex items-center gap-4 text-[10px] font-black uppercase text-slate-500 tracking-wider">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(event) => setShowGrid(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-600"
          />
          Grade 10%
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showCrosshairs}
            onChange={(event) => setShowCrosshairs(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-600"
          />
          Linhas Guia
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={snapToGrid}
            onChange={(event) => setSnapToGrid(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-600"
          />
          Atrair (Snap)
        </label>
      </div>
    </div>

    <div
      ref={canvasRef}
      className="relative w-full aspect-[297/210] overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-inner select-none"
    >
      {activeTab === 'capa' ? (
        <img
          src={form.capaUrl || capaDiarioPadrao}
          alt="Capa do Diário"
          className="absolute inset-0 w-full h-full object-fill pointer-events-none z-0"
        />
      ) : form.contracapaUrl ? (
        <img
          src={form.contracapaUrl}
          alt="Contracapa do Diário"
          className="absolute inset-0 w-full h-full object-fill pointer-events-none z-0"
        />
      ) : (
        previewWatermark?.url && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden select-none">
            <img
              src={previewWatermark.url}
              alt="Marca d'água"
              style={{
                width: `${previewWatermark.scale}%`,
                opacity: previewWatermark.opacity,
                transform: previewWatermark.rotate ? 'rotate(-22deg)' : 'none',
                objectFit: 'contain',
              }}
            />
          </div>
        )
      )}

      {showGrid && <GridLines />}
      {currentField && showCrosshairs && <Crosshairs field={currentField} />}

      {activeTab === 'capa' ? (
        capaCampos
          .filter((field) => field.visible)
          .map((field) => (
            <DraggableField
              key={field.id}
              field={field}
              isDragging={draggingField === field.id}
              isSelected={selectedFieldId === field.id}
              getPxFontSize={getPxFontSize}
              onMouseDown={handleMouseDown}
            />
          ))
      ) : (
        form.imprimirValidacaoContracapa && (
          <>
            <BackCoverValidationCard form={form} />
            {(form.contracapaCampos || [])
              .filter((field) => field.visible && field.isImage)
              .map((field) => (
                <DraggableField
                  key={field.id}
                  field={field}
                  isDragging={draggingField === field.id}
                  isSelected={selectedFieldId === field.id}
                  getPxFontSize={getPxFontSize}
                  onMouseDown={handleMouseDown}
                />
              ))}
          </>
        )
      )}
    </div>
  </div>
);

const GridLines = () => (
  <div className="absolute inset-0 pointer-events-none z-0">
    {Array.from({ length: 9 }).map((_, index) => (
      <div
        key={`v-${index}`}
        className="absolute h-full border-l border-dashed border-slate-300/40"
        style={{ left: `${(index + 1) * 10}%` }}
      />
    ))}
    {Array.from({ length: 9 }).map((_, index) => (
      <div
        key={`h-${index}`}
        className="absolute w-full border-t border-dashed border-slate-300/40"
        style={{ top: `${(index + 1) * 10}%` }}
      />
    ))}
  </div>
);

const Crosshairs: React.FC<{ field: CapaCampo }> = ({ field }) => (
  <div className="absolute inset-0 pointer-events-none z-0">
    <div className="absolute h-full border-l border-blue-400/60" style={{ left: `${field.x}%` }} />
    <div className="absolute w-full border-t border-blue-400/60" style={{ top: `${field.y}%` }} />
  </div>
);

interface DraggableFieldProps {
  field: CapaCampo;
  getPxFontSize: (ptSize: number) => number;
  isDragging: boolean;
  isSelected: boolean;
  onMouseDown: (event: React.MouseEvent, fieldId: string, currentX: number, currentY: number) => void;
}

const DraggableField: React.FC<DraggableFieldProps> = ({
  field,
  getPxFontSize,
  isDragging,
  isSelected,
  onMouseDown,
}) => (
  <div
    onMouseDown={(event) => onMouseDown(event, field.id, field.x, field.y)}
    className={`${field.isImage ? 'absolute p-1 group border transition-all' : 'absolute p-1 group transition-colors border'} ${
      isSelected
        ? `border-blue-500 bg-blue-50/20 shadow-sm ${field.isImage ? 'z-20' : 'z-10'}`
        : `border-transparent hover:border-slate-300 hover:bg-slate-100/10 ${field.isImage ? 'z-10' : ''}`
    }`}
    style={{
      left: `${field.x}%`,
      top: `${field.y}%`,
      width: `${field.width}%`,
      cursor: isDragging ? 'grabbing' : 'grab',
      mixBlendMode: field.isImage ? field.mixBlendMode || 'multiply' : undefined,
    }}
  >
    {isSelected && (
      <div className="absolute -top-6 left-0 flex items-center gap-1 rounded bg-blue-600 px-1.5 py-0.5 text-[8px] font-black text-white shadow-sm pointer-events-none">
        <Move size={8} />
        {field.x}% , {field.y}%
      </div>
    )}
    {field.isImage ? (
      <img
        src={field.imageUrl}
        alt={field.label}
        className="w-full h-auto object-contain pointer-events-none"
        style={{ mixBlendMode: field.mixBlendMode || 'multiply' }}
      />
    ) : (
      <div
        style={{
          fontSize: `${getPxFontSize(field.fontSize)}px`,
          fontWeight: field.bold ? 'bold' : 'normal',
          color: field.color || '#071a33',
          textAlign: field.align || 'left',
          borderTop: field.borderTop ? `1px solid ${field.color || '#071a33'}` : 'none',
          paddingTop: field.borderTop ? '3px' : '0px',
          lineHeight: '1.2',
          wordBreak: 'break-word',
        }}
      >
        {field.label && <strong>{field.label}</strong>}
        {field.valuePlaceholder}
      </div>
    )}
  </div>
);

const BackCoverValidationCard: React.FC<{ form: DiarioTemplate }> = ({ form }) => (
  <div className="absolute inset-[5%_6%_5%_8%] border border-[#071a33]/25 p-5 flex flex-col justify-between rounded-xl text-[#071a33] z-10 overflow-hidden pointer-events-none select-none">
    <div className="flex justify-between items-start border-b border-[#071a33]/15 pb-2 text-left">
      <div className="w-full">
        <h3 className="text-[12px] font-black uppercase tracking-tight leading-snug w-[75%]">
          Registro de Validação<br />e Assinatura Eletrônica
        </h3>
      </div>
    </div>
    <div className="grid grid-cols-[1fr_125px] gap-4 my-2 text-[8px] text-left leading-tight">
      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <div><strong>CURSO:</strong> [Nome do Curso]</div>
          <div><strong>TURMA:</strong> [Nome da Turma]</div>
          <div className="col-span-2"><strong>UNIDADE EDUCACIONAL:</strong> [Componente Curricular]</div>
          <div><strong>MÓDULO:</strong> [Módulo I]</div>
          <div><strong>PROFESSOR(A):</strong> [Nome do Professor]</div>
        </div>
        <div className="border-t border-[#071a33]/10 pt-1 text-slate-600 font-medium leading-normal text-[7.5px]">
          {form.mensagemValidacao || 'Este diário de classe eletrônico foi gerado e assinado digitalmente nos termos do Regimento Escolar da instituição e da legislação de validação de documentos acadêmicos do Ministério da Educação.'}
        </div>
        <div className="bg-slate-50/30 border border-slate-100/30 p-1.5 rounded font-mono text-[7px] text-slate-500">
          <div><strong>Chave de Autenticação:</strong> DIA-TECNICO-XXXXXXXX</div>
          <div className="mt-0.5"><strong>Endereço de Validação:</strong> www.universocock.com.br/validador</div>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center border-l border-slate-200/20 pl-2">
        <img
          src={getDocumentValidationQrUrl('DIA-TECNICO-XXXXXXXX', 150)}
          alt="QR Code"
          className="bg-white p-1 border border-slate-200 rounded"
          style={{
            width: `${form.qrCodeSize || 28}mm`,
            height: `${form.qrCodeSize || 28}mm`,
            maxWidth: '75px',
            maxHeight: '75px',
            objectFit: 'contain',
          }}
        />
        <div className="text-center mt-1">
          <span className="block text-[4.5px] font-black text-slate-400 tracking-widest leading-none">CÓD. VALIDAÇÃO</span>
          <span className="block text-[5.5px] font-mono font-bold text-blue-600 leading-none mt-0.5">DIA-TECNICO-XXXXXXXX</span>
        </div>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-8 text-center border-t border-[#071a33]/10 pt-2 text-[8px]">
      <SignatureLine name={form.diretorNome} role={form.diretorCargo || 'Diretor(a) Geral'} />
      <SignatureLine name={form.secretarioNome} role={form.secretarioCargo || 'Secretaria Acadêmica'} />
    </div>
  </div>
);

const SignatureLine: React.FC<{ name?: string; role: string }> = ({ name, role }) => (
  <div className="flex flex-col items-center justify-end h-10">
    <div className="border-b border-slate-400 w-full mb-0.5" />
    <p className="font-bold leading-none">{name || '—'}</p>
    <p className="text-[6.5px] text-slate-500 uppercase font-black mt-0.5 leading-none">{role}</p>
  </div>
);

export default DiarioEditorCanvas;
