import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AlignJustify, GripVertical, MoveDiagonal2, Trash2 } from 'lucide-react';
import DocumentHeader from '../../../../components/DocumentHeader';
import { escapeHtmlText, sanitizedHtml } from '../../../../../../lib/htmlSanitizer';
import type { AbsoluteField } from './declaracao-editor.types';
import { PAGE_HEIGHT, PAGE_WIDTH } from './declaracao-editor.utils';

interface EnrollmentFormPreview {
  customFields: Array<{ id?: string | number; label?: string }>;
  requiresSignature: boolean;
  term: string;
}

const withEditorAssetPlaceholders = (
  html: string,
  enrollmentFormPreview: EnrollmentFormPreview,
) => {
  const termHtml = String(enrollmentFormPreview.term || '')
    .split(/\r?\n/)
    .map(line => escapeHtmlText(line))
    .join('<br>');
  const customFields = enrollmentFormPreview.customFields
    .filter(field => String(field?.label || '').trim());
  const customFieldsHtml = customFields.length
    ? customFields.map(field => `
        <div style="border-bottom:1px solid #0f172a;padding:0 3px 5px;font-size:9px;color:#475569;text-transform:uppercase;">
          ${escapeHtmlText(String(field.label).trim())}
        </div>
      `).join('')
    : '<p style="margin:0;color:#94a3b8;font-size:10px;text-align:center;">Nenhum campo extra configurado</p>';
  const signaturesHtml = enrollmentFormPreview.requiresSignature
    ? `
        <div style="border-top:1px solid #0f172a;padding-top:5px;">ASSINATURA DO ALUNO OU RESPONSÁVEL</div>
        <div style="border-top:1px solid #0f172a;padding-top:5px;">DEFERIMENTO DA DIRETORIA</div>
      `
    : '<p style="margin:0;color:#94a3b8;font-size:10px;text-align:center;">Área de assinaturas desativada</p>';

  return html
    .replace(/src=(["']){{ALUNO_FOTO_URL}}\1/gi, 'src="/sem-foto-aluno.svg"')
    .replace(
      /{{FICHA_TERMO}}/g,
      `<section data-template-token="FICHA_TERMO">${termHtml}</section>`,
    )
    .replace(
      /{{FICHA_CAMPOS_EXTRAS}}/g,
      `<section data-template-token="FICHA_CAMPOS_EXTRAS" style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-top:7px;">${customFieldsHtml}</section>`,
    )
    .replace(
      /{{FICHA_ASSINATURAS}}/g,
      `<section data-template-token="FICHA_ASSINATURAS" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px;text-align:center;font-size:8px;color:#0f172a;">${signaturesHtml}</section>`,
    );
};

interface DeclaracaoAbsoluteFieldProps {
  enrollmentFormPreview: EnrollmentFormPreview;
  field: AbsoluteField;
  onFieldMouseDown: (event: React.MouseEvent, id: string) => void;
  onFieldResizeMouseDown: (event: React.MouseEvent, id: string) => void;
  onRemoveField: (id: string) => void;
  pageIndex: number;
  qrCodeExampleUrl: string;
  selected: boolean;
  validationCode: string;
}

const LocalQrImage: React.FC<{ value: string }> = ({ value }) => {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: 300, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc('');
      });
    return () => {
      active = false;
    };
  }, [value]);

  return src
    ? <img src={src} alt="QR Code" className="h-full w-full object-contain pointer-events-none" />
    : <span className="text-[8px] font-black uppercase tracking-widest text-slate-300">Gerando QR...</span>;
};

