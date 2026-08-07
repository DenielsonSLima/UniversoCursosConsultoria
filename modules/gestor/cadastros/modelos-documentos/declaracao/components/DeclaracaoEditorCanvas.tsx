import React from 'react';
import { AlignJustify, GripVertical, MoveDiagonal2, Trash2 } from 'lucide-react';
import DocumentHeader from '../../../../components/DocumentHeader';
import { escapeHtmlText, sanitizedHtml } from '../../../../../../lib/htmlSanitizer';
import { LocalQrCodeImage } from '../../../../../shared/qrcode/LocalQrCodeImage';
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
  const historyTableHtml = `
    <section data-template-token="TABELA_HISTORICO_ESCOLAR">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-family:Arial,Helvetica,sans-serif;font-size:6.5px;line-height:1.05;color:#000;">
        <thead>
          <tr>
            <th rowspan="2" style="width:49%;border:1px solid #111;padding:2px;">MÓDULO / UNIDADE CURRICULAR</th>
            <th colspan="3" style="border:1px solid #111;padding:2px;">CARGA HORÁRIA</th>
            <th colspan="2" style="border:1px solid #111;padding:2px;">NOTA</th>
            <th colspan="2" style="border:1px solid #111;padding:2px;">FREQUÊNCIA</th>
            <th rowspan="2" style="width:12%;border:1px solid #111;padding:2px;">SITUAÇÃO</th>
          </tr>
          <tr>
            <th style="border:1px solid #111;padding:1px;">T</th><th style="border:1px solid #111;padding:1px;">P</th><th style="border:1px solid #111;padding:1px;">E</th>
            <th style="border:1px solid #111;padding:1px;">T/P</th><th style="border:1px solid #111;padding:1px;">E</th>
            <th style="border:1px solid #111;padding:1px;">T/P</th><th style="border:1px solid #111;padding:1px;">E</th>
          </tr>
        </thead>
        <tbody>
          <tr><th colspan="9" style="border:1px solid #111;padding:2px;text-align:left;">MÓDULO I</th></tr>
          <tr><td style="border:1px solid #111;padding:2px;">Relações Humanas no Trabalho</td><td style="border:1px solid #111;text-align:center;">20</td><td style="border:1px solid #111;text-align:center;">-</td><td style="border:1px solid #111;text-align:center;">-</td><td style="border:1px solid #111;text-align:center;">9,0</td><td style="border:1px solid #111;text-align:center;">-</td><td style="border:1px solid #111;text-align:center;">100%</td><td style="border:1px solid #111;text-align:center;">-</td><td style="border:1px solid #111;text-align:center;">Aprovado</td></tr>
          <tr><td colspan="9" style="border:1px solid #111;padding:3px;text-align:center;color:#64748b;font-style:italic;">A grade completa será inserida automaticamente na emissão.</td></tr>
        </tbody>
      </table>
    </section>`;

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
    )
    .replace(/{{TABELA_HISTORICO_ESCOLAR}}/g, historyTableHtml);
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
  readOnly?: boolean;
}

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
  readOnly = false,
}) => {
  const pageTop = Number(field.y || 0) - (pageIndex * PAGE_HEIGHT);

  return (
    <div
      onMouseDown={event => {
        if (!readOnly) onFieldMouseDown(event, field.id);
      }}
      onClick={event => event.stopPropagation()}
      className={`absolute z-30 group flex items-center justify-center transition-all ${
        readOnly
          ? 'cursor-default'
          : selected
            ? 'cursor-move shadow-md ring-2 ring-blue-500 ring-offset-1'
            : field.type === 'text'
              ? 'cursor-move rounded bg-yellow-50/20 ring-1 ring-inset ring-yellow-200/50 hover:bg-yellow-100 hover:ring-yellow-400'
              : 'cursor-move ring-2 ring-inset ring-transparent hover:bg-slate-50/5 hover:ring-blue-400'
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
            <LocalQrCodeImage
              value={qrCodeExampleUrl}
              size={300}
              alt="QR Code"
              className="pointer-events-none h-full w-full"
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
          src={field.value === '{{ALUNO_FOTO_URL}}' ? '/sem-foto-aluno.svg' : field.value}
          alt={field.value === '{{ALUNO_FOTO_URL}}' ? 'Foto do aluno' : 'Elemento visual'}
          className={`w-full pointer-events-none ${field.height ? 'h-full' : 'h-auto'}`}
          style={{
            display: 'block',
            objectFit: field.style?.objectFit || 'contain',
            objectPosition: field.style?.objectPosition || 'center',
          }}
        />
      )}

      {field.type === 'text' && (
        <div
          className={`relative flex w-full ${
            field.height ? 'h-full items-stretch' : 'items-center'
          }`}
        >
          {!readOnly && (
            <GripVertical
              size={12}
              className="pointer-events-none absolute left-0 top-1/2 hidden -translate-y-1/2 text-yellow-600 opacity-50 group-hover:block"
            />
          )}
          <div
            dangerouslySetInnerHTML={sanitizedHtml(withEditorAssetPlaceholders(
              field.value,
              enrollmentFormPreview,
            ))}
            className={`${field.height ? 'h-full' : ''} w-full break-words`}
          />
        </div>
      )}

      {!readOnly && <button
        onMouseDown={event => event.stopPropagation()}
        onClick={event => {
          event.stopPropagation();
          onRemoveField(field.id);
        }}
        className="absolute -top-3 -right-3 ml-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-1 shadow-md border border-slate-100 z-50"
        title="Remover"
      >
        <Trash2 size={12} />
      </button>}

      {selected && !readOnly && (
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
  readOnly?: boolean;
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
  readOnly = false,
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
              onDrop={event => {
                if (!readOnly) onDrop(event, pageIndex);
              }}
              onDragOver={event => {
                if (!readOnly) event.preventDefault();
              }}
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
                  contentEditable={!readOnly}
                  suppressContentEditableWarning
                  onInput={event => {
                    if (!readOnly) onTextInput(event, pageIndex);
                  }}
                  dangerouslySetInnerHTML={sanitizedHtml(withEditorAssetPlaceholders(
                    textPages[pageIndex] || '',
                    enrollmentFormPreview,
                  ))}
                  className={pageHasEditableText(pageIndex)
                    ? `min-h-[160px] rounded-lg text-justify text-lg leading-loose text-black outline-none ring-1 ring-transparent transition-shadow ${
                      readOnly ? 'cursor-default' : 'cursor-text hover:ring-blue-100'
                    }`
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
                    readOnly={readOnly}
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
