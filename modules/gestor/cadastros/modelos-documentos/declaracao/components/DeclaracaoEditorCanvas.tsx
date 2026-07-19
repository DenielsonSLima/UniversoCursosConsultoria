import React from 'react';
import { AlignJustify, GripVertical, Trash2 } from 'lucide-react';
import DocumentHeader from '../../../../components/DocumentHeader';
import { sanitizedHtml } from '../../../../../../lib/htmlSanitizer';
import type { AbsoluteField } from './declaracao-editor.types';
import { PAGE_HEIGHT, PAGE_WIDTH } from './declaracao-editor.utils';

interface DeclaracaoAbsoluteFieldProps {
  field: AbsoluteField;
  onFieldMouseDown: (event: React.MouseEvent, id: string) => void;
  onRemoveField: (id: string) => void;
  pageIndex: number;
  qrCodeExampleUrl: string;
  selected: boolean;
  validationCode: string;
}

const DeclaracaoAbsoluteField: React.FC<DeclaracaoAbsoluteFieldProps> = ({
  field,
  onFieldMouseDown,
  onRemoveField,
  pageIndex,
  qrCodeExampleUrl,
  selected,
  validationCode,
}) => {
  const pageTop = Number(field.y || 0) - (pageIndex * PAGE_HEIGHT);

  return (
    <div
      onMouseDown={event => onFieldMouseDown(event, field.id)}
      onClick={event => event.stopPropagation()}
      className={`absolute z-30 cursor-move group flex items-center justify-center transition-all ${
        selected
          ? 'border-2 border-blue-500 shadow-md ring-2 ring-blue-500/20'
          : field.type === 'text'
            ? 'bg-yellow-50/20 border border-yellow-200/50 hover:bg-yellow-100 hover:border-yellow-400 px-2 py-1 rounded'
            : 'border-2 border-transparent hover:border-blue-400 hover:bg-slate-50/5'
      }`}
      style={{
        left: field.x,
        top: pageTop,
        color: '#000',
        width: field.width ? `${field.width}px` : 'auto',
        height: 'auto',
        ...field.style,
      }}
    >
      {field.type === 'qrcode' && (
        <div className="w-full bg-white p-1.5 shadow-sm rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
          <div className="w-full aspect-square bg-white flex items-center justify-center mb-1">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrCodeExampleUrl)}`}
              alt="QR Code"
              className="w-full h-full object-contain pointer-events-none"
            />
          </div>
          <div className="w-full flex flex-col gap-0.5 border-t border-slate-100 pt-1 mt-0.5 select-all">
            <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest leading-none">
              CÓD. VALIDAÇÃO
            </p>
            <p className="text-[9px] font-mono font-black text-blue-600 tracking-wider mt-1 leading-none">
              {validationCode}
            </p>
          </div>
        </div>
      )}

      {field.type === 'image' && (
        <img
          src={field.value}
          alt="Assinatura"
          className="w-full h-auto object-contain pointer-events-none"
        />
      )}

      {field.type === 'text' && (
        <div className="flex items-center w-full">
          <GripVertical size={12} className="text-yellow-600 opacity-50 hidden group-hover:block mr-1 shrink-0" />
          <span dangerouslySetInnerHTML={sanitizedHtml(field.value)} className="w-full break-words" />
        </div>
      )}

      <button
        onMouseDown={event => event.stopPropagation()}
        onClick={event => {
          event.stopPropagation();
          onRemoveField(field.id);
        }}
        className="absolute -top-3 -right-3 ml-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-1 shadow-md border border-slate-100 z-50"
        title="Remover"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
};

interface DeclaracaoEditorCanvasProps {
  absoluteFields: AbsoluteField[];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  documentTitle: string;
  editorRef: React.RefObject<HTMLDivElement | null>;
  onDrop: (event: React.DragEvent, pageIndex: number) => void;
  onFieldMouseDown: (event: React.MouseEvent, id: string) => void;
  onRemoveField: (id: string) => void;
  onSelectField: (id: string | null) => void;
  onTextInput: (event: React.FormEvent<HTMLDivElement>, pageIndex: number) => void;
  pageCount: number;
  polo: any;
  qrCodeExampleUrl: string;
  selectedField?: AbsoluteField;
  textPages: string[];
  validationCode: string;
  watermark: any;
}

const DeclaracaoEditorCanvas: React.FC<DeclaracaoEditorCanvasProps> = ({
  absoluteFields,
  canvasRef,
  documentTitle,
  editorRef,
  onDrop,
  onFieldMouseDown,
  onRemoveField,
  onSelectField,
  onTextInput,
  pageCount,
  polo,
  qrCodeExampleUrl,
  selectedField,
  textPages,
  validationCode,
  watermark,
}) => {
  const pageIndexForField = (field: AbsoluteField) => Math.max(
    0,
    Math.min(pageCount - 1, Math.floor(Number(field.y || 0) / PAGE_HEIGHT)),
  );

  return (
    <div
      onClick={() => onSelectField(null)}
      className="flex-1 bg-slate-200/50 rounded-[2rem] border border-slate-300/50 overflow-auto p-8 custom-scrollbar shadow-inner relative animate-fadeIn"
    >
      <div ref={canvasRef} className="flex min-w-[860px] flex-col items-center gap-10">
        {Array.from({ length: pageCount }).map((_, pageIndex) => (
          <div key={`page-${pageIndex}`} className="relative">
            <div className="mb-3 flex items-center justify-center">
              <span className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 shadow-sm">
                Página {pageIndex + 1} de {pageCount}
              </span>
            </div>

            <div
              className="bg-white shadow-2xl relative transition-transform duration-300 shrink-0 overflow-hidden"
              style={{
                width: `${PAGE_WIDTH}px`,
                height: `${PAGE_HEIGHT}px`,
                padding: '60px 80px',
                position: 'relative',
                backgroundImage: `
                  linear-gradient(to right, rgba(14, 165, 233, 0.08) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(14, 165, 233, 0.08) 1px, transparent 1px)
                `,
                backgroundSize: '20px 20px',
              }}
              onDrop={event => onDrop(event, pageIndex)}
              onDragOver={event => event.preventDefault()}
              onClick={event => {
                if (event.currentTarget === event.target) onSelectField(null);
              }}
            >
              <div className="pointer-events-none absolute inset-0 z-[1]">
                <div className="absolute top-0 bottom-0 left-1/2 border-l border-blue-500/35" />
                <div className="absolute left-0 right-0 top-1/2 border-t border-blue-500/25" />
                <div
                  className="absolute border border-dashed border-slate-300/80"
                  style={{ left: 80, right: 80, top: 60, bottom: 60 }}
                />
                {selectedField && pageIndexForField(selectedField) === pageIndex && (
                  <>
                    <div
                      className="absolute top-0 bottom-0 border-l border-emerald-500/45"
                      style={{ left: selectedField.x }}
                    />
                    <div
                      className="absolute left-0 right-0 border-t border-emerald-500/45"
                      style={{ top: Number(selectedField.y || 0) - (pageIndex * PAGE_HEIGHT) }}
                    />
                  </>
                )}
              </div>

              {watermark?.watermarkUrl && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
                  <img
                    src={watermark.watermarkUrl}
                    alt="Watermark"
                    style={{
                      opacity: watermark.watermarkOpacity || 0.1,
                      width: `${watermark.watermarkScale || 50}%`,
                      transform: watermark.watermarkRotate !== false ? 'rotate(-45deg)' : 'none',
                    }}
                  />
                </div>
              )}

              <DocumentHeader polo={polo} orientation="portrait" />

              {pageIndex === 0 && (
                <div className="text-center mb-12 relative z-10">
                  <h2 className="text-2xl font-bold text-[#001a33] uppercase underline decoration-2 decoration-blue-600 underline-offset-4">
                    {documentTitle}
                  </h2>
                </div>
              )}

              <div className="relative z-20 group mb-20">
                <div className="mb-2 flex justify-end">
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 shadow-sm">
                    <AlignJustify size={11} className="text-blue-600" /> Texto justificado
                  </span>
                </div>
                <div
                  ref={pageIndex === 0 ? editorRef : undefined}
                  contentEditable
                  onInput={event => onTextInput(event, pageIndex)}
                  dangerouslySetInnerHTML={sanitizedHtml(textPages[pageIndex] || '')}
                  className="min-h-[160px] outline-none text-justify leading-loose text-lg p-4 border border-transparent hover:border-blue-100 rounded-lg transition-colors cursor-text text-black"
                  style={{ fontFamily: '"Times New Roman", Times, serif', color: '#000000' }}
                />
              </div>

              {absoluteFields
                .filter(field => pageIndexForField(field) === pageIndex)
                .map(field => (
                  <DeclaracaoAbsoluteField
                    key={field.id}
                    field={field}
                    onFieldMouseDown={onFieldMouseDown}
                    onRemoveField={onRemoveField}
                    pageIndex={pageIndex}
                    qrCodeExampleUrl={qrCodeExampleUrl}
                    selected={selectedField?.id === field.id}
                    validationCode={validationCode}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DeclaracaoEditorCanvas;
