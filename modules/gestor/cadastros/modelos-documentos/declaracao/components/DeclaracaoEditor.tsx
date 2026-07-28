import React, { useEffect, useRef, useState } from 'react';
import { declaracaoService } from '../declaracao.service';
import { marcaDaguaService } from '../../../../configuracoes/marca-dagua/marca-dagua.service';
import { assinaturasService } from '../../../../configuracoes/assinaturas/assinaturas.service';
import { getDocumentValidationUrl } from '../../../../../shared/document-validation/document-validation.url';
import {
  escapeHtmlText,
  sanitizeHtml,
  sanitizeTemplateFields,
} from '../../../../../../lib/htmlSanitizer';
import DeclaracaoEditorCanvas from './DeclaracaoEditorCanvas';
import DeclaracaoEditorSidebar from './DeclaracaoEditorSidebar';
import DeclaracaoEditorToast from './DeclaracaoEditorToast';
import DeclaracaoEditorToolbar from './DeclaracaoEditorToolbar';
import type {
  AbsoluteField,
  CentralSignatureRole,
  DeclaracaoEditorProps,
  DraggedEditorItem,
  EditorToast,
  EditorVariable,
} from './declaracao-editor.types';
import {
  appendDeclarationDefaultFields,
  DECLARACAO_VARIABLES,
  PAGE_BREAK_HTML,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  splitDocumentPages,
} from './declaracao-editor.utils';