const DeclaracaoAbsoluteField: React.FC<DeclaracaoAbsoluteFieldProps> = ({
  enrollmentFormPreview,
  field,
  onFieldMouseDown,
  onFieldResizeMouseDown,
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
        height: field.height ? `${field.height}px` : 'auto',
        overflow: field.height ? 'hidden' : 'visible',
        ...field.style,
      }}
    >
      {field.type === 'qrcode' && (
        <div className="w-full bg-white p-1.5 shadow-sm rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
          <div className="w-full aspect-square bg-white flex items-center justify-center mb-1">
            <LocalQrImage value={qrCodeExampleUrl} />
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
          src={field.value === '{{ALUNO_FOTO_URL}}' ? '/sem-foto-aluno.svg' : field.value}
          alt={field.value === '{{ALUNO_FOTO_URL}}' ? 'Foto do aluno' : 'Elemento visual'}
          className={`w-full object-contain pointer-events-none ${field.height ? 'h-full' : 'h-auto'}`}
        />
      )}

      {field.type === 'text' && (
        <div className="flex items-center w-full">
          <GripVertical size={12} className="text-yellow-600 opacity-50 hidden group-hover:block mr-1 shrink-0" />
          <div
            dangerouslySetInnerHTML={sanitizedHtml(withEditorAssetPlaceholders(
              field.value,
              enrollmentFormPreview,
            ))}
            className="w-full break-words"
          />
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

      {selected && (
        <button
          type="button"
          onMouseDown={event => onFieldResizeMouseDown(event, field.id)}
          onClick={event => event.stopPropagation()}
          className="absolute -bottom-3 -right-3 z-50 flex h-6 w-6 cursor-nwse-resize items-center justify-center rounded-full border-2 border-white bg-blue-600 text-white shadow-lg"
          title="Arrastar para redimensionar"
          aria-label="Redimensionar elemento"
        >
          <MoveDiagonal2 size={12} />
        </button>
      )}
    </div>
  );
};

interface DeclaracaoEditorCanvasProps {
  absoluteFields: AbsoluteField[];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  documentTitle: string;
  editorRef: React.RefObject<HTMLDivElement | null>;
  enrollmentFormPreview: EnrollmentFormPreview;
  onDrop: (event: React.DragEvent, pageIndex: number) => void;
  onFieldMouseDown: (event: React.MouseEvent, id: string) => void;
  onFieldResizeMouseDown: (event: React.MouseEvent, id: string) => void;
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
  enrollmentFormPreview,
  onDrop,
  onFieldMouseDown,
  onFieldResizeMouseDown,
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
  const pageHasEditableText = (pageIndex: number) => (
    String(textPages[pageIndex] || '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;|&#160;/gi, '')
      .trim()
      .length > 0
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
                padding: '76px',
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
                  style={{ left: 76, right: 76, top: 76, bottom: 76 }}
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
                <div className="relative z-10 mb-12 mt-6 text-center">
                  <h2 className="text-2xl font-bold text-[#001a33] uppercase underline decoration-2 decoration-blue-600 underline-offset-4">
                    {documentTitle}
                  </h2>
                </div>
              )}

              <div className={`relative z-20 group ${pageHasEditableText(pageIndex) ? 'mb-20' : 'h-px overflow-hidden pointer-events-none'}`}>
                {pageHasEditableText(pageIndex) && (
                  <div className="pointer-events-none absolute -top-7 right-0 z-30 flex justify-end">
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 shadow-sm">
                      <AlignJustify size={11} className="text-blue-600" /> Texto justificado
                    </span>
                  </div>
                )}
                <div
                  ref={pageIndex === 0 ? editorRef : undefined}
                  contentEditable
                  onInput={event => onTextInput(event, pageIndex)}
                  dangerouslySetInnerHTML={sanitizedHtml(withEditorAssetPlaceholders(
                    textPages[pageIndex] || '',
                    enrollmentFormPreview,
                  ))}
                  className={pageHasEditableText(pageIndex)
                    ? 'min-h-[160px] cursor-text rounded-lg text-justify text-lg leading-loose text-black outline-none ring-1 ring-transparent transition-shadow hover:ring-blue-100'
                    : 'h-px min-h-0 overflow-hidden opacity-0'}
                  style={{ fontFamily: '"Times New Roman", Times, serif', color: '#000000' }}
                />
              </div>

              {absoluteFields
                .filter(field => pageIndexForField(field) === pageIndex)
                .map(field => (
                  <DeclaracaoAbsoluteField
                    key={field.id}
                    enrollmentFormPreview={enrollmentFormPreview}
                    field={field}
                    onFieldMouseDown={onFieldMouseDown}
                    onFieldResizeMouseDown={onFieldResizeMouseDown}
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
