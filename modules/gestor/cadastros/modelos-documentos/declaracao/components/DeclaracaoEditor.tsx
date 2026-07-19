import React, { useEffect, useRef, useState } from 'react';
import { declaracaoService } from '../declaracao.service';
import { marcaDaguaService } from '../../../../configuracoes/marca-dagua/marca-dagua.service';
import { assinaturasService } from '../../../../configuracoes/assinaturas/assinaturas.service';
import { academicosService } from '../../../../configuracoes/academicos/academicos.service';
import { sanitizeHtml, sanitizeTemplateFields } from '../../../../../../lib/htmlSanitizer';
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
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [watermark, setWatermark] = useState<any>(null);
  const [qrConfig, setQrConfig] = useState<any>(null);
  const [academicConfigs, setAcademicConfigs] = useState<any>(null);
  const [textContent, setTextContent] = useState('');
  const [absoluteFields, setAbsoluteFields] = useState<AbsoluteField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [validityDays, setValidityDays] = useState<number>(defaultValidityDays);
  const [pageCount, setPageCount] = useState<number>(1);
  const [toast, setToast] = useState<EditorToast | null>(null);
  const [draggedItem, setDraggedItem] = useState<DraggedEditorItem | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedField = absoluteFields.find(field => field.id === selectedFieldId);

  const showToast = (message: string, type: EditorToast['type'] = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const loadData = async () => {
    setLoading(true);

    const template = await service.getTemplate(polo.id);
    setTextContent(sanitizeHtml(template.textContent));
    setValidityDays(template.validityDays || defaultValidityDays);
    setPageCount(Math.max(1, Number(template.pageCount || 1)));

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

    const academicData = await academicosService.getConfigs();
    setAcademicConfigs(academicData);

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [polo.id]);

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
    const nextHtml = sanitizeHtml(event.currentTarget.innerHTML);
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
    event.stopPropagation();
    setSelectedFieldId(id);
    const field = absoluteFields.find(item => item.id === id);
    if (!field || !canvasRef.current) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const initialLeft = field.x;
    const initialTop = field.y;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      setAbsoluteFields(previous => previous.map(item => (
        item.id === id ? { ...item, x: initialLeft + dx, y: initialTop + dy } : item
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
        v: 2,
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

  const getValidationUrl = () => (
    academicConfigs?.validacaoUrl || 'https://www.universocc.com.br/validador'
  );

  const validationCode = getValidationCode();
  const qrCodeExampleUrl = `${getValidationUrl()}?q=${validationCode}`;
  const textPages = splitDocumentPages(textContent, pageCount);

  if (loading) {
    return <div className="p-12 text-center text-slate-500">Carregando editor...</div>;
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
      />

      <div className="flex flex-1 gap-8 overflow-hidden h-full">
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
          setValidityDays={setValidityDays}
          showValidity={showValidity}
          validityDays={validityDays}
          variables={variables}
        />

        <DeclaracaoEditorCanvas
          absoluteFields={absoluteFields}
          canvasRef={canvasRef}
          documentTitle={documentTitle}
          editorRef={editorRef}
          onDrop={handleDropOnCanvas}
          onFieldMouseDown={handleFieldMouseDown}
          onRemoveField={handleRemoveField}
          onSelectField={setSelectedFieldId}
          onTextInput={handleTextInput}
          pageCount={pageCount}
          polo={polo}
          qrCodeExampleUrl={qrCodeExampleUrl}
          selectedField={selectedField}
          textPages={textPages}
          validationCode={validationCode}
          watermark={watermark}
        />

        <DeclaracaoEditorToast toast={toast} />
      </div>
    </div>
  );
};

export default DeclaracaoEditor;