const DeclaracaoEditor: React.FC<DeclaracaoEditorProps> = ({
  polo,
  onBack,
  service = declaracaoService,
  editorTitle = 'Editor de Declaração',
  documentTitle = 'Declaração de Matrícula',
  variables = DECLARACAO_VARIABLES,
  validationPrefix = 'DEC',
  defaultValidityDays = 30,
  showValidity = true,
  migrateDeclarationDefaults = true,
  hideBackButton = false,
  scopeLabel,
  enableEnrollmentSettings = false,
  studentPreview,
  studentPreviewLoading = false,
  studentPreviewError,
  onLoadStudentPreview,
  onClearStudentPreview,
}) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [watermark, setWatermark] = useState<any>(null);
  const [qrConfig, setQrConfig] = useState<any>(null);
  const [textContent, setTextContent] = useState('');
  const [absoluteFields, setAbsoluteFields] = useState<AbsoluteField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [validityDays, setValidityDays] = useState<number>(defaultValidityDays);
  const [pageCount, setPageCount] = useState<number>(1);
  const [templateVersion, setTemplateVersion] = useState<number>(2);
  const [enrollmentFormPreview, setEnrollmentFormPreview] = useState({
    customFields: [] as Array<{ id?: string | number; label?: string }>,
    requiresSignature: true,
    term: '',
  });
  const [toast, setToast] = useState<EditorToast | null>(null);
  const [draggedItem, setDraggedItem] = useState<DraggedEditorItem | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedField = absoluteFields.find(field => field.id === selectedFieldId);
  const previewActive = Boolean(studentPreview);

  const showToast = (message: string, type: EditorToast['type'] = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const loadDataUnsafe = async () => {
    const template = await service.getTemplate(polo.id);
    setTextContent(sanitizeHtml(template.textContent));
    setValidityDays(template.validityDays || defaultValidityDays);
    setPageCount(Math.max(1, Number(template.pageCount || 1)));
    setTemplateVersion(Math.max(2, Number(template.v || 2)));
    setEnrollmentFormPreview({
      customFields: Array.isArray(template.enrollmentFormCustomFields)
        ? template.enrollmentFormCustomFields
        : [],
      requiresSignature: template.enrollmentFormRequiresSignature !== false,
      term: String(template.enrollmentFormTerm || ''),
    });

    let loadedFields: AbsoluteField[] = (template.absoluteFields || []).map((field: any) => ({
      ...field,
      type: field.type || 'text',
    }));

    if (migrateDeclarationDefaults && (!template.v || template.v < 2)) {
      loadedFields = appendDeclarationDefaultFields(loadedFields);
    }
    setAbsoluteFields(sanitizeTemplateFields(loadedFields) as AbsoluteField[]);

    const watermarks = await marcaDaguaService.getCompaniesWithWatermark();
    const loadedWatermark = watermarks.find(item => item.id === polo.id)
      || watermarks.find(item => item.id === polo.company_id)
      || (polo.watermark_url ? {
        id: polo.id,
        nomeFantasia: polo.nome || '',
        cidade: polo.cidade || '',
        uf: polo.estado || '',
        watermarkUrl: polo.watermark_url,
        watermarkOpacity: Number(polo.watermark_opacity ?? 0.1),
        watermarkScale: Number(polo.watermark_scale ?? 50),
        watermarkRotate: polo.watermark_rotate !== false,
      } : null)
      || watermarks[0];
    setWatermark(loadedWatermark);

    const qrData = await service.getQrConfig();
    setQrConfig(qrData);

  };

  const loadData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      await loadDataUnsafe();
    } catch (error) {
      console.error('[DeclaracaoEditor] Erro ao carregar o modelo:', error);
      setLoadError('Não foi possível carregar o modelo visual.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [polo.id]);

  useEffect(() => {
    if (previewActive) setSelectedFieldId(null);
  }, [previewActive]);

  const updateSelectedField = (updates: Partial<AbsoluteField>) => {
    if (!selectedFieldId) return;
    setAbsoluteFields(previous => previous.map(field => (
      field.id === selectedFieldId ? { ...field, ...updates } : field
    )));
  };

  const updateSelectedFieldStyle = (styleUpdates: React.CSSProperties) => {
    if (!selectedFieldId) return;
    setAbsoluteFields(previous => previous.map(field => {
      if (field.id !== selectedFieldId) return field;
      return {
        ...field,
        style: {
          ...(field.style || {}),
          ...styleUpdates,
        },
      };
    }));
  };

  const handleInsertVariable = (variableCode: string) => {
    document.execCommand('insertText', false, variableCode);
  };

  const handleTextInput = (event: React.FormEvent<HTMLDivElement>, pageIndex = 0) => {
    const nextHtml = sanitizeHtml(event.currentTarget.innerHTML)
      .replace(
        /src=(["'])(?:https?:\/\/[^"']+)?\/sem-foto-aluno\.svg\1/gi,
        'src="{{ALUNO_FOTO_URL}}"',
      )
      .replace(
        /<section[^>]*data-template-token=(["'])FICHA_TERMO\1[^>]*>[\s\S]*?<\/section>/gi,
        '{{FICHA_TERMO}}',
      )
      .replace(
        /<section[^>]*data-template-token=(["'])FICHA_CAMPOS_EXTRAS\1[^>]*>[\s\S]*?<\/section>/gi,
        '{{FICHA_CAMPOS_EXTRAS}}',
      )
      .replace(
        /<section[^>]*data-template-token=(["'])FICHA_ASSINATURAS\1[^>]*>[\s\S]*?<\/section>/gi,
        '{{FICHA_ASSINATURAS}}',
      );
    if (pageCount <= 1) {
      setTextContent(nextHtml);
      return;
    }

    const pages = splitDocumentPages(textContent, pageCount);
    pages[pageIndex] = nextHtml;
    setTextContent(pages.join(PAGE_BREAK_HTML));
  };

  const addImageField = (value: string) => {
    const generatedId = Math.random().toString(36).substr(2, 9);
    const newField: AbsoluteField = {
      id: generatedId,
      type: 'image',
      value,
      x: 250,
      y: 850,
      width: 200,
      style: { zIndex: 50, mixBlendMode: 'multiply' },
    };
    setAbsoluteFields(previous => [...previous, newField]);
    setSelectedFieldId(generatedId);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = loadEvent => {
        addImageField(loadEvent.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddCentralSignature = async (role: CentralSignatureRole) => {
    const signatures = await assinaturasService.getSignatures();
    const url = signatures[role.id];
    if (!url) {
      showToast(`Assinatura de ${role.label} não cadastrada nas Configurações.`, 'error');
      return;
    }
    addImageField(url);
  };

  const handleDragStart = (
    event: React.DragEvent,
    item: Partial<EditorVariable>,
    type: 'variable' | 'qrcode',
  ) => {
    setDraggedItem({ ...item, itemType: type });
    event.dataTransfer.effectAllowed = 'copy';
  };

  const handleDropOnCanvas = (event: React.DragEvent, pageIndex = 0) => {
    event.preventDefault();
    if (!draggedItem) return;

    const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = (pageIndex * PAGE_HEIGHT) + event.clientY - rect.top;
    const newField: AbsoluteField = draggedItem.itemType === 'qrcode'
      ? {
        id: Math.random().toString(36).substr(2, 9),
        type: 'qrcode',
        value: 'QR_VALIDADOR',
        x: x - 50,
        y: y - 50,
        width: 100,
        style: { zIndex: 50 },
      }
      : {
        id: Math.random().toString(36).substr(2, 9),
        type: 'text',
        value: draggedItem.code as string,
        x: x - 50,
        y: y - 10,
        style: { fontWeight: 'bold', fontSize: '14px', color: '#000' },
      };

    setAbsoluteFields([...absoluteFields, newField]);
    setDraggedItem(null);
  };

  const handleFieldMouseDown = (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedFieldId(id);
    const field = absoluteFields.find(item => item.id === id);
    if (!field || !canvasRef.current) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const initialLeft = field.x;
    const initialTop = field.y;
    const fieldWidth = Number(field.width || 80);
    const fieldHeight = Number(field.height || 24);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      setAbsoluteFields(previous => previous.map(item => (
        item.id === id
          ? {
              ...item,
              x: Math.max(0, Math.min(PAGE_WIDTH - fieldWidth, initialLeft + dx)),
              y: Math.max(
                0,
                Math.min((pageCount * PAGE_HEIGHT) - fieldHeight, initialTop + dy),
              ),
            }
          : item
      )));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleFieldResizeMouseDown = (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedFieldId(id);
    const field = absoluteFields.find(item => item.id === id);
    if (!field) return;

    const fieldElement = (event.currentTarget as HTMLElement).parentElement;
    const fieldRect = fieldElement?.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const initialWidth = Number(field.width || fieldRect?.width || 100);
    const initialHeight = Number(field.height || fieldRect?.height || 30);
    const pageTop = ((Number(field.y || 0) % PAGE_HEIGHT) + PAGE_HEIGHT) % PAGE_HEIGHT;
    const maxWidth = Math.max(40, PAGE_WIDTH - Number(field.x || 0));
    const maxHeight = Math.max(24, PAGE_HEIGHT - pageTop);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(
        40,
        Math.min(maxWidth, initialWidth + (moveEvent.clientX - startX)),
      );
      const nextHeight = Math.max(
        field.type === 'image' ? 40 : 24,
        Math.min(maxHeight, initialHeight + (moveEvent.clientY - startY)),
      );
      setAbsoluteFields(previous => previous.map(item => (
        item.id === id
          ? { ...item, width: Math.round(nextWidth), height: Math.round(nextHeight) }
          : item
      )));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleRemoveField = (id: string) => {
    setAbsoluteFields(previous => previous.filter(field => field.id !== id));
    if (selectedFieldId === id) setSelectedFieldId(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await service.saveTemplate(polo.id, {
        textContent: sanitizeHtml(textContent),
        absoluteFields: sanitizeTemplateFields(absoluteFields),
        validityDays,
        pageCount,
        v: templateVersion,
        ...(enableEnrollmentSettings ? {
          enrollmentFormTerm: enrollmentFormPreview.term,
          enrollmentFormCustomFields: enrollmentFormPreview.customFields,
          enrollmentFormRequiresSignature: enrollmentFormPreview.requiresSignature,
        } : {}),
      });
      if (!saved) throw new Error('Não foi possível salvar o modelo.');
      showToast(`Modelo para ${scopeLabel || polo.nomeFantasia} salvo com sucesso!`, 'success');
    } catch (error) {
      showToast('Erro ao salvar as alterações do modelo.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getValidationCode = () => {
    let codeStr = 'VALIDACAO-PADRAO';
    if (qrConfig && qrConfig.pattern) {
      codeStr = qrConfig.pattern.map((token: string) => {
        if (token === '{POLO_ID}') return polo.id.slice(0, 3).toUpperCase();
        if (token === '{ANO_ATUAL}') return new Date().getFullYear();
        return token.replace(/[{}]/g, '').substring(0, 4);
      }).join(qrConfig.separator || '-');
    }
    return `${validationPrefix}-${codeStr}`;
  };

  const validationCode = getValidationCode();
  const qrCodeExampleUrl = getDocumentValidationUrl(validationCode);
  const textPages = splitDocumentPages(textContent, pageCount);
  const replacePreviewTokens = (source: string, escapeValues: boolean) => {
    if (!studentPreview) return source;
    return Object.entries(studentPreview.replacements).reduce(
      (result, [token, value]) => result.split(token).join(
        escapeValues ? escapeHtmlText(String(value ?? '')) : String(value ?? ''),
      ),
      source,
    );
  };
  const previewTextPages = previewActive
    ? textPages.map(page => replacePreviewTokens(page, true))
    : textPages;
  const previewAbsoluteFields = previewActive
    ? absoluteFields.map(field => ({
        ...field,
        value: replacePreviewTokens(field.value, field.type !== 'image'),
      }))
    : absoluteFields;

  if (loading) {
    return <div className="p-12 text-center text-slate-500">Carregando editor...</div>;
  }

  if (loadError) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center">
        <p className="font-black text-rose-800">{loadError}</p>
        <p className="mt-1 text-sm font-medium text-rose-600">Verifique sua conexão e tente novamente.</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-rose-700"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-xl bg-rose-700 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] animate-fadeIn">
      <DeclaracaoEditorToolbar
        editorTitle={editorTitle}
        hideBackButton={hideBackButton}
        onBack={onBack}
        onSave={handleSave}
        poloName={polo.nomeFantasia}
        saving={saving}
        scopeLabel={scopeLabel}
        previewActive={previewActive}
        previewLabel={studentPreview?.label}
        previewLoading={studentPreviewLoading}
        previewError={studentPreviewError}
        onLoadPreview={onLoadStudentPreview}
        onClearPreview={onClearStudentPreview}
      />

      <div className="flex flex-1 gap-8 overflow-hidden h-full">
        <div className={`relative flex shrink-0 ${previewActive ? 'pointer-events-none select-none opacity-45' : ''}`}>
          <DeclaracaoEditorSidebar
            fileInputRef={fileInputRef}
            onAddCentralSignature={handleAddCentralSignature}
            onDragStart={handleDragStart}
            onImageUpload={handleImageUpload}
            onInsertVariable={handleInsertVariable}
            onRemoveField={handleRemoveField}
            onSelectField={setSelectedFieldId}
            onUpdateField={updateSelectedField}
            onUpdateFieldStyle={updateSelectedFieldStyle}
            selectedField={selectedField}
            enrollmentSettings={enableEnrollmentSettings ? enrollmentFormPreview : undefined}
            onEnrollmentSettingsChange={enableEnrollmentSettings ? setEnrollmentFormPreview : undefined}
            setValidityDays={setValidityDays}
            showValidity={showValidity}
            validityDays={validityDays}
            variables={variables}
          />
          {previewActive && (
            <div className="absolute inset-x-3 top-3 z-50 rounded-xl border border-emerald-200 bg-white/95 p-3 text-center shadow-sm">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">
                Modo de visualização
              </p>
              <p className="mt-1 text-[10px] font-semibold text-slate-600">
                Volte aos marcadores para editar.
              </p>
            </div>
          )}
        </div>

        <DeclaracaoEditorCanvas
          absoluteFields={previewAbsoluteFields}
          canvasRef={canvasRef}
          documentTitle={documentTitle}
          editorRef={editorRef}
          enrollmentFormPreview={enrollmentFormPreview}
          onDrop={handleDropOnCanvas}
          onFieldMouseDown={handleFieldMouseDown}
          onFieldResizeMouseDown={handleFieldResizeMouseDown}
          onRemoveField={handleRemoveField}
          onSelectField={setSelectedFieldId}
          onTextInput={handleTextInput}
          pageCount={pageCount}
          polo={polo}
          qrCodeExampleUrl={qrCodeExampleUrl}
          selectedField={selectedField}
          textPages={previewTextPages}
          validationCode={validationCode}
          watermark={watermark}
          readOnly={previewActive}
        />

        <DeclaracaoEditorToast toast={toast} />
      </div>
    </div>
  );
};

export default DeclaracaoEditor;
