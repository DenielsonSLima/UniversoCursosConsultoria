// File: modules/gestor/cadastros/modelos-documentos/declaracao/components/DeclaracaoEditor.tsx

import React, { useState, useRef, useEffect } from 'react';
import { 
  Save, Type, Trash2, AlignLeft, AlignCenter, AlignRight, AlignJustify, Bold, Italic, 
  GripVertical, ArrowLeft, QrCode, Image as ImageIcon, Upload, Building2, Sliders,
  CheckCircle2, AlertCircle, Palette
} from 'lucide-react';
import { declaracaoService } from '../declaracao.service';
import { marcaDaguaService } from '../../../../configuracoes/marca-dagua/marca-dagua.service';
import { assinaturasService } from '../../../../configuracoes/assinaturas/assinaturas.service';
import { academicosService } from '../../../../configuracoes/academicos/academicos.service';
import DocumentHeader from '../../../../components/DocumentHeader';

interface DeclaracaoEditorProps {
  polo: any;
  onBack: () => void;
  service?: {
    getTemplate: (poloId: string) => Promise<any>;
    saveTemplate: (poloId: string, data: any) => Promise<boolean>;
    getQrConfig: () => Promise<any>;
  };
  editorTitle?: string;
  documentTitle?: string;
  variables?: Array<{ code: string; label: string }>;
  validationPrefix?: string;
  defaultValidityDays?: number;
  showValidity?: boolean;
  migrateDeclarationDefaults?: boolean;
  hideBackButton?: boolean;
  scopeLabel?: string;
}

// Variáveis de Texto
const VARIABLES = [
  { code: '{{ALUNO_NOME}}', label: 'Nome do Aluno' },
  { code: '{{ALUNO_CPF}}', label: 'CPF do Aluno' },
  { code: '{{ALUNO_RG}}', label: 'RG/Documento do Aluno' },
  { code: '{{ALUNO_DOCUMENTO_TIPO}}', label: 'Tipo de Documento (RG/CNH/CNI)' },
  { code: '{{ALUNO_NASCIMENTO}}', label: 'Data de Nascimento' },
  { code: '{{ALUNO_MATRICULA}}', label: 'Matrícula' },
  { code: '{{CURSO_NOME}}', label: 'Nome do Curso' },
  { code: '{{TURMA_NOME}}', label: 'Nome da Turma' },
  { code: '{{POLO_NOME}}', label: 'Nome do Polo' },
  { code: '{{POLO_CNPJ}}', label: 'CNPJ do Polo' },
  { code: '{{CIDADE_POLO}}', label: 'Cidade do Polo' },
  { code: '{{DATA_ATUAL}}', label: 'Data Atual (Extenso)' },
  { code: '{{HORA_ATUAL}}', label: 'Hora Atual' },
  { code: '{{DATA_GERACAO}}', label: 'Data/Hora de Geração' },
  { code: '{{VALIDADE_DIAS}}', label: 'Dias de Validade' },
  { code: '{{VALIDADE_DATA}}', label: 'Data de Validade (Limite)' },
];

interface AbsoluteField {
  id: string;
  type: 'text' | 'image' | 'qrcode'; 
  value: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}

const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const PAGE_BREAK_HTML = '<div data-page-break="true"></div>';
const pageBreakRegex = /<div[^>]*data-page-break=["']true["'][\s\S]*?<\/div>/i;

const splitDocumentPages = (html: string, count: number) => {
  const pages = String(html || '').split(pageBreakRegex);
  while (pages.length < count) pages.push('');
  return pages.slice(0, count);
};

const DeclaracaoEditor: React.FC<DeclaracaoEditorProps> = ({
  polo,
  onBack,
  service = declaracaoService,
  editorTitle = 'Editor de Declaração',
  documentTitle = 'Declaração de Matrícula',
  variables = VARIABLES,
  validationPrefix = 'DEC',
  defaultValidityDays = 30,
  showValidity = true,
  migrateDeclarationDefaults = true,
  hideBackButton = false,
  scopeLabel
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [watermark, setWatermark] = useState<any>(null);
  const [qrConfig, setQrConfig] = useState<any>(null);
  const [academicConfigs, setAcademicConfigs] = useState<any>(null);

  // Estado do Documento
  const [textContent, setTextContent] = useState('');
  const [absoluteFields, setAbsoluteFields] = useState<AbsoluteField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [validityDays, setValidityDays] = useState<number>(defaultValidityDays);
  const [pageCount, setPageCount] = useState<number>(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };
  
  const selectedField = absoluteFields.find(f => f.id === selectedFieldId);
  const selectedTextAlign = String(selectedField?.style?.textAlign || 'left');
  const selectedTextAlignLabel = {
    left: 'Esquerda',
    center: 'Centralizado',
    right: 'Direita',
    justify: 'Justificado',
  }[selectedTextAlign] || 'Esquerda';

  // --- Helpers de Edição de Campos Absolutos ---
  const updateSelectedField = (updates: Partial<AbsoluteField>) => {
    if (!selectedFieldId) return;
    setAbsoluteFields(prev => prev.map(f => 
      f.id === selectedFieldId ? { ...f, ...updates } : f
    ));
  };

  const updateSelectedFieldStyle = (styleUpdates: React.CSSProperties) => {
    if (!selectedFieldId) return;
    setAbsoluteFields(prev => prev.map(f => {
      if (f.id === selectedFieldId) {
        return {
          ...f,
          style: {
            ...(f.style || {}),
            ...styleUpdates
          }
        };
      }
      return f;
    }));
  };
  
  // Drag & Drop
  const [draggedItem, setDraggedItem] = useState<any>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, [polo.id]);

  const loadData = async () => {
    setLoading(true);
    // 1. Carrega Template Específico do Polo
    const template = await service.getTemplate(polo.id);
    setTextContent(template.textContent);
    setValidityDays(template.validityDays || defaultValidityDays);
    setPageCount(Math.max(1, Number(template.pageCount || 1)));
    
    let loadedFields = (template.absoluteFields || []).map((f: any) => ({
        ...f,
        type: f.type || 'text'
    }));

    // Migração de templates antigos para v: 2 (adicionando os novos campos do rodapé e assinatura)
    if (migrateDeclarationDefaults && (!template.v || template.v < 2)) {
      const defaultFields = [
        {
          id: 'sig_line',
          type: 'text',
          value: '___________________________________________',
          x: 200,
          y: 880,
          width: 394,
          style: { textAlign: 'center', fontSize: '14px' }
        },
        {
          id: 'sig_title',
          type: 'text',
          value: 'Secretaria Acadêmica',
          x: 200,
          y: 910,
          width: 394,
          style: { textAlign: 'center', fontWeight: 'bold', fontSize: '14px', textTransform: 'uppercase' }
        },
        {
          id: 'sig_sub',
          type: 'text',
          value: '{{POLO_NOME}}',
          x: 200,
          y: 935,
          width: 394,
          style: { textAlign: 'center', fontSize: '12px', color: '#475569' }
        },
        {
          id: 'footer_valid_until',
          type: 'text',
          value: 'ESTE DOCUMENTO É VÁLIDO ATÉ <span style="color: #ef4444">{{VALIDADE_DATA}}</span>.',
          x: 50,
          y: 975,
          width: 694,
          style: { textAlign: 'center', fontSize: '9px', color: '#000000', fontWeight: 'bold', textTransform: 'uppercase' }
        },
        {
          id: 'footer_url',
          type: 'text',
          value: 'Para verificar a autenticidade deste documento acesse: <span style="color: #ef4444">www.universocc.com.br/validador</span>',
          x: 50,
          y: 995,
          width: 694,
          style: { textAlign: 'center', fontSize: '9px', color: '#000000', fontWeight: 'bold', textTransform: 'uppercase' }
        },
        {
          id: 'footer_validity',
          type: 'text',
          value: 'Validade deste documento: <span style="color: #ef4444">{{VALIDADE_DIAS}} dias a partir da data de emissão</span>.',
          x: 50,
          y: 1015,
          width: 694,
          style: { textAlign: 'center', fontSize: '9px', color: '#000000', fontWeight: 'bold', textTransform: 'uppercase' }
        },
        {
          id: 'footer_generation',
          type: 'text',
          value: 'DOCUMENTO GERADO EM: {{DATA_GERACAO}}',
          x: 50,
          y: 1035,
          width: 694,
          style: { textAlign: 'center', fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase' }
        }
      ];

      // Adiciona apenas se não existir nenhum campo com esse ID
      const fieldsToAdd = defaultFields.filter(df => !loadedFields.some((lf: any) => lf.id === df.id));
      loadedFields = [...loadedFields, ...fieldsToAdd];
    }
    setAbsoluteFields(loadedFields);

    // 2. Carrega Marca D'água
    const watermarks = await marcaDaguaService.getCompaniesWithWatermark();
    const wm = watermarks.find(w => w.id === polo.id) || 
               watermarks.find(w => w.id === polo.company_id) || // Fallback pelo ID da empresa
               (polo.watermark_url ? {
                 id: polo.id,
                 nomeFantasia: polo.nome || '',
                 cidade: polo.cidade || '',
                 uf: polo.estado || '',
                 watermarkUrl: polo.watermark_url,
                 watermarkOpacity: Number(polo.watermark_opacity ?? 0.1),
                 watermarkScale: Number(polo.watermark_scale ?? 50),
                 watermarkRotate: polo.watermark_rotate !== false
               } : null) || 
               watermarks[0]; // Fallback final (geralmente a matriz)
    setWatermark(wm);

    // 3. Carrega Configuração de QR Code
    const qrData = await service.getQrConfig();
    setQrConfig(qrData);

    // 4. Carrega Configurações Acadêmicas Globais
    const academicData = await academicosService.getConfigs();
    setAcademicConfigs(academicData);

    setLoading(false);
  };

  // --- Helpers de Edição Texto ---
  const handleInsertVariable = (variableCode: string) => {
    document.execCommand('insertText', false, variableCode);
  };

  const handleTextInput = (e: React.FormEvent<HTMLDivElement>, pageIndex = 0) => {
    if (pageCount <= 1) {
      setTextContent(e.currentTarget.innerHTML);
      return;
    }

    const pages = splitDocumentPages(textContent, pageCount);
    pages[pageIndex] = e.currentTarget.innerHTML;
    setTextContent(pages.join(PAGE_BREAK_HTML));
  };

  // --- Upload de Assinatura ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const generatedId = Math.random().toString(36).substr(2, 9);
        const newField: AbsoluteField = {
            id: generatedId,
            type: 'image',
            value: event.target?.result as string,
            x: 250, 
            y: 850, 
            width: 200,
            style: { zIndex: 50, mixBlendMode: 'multiply' }
        };
        setAbsoluteFields(prev => [...prev, newField]);
        setSelectedFieldId(generatedId);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Drag & Drop (Inicio) ---
  const handleDragStart = (e: React.DragEvent, item: any, type: 'variable' | 'qrcode') => {
    setDraggedItem({ ...item, itemType: type });
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDropOnCanvas = (e: React.DragEvent, pageIndex = 0) => {
    e.preventDefault();
    if (!draggedItem) return;

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left; 
    const y = (pageIndex * PAGE_HEIGHT) + e.clientY - rect.top;

    let newField: AbsoluteField;

    if (draggedItem.itemType === 'qrcode') {
        newField = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'qrcode',
            value: 'QR_VALIDADOR',
            x: x - 50,
            y: y - 50,
            width: 100,
            style: { zIndex: 50 }
        };
    } else {
        newField = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'text',
            value: draggedItem.code,
            x: x - 50,
            y: y - 10,
            style: { fontWeight: 'bold', fontSize: '14px', color: '#000' }
        };
    }

    setAbsoluteFields([...absoluteFields, newField]);
    setDraggedItem(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // --- Movimentação de campos no Canvas ---
  const handleFieldMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedFieldId(id);
    const field = absoluteFields.find(f => f.id === id);
    if (!field || !canvasRef.current) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const initialLeft = field.x;
    const initialTop = field.y;

    const onMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        
        setAbsoluteFields(prev => prev.map(f => 
            f.id === id ? { ...f, x: initialLeft + dx, y: initialTop + dy } : f
        ));
    };

    const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleRemoveField = (id: string) => {
    setAbsoluteFields(prev => prev.filter(f => f.id !== id));
    if (selectedFieldId === id) {
      setSelectedFieldId(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await service.saveTemplate(polo.id, {
          textContent,
          absoluteFields,
          validityDays,
          pageCount,
          v: 2
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
          if (token === '{POLO_ID}') return polo.id.slice(0,3).toUpperCase();
          if (token === '{ANO_ATUAL}') return new Date().getFullYear();
          return token.replace(/[{}]/g, '').substring(0, 4);
      }).join(qrConfig.separator || '-');
    }
    return `${validationPrefix}-${codeStr}`;
  };

  const getValidationUrl = () => {
    return academicConfigs?.validacaoUrl || 'https://www.universocc.com.br/validador';
  };

  // Retorna a URL completa para o validador
  const getQrCodeExampleUrl = () => {
    return `${getValidationUrl()}?q=${getValidationCode()}`;
  };

  const textPages = splitDocumentPages(textContent, pageCount);
  const pageIndexForField = (field: AbsoluteField) => Math.max(0, Math.min(pageCount - 1, Math.floor(Number(field.y || 0) / PAGE_HEIGHT)));

  const renderAbsoluteField = (field: AbsoluteField, pageIndex = 0) => {
    const isSelected = selectedFieldId === field.id;
    const pageTop = Number(field.y || 0) - (pageIndex * PAGE_HEIGHT);

    return (
      <div
        key={field.id}
        onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
        onClick={(e) => e.stopPropagation()}
        className={`absolute z-30 cursor-move group flex items-center justify-center transition-all ${
          isSelected
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
          ...field.style
        }}
      >
        {field.type === 'qrcode' && (
          <div className="w-full bg-white p-1.5 shadow-sm rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
            <div className="w-full aspect-square bg-white flex items-center justify-center mb-1">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getQrCodeExampleUrl())}`}
                alt="QR Code"
                className="w-full h-full object-contain pointer-events-none"
              />
            </div>
            <div className="w-full flex flex-col gap-0.5 border-t border-slate-100 pt-1 mt-0.5 select-all">
              <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest leading-none">CÓD. VALIDAÇÃO</p>
              <p className="text-[9px] font-mono font-black text-blue-600 tracking-wider mt-1 leading-none">
                {getValidationCode()}
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
            <span dangerouslySetInnerHTML={{ __html: field.value }} className="w-full break-words" />
          </div>
        )}

        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            handleRemoveField(field.id);
          }}
          className="absolute -top-3 -right-3 ml-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-1 shadow-md border border-slate-100 z-50"
          title="Remover"
        >
          <Trash2 size={12} />
        </button>
      </div>
    );
  };

  if (loading) return <div className="p-12 text-center text-slate-500">Carregando editor...</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] animate-fadeIn">
      
      {/* Toolbar Superior */}
      <div className="flex justify-between items-center mb-6 pb-6 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-4">
            {!hideBackButton && <button
                onClick={onBack}
                className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-colors"
            >
                <ArrowLeft size={20} />
            </button>}
            <div>
                <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">{editorTitle}</h3>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                    {scopeLabel ? 'Modalidade' : 'Unidade'}: <span className="text-blue-600">{scopeLabel || polo.nomeFantasia}</span>
                </p>
            </div>
        </div>
        <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg"
        >
            <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>

      {/* Conteúdo Principal Flexível (Sidebar + Canvas) */}
      <div className="flex flex-1 gap-8 overflow-hidden h-full">
        
        {/* Sidebar: Ferramentas */}
        <div className="w-72 flex flex-col gap-6 bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm overflow-y-auto custom-scrollbar h-full shrink-0">
            
            {/* Seção de Validade do Documento */}
            {showValidity && <div className="border-b border-slate-100 pb-4 flex flex-col gap-2 shrink-0">
                <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2 mb-1">
                    <Building2 size={14} className="text-blue-600" /> Validade do Documento
                </h4>
                <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                    {([30, 60, 90] as const).map((days) => (
                        <button
                            key={days}
                            onClick={() => setValidityDays(days)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${
                                validityDays === days
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {days} Dias
                        </button>
                    ))}
                </div>
                <p className="text-[9px] text-slate-400 font-medium leading-normal">
                    Define o prazo padrão que será impresso no documento e usado na verificação do QR Code.
                </p>
            </div>}

            {/* Seção de Variáveis de Texto */}
            <div className="flex flex-col gap-2 flex-1 overflow-hidden">
                <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2 mb-1">
                    <Type size={14} className="text-blue-600" /> Texto Dinâmico
                </h4>
                <div className="overflow-y-auto custom-scrollbar space-y-2 pr-1 pb-2">
                    {variables.map(variable => (
                        <div 
                            key={variable.code}
                            draggable
                            onDragStart={(e) => handleDragStart(e, variable, 'variable')}
                            className="bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl p-3 cursor-grab active:cursor-grabbing transition-colors group select-none"
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[10px] font-bold text-slate-700 uppercase">{variable.label}</span>
                                <button 
                                    onClick={() => handleInsertVariable(variable.code)}
                                    className="text-[9px] bg-white border border-slate-200 px-2 py-0.5 rounded text-blue-600 font-bold hover:bg-blue-600 hover:text-white transition-colors"
                                    title="Inserir no cursor"
                                >
                                    Add
                                </button>
                            </div>
                            <code className="text-[10px] text-slate-400 font-mono block bg-white px-2 py-1 rounded border border-slate-100 truncate">
                                {variable.code}
                            </code>
                        </div>
                    ))}
                </div>
            </div>

            {/* Seção de Elementos Visuais */}
            <div className="border-t border-slate-100 pt-4 flex flex-col gap-3 shrink-0">
                <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2 mb-1">
                    <ImageIcon size={14} className="text-purple-600" /> Elementos Visuais
                </h4>
                
                <div 
                    draggable
                    onDragStart={(e) => handleDragStart(e, { code: 'QR_VALIDADOR' }, 'qrcode')}
                    className="bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl p-3 cursor-grab active:cursor-grabbing transition-colors flex items-center gap-3 select-none"
                >
                    <div className="p-2 bg-white rounded-lg text-purple-600">
                        <QrCode size={20} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-purple-900">QR Code Validador</p>
                        <p className="text-[9px] text-purple-700">Link Autenticação</p>
                    </div>
                </div>

                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl p-3 cursor-pointer transition-colors flex items-center gap-3 select-none group"
                >
                    <div className="p-2 bg-white rounded-lg text-emerald-600 group-hover:text-emerald-700">
                        <Upload size={20} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-emerald-900">Upload Assinatura</p>
                        <p className="text-[9px] text-emerald-700">PNG (Fundo Transparente)</p>
                    </div>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/png"
                        onChange={handleImageUpload}
                    />
                </div>

                {/* Usar Assinatura Centralizada */}
                <div className="border-t border-slate-100 pt-3 flex flex-col gap-2">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">Usar Assinatura Central</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { id: 'diretoriaGeral', label: 'Diretoria' },
                      { id: 'secretaria', label: 'Secretaria' },
                      { id: 'coordenacao', label: 'Coordenação' },
                      { id: 'financeiro', label: 'Financeiro' },
                    ] as const).map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={async () => {
                          const sigs = await assinaturasService.getSignatures();
                          const url = sigs[role.id];
                          if (!url) {
                            showToast(`Assinatura de ${role.label} não cadastrada nas Configurações.`, 'error');
                            return;
                          }
                          const generatedId = Math.random().toString(36).substr(2, 9);
                          const newField: AbsoluteField = {
                              id: generatedId,
                              type: 'image',
                              value: url,
                              x: 250, 
                              y: 850, 
                              width: 200,
                              style: { zIndex: 50, mixBlendMode: 'multiply' }
                          };
                          setAbsoluteFields(prev => [...prev, newField]);
                          setSelectedFieldId(generatedId);
                        }}
                        className="py-1.5 px-2 bg-slate-50 hover:bg-pink-50 hover:text-pink-600 rounded-xl border border-slate-200 hover:border-pink-200 text-[10px] font-bold text-slate-600 transition-colors truncate"
                      >
                        {role.label}
                      </button>
                    ))}
                  </div>
                </div>
            </div>

            {/* Seção de Ajustes do Elemento Selecionado */}
            {selectedField && (
                <div className="border-t border-slate-100 pt-4 flex flex-col gap-3 shrink-0 animate-fadeIn">
                    <div className="flex justify-between items-center mb-1">
                        <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2">
                            <Sliders size={14} className="text-blue-600" /> Ajustar Elemento
                        </h4>
                        <button 
                            onClick={() => setSelectedFieldId(null)}
                            className="text-[10px] font-bold text-slate-400 hover:text-slate-650 uppercase hover:text-slate-655"
                        >
                            Fechar
                        </button>
                    </div>

                    <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 flex flex-col gap-3">
                        {/* Controles para imagem (assinatura) */}
                        {selectedField.type === 'image' && (
                            <div className="space-y-3">
                                {/* Slider de Largura */}
                                <div>
                                    <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase mb-1">
                                        <span>Largura</span>
                                        <span>{selectedField.width || 200}px</span>
                                    </div>
                                    <input 
                                        type="range"
                                        min="40"
                                        max="500"
                                        value={selectedField.width || 200}
                                        onChange={(e) => updateSelectedField({ width: parseInt(e.target.value) })}
                                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                </div>

                                {/* Efeito Mesclar (Multiply) */}
                                <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-700 leading-tight">Efeito Caneta (Mesclar)</p>
                                        <p className="text-[8px] text-slate-500 leading-tight">Remove o fundo branco</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const currentBlend = selectedField.style?.mixBlendMode;
                                            const nextBlend = currentBlend === 'multiply' ? 'normal' : 'multiply';
                                            updateSelectedFieldStyle({ mixBlendMode: nextBlend });
                                        }}
                                        className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors duration-300 focus:outline-none ${
                                            selectedField.style?.mixBlendMode === 'multiply' ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'
                                        }`}
                                    >
                                        <span className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-300"></span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Controles para QR Code */}
                        {selectedField.type === 'qrcode' && (
                            <div>
                                <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase mb-1">
                                    <span>Tamanho</span>
                                    <span>{selectedField.width || 100}px</span>
                                </div>
                                <input 
                                    type="range"
                                    min="60"
                                    max="250"
                                    value={selectedField.width || 100}
                                    onChange={(e) => updateSelectedField({ width: parseInt(e.target.value) })}
                                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                            </div>
                        )}

                        {/* Controles para Texto Dinâmico */}
                        {selectedField.type === 'text' && (
                            <div className="space-y-3">
                                {/* Conteúdo do Texto */}
                                <div>
                                    <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">
                                        Conteúdo do Texto
                                    </label>
                                    <textarea 
                                        value={selectedField.value}
                                        onChange={(e) => updateSelectedField({ value: e.target.value })}
                                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 outline-none focus:border-blue-500 text-xs font-bold resize-y min-h-[60px] custom-scrollbar"
                                    />
                                </div>

                                {/* Tamanho da Fonte */}
                                <div>
                                    <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase mb-1">
                                        <span>Tamanho da Fonte</span>
                                        <span>{selectedField.style?.fontSize ? parseInt(selectedField.style.fontSize.toString()) : 14}px</span>
                                    </div>
                                    <input 
                                        type="range"
                                        min="10"
                                        max="36"
                                        value={selectedField.style?.fontSize ? parseInt(selectedField.style.fontSize.toString()) : 14}
                                        onChange={(e) => updateSelectedFieldStyle({ fontSize: `${e.target.value}px` })}
                                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1 flex items-center gap-1.5 text-[9px] font-black text-slate-500 uppercase">
                                        <Palette size={12} /> Cor da fonte
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={String(selectedField.style?.color || '#000000')}
                                            onChange={(e) => updateSelectedFieldStyle({ color: e.target.value })}
                                            className="h-9 w-12 rounded-lg border border-slate-200 bg-white p-1"
                                        />
                                        <input
                                            value={String(selectedField.style?.color || '#000000')}
                                            onChange={(e) => updateSelectedFieldStyle({ color: e.target.value })}
                                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-1 block text-[9px] font-black text-slate-500 uppercase">
                                        Fonte
                                    </label>
                                    <select
                                        value={String(selectedField.style?.fontFamily || 'Arial, sans-serif')}
                                        onChange={(e) => updateSelectedFieldStyle({ fontFamily: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-500"
                                    >
                                        <option value="Arial, sans-serif">Arial</option>
                                        <option value="'Times New Roman', Times, serif">Times New Roman</option>
                                        <option value="Georgia, serif">Georgia</option>
                                        <option value="'Courier New', monospace">Courier New</option>
                                        <option value="'Trebuchet MS', sans-serif">Trebuchet</option>
                                    </select>
                                </div>

                                {/* Largura do Bloco de Texto */}
                                <div>
                                    <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase mb-1">
                                        <span>Largura do Bloco</span>
                                        <span>{selectedField.width ? `${selectedField.width}px` : 'Automático'}</span>
                                    </div>
                                    <input 
                                        type="range"
                                        min="50"
                                        max="700"
                                        value={selectedField.width || 300}
                                        onChange={(e) => updateSelectedField({ width: parseInt(e.target.value) })}
                                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                    <button 
                                        onClick={() => updateSelectedField({ width: undefined })}
                                        className="text-[9px] font-bold text-slate-400 mt-1 hover:text-blue-600 block text-left"
                                    >
                                        Limpar Largura (Auto)
                                    </button>
                                </div>

                                {/* Estilos de Fonte (Bold, Italic) */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            const currentWeight = selectedField.style?.fontWeight;
                                            updateSelectedFieldStyle({ fontWeight: currentWeight === 'bold' ? 'normal' : 'bold' });
                                        }}
                                        className={`flex-1 flex items-center justify-center p-1.5 border rounded-xl transition-colors ${
                                            selectedField.style?.fontWeight === 'bold'
                                            ? 'bg-blue-50 border-blue-200 text-blue-600 font-bold'
                                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                        }`}
                                        title="Negrito"
                                    >
                                        <Bold size={12} />
                                    </button>
                                    
                                    <button
                                        onClick={() => {
                                            const currentStyle = selectedField.style?.fontStyle;
                                            updateSelectedFieldStyle({ fontStyle: currentStyle === 'italic' ? 'normal' : 'italic' });
                                        }}
                                        className={`flex-1 flex items-center justify-center p-1.5 border rounded-xl transition-colors ${
                                            selectedField.style?.fontStyle === 'italic'
                                            ? 'bg-blue-50 border-blue-200 text-blue-600 font-bold'
                                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                        }`}
                                        title="Itálico"
                                    >
                                        <Italic size={12} />
                                    </button>
                                </div>

                                {/* Alinhamento de Texto */}
                                <div>
                                  <div className="flex items-center justify-between text-[9px] font-black text-slate-500 uppercase mb-1">
                                    <span>Alinhamento</span>
                                    <span className="text-blue-600">{selectedTextAlignLabel}</span>
                                  </div>
                                  <div className="flex gap-1 bg-slate-100 p-0.5 rounded-xl">
                                    {([
                                        { value: 'left', icon: AlignLeft, title: 'Esquerda' },
                                        { value: 'center', icon: AlignCenter, title: 'Centralizado' },
                                        { value: 'right', icon: AlignRight, title: 'Direita' },
                                        { value: 'justify', icon: AlignJustify, title: 'Justificado' },
                                    ] as const).map(({ value: align, icon: Icon, title }) => {
                                        const isAligned = selectedField.style?.textAlign === align || (!selectedField.style?.textAlign && align === 'left');
                                        return (
                                            <button
                                                key={align}
                                                type="button"
                                                title={title}
                                                aria-label={title}
                                                onClick={() => updateSelectedFieldStyle({ textAlign: align })}
                                                className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-colors ${
                                                    isAligned
                                                    ? 'bg-white text-blue-600 shadow-sm font-bold'
                                                    : 'text-slate-400 hover:text-slate-650 hover:text-slate-600'
                                                }`}
                                            >
                                                <Icon size={12} />
                                            </button>
                                        );
                                    })}
                                  </div>
                                </div>
                            </div>
                        )}

                        {/* Botão de Exclusão Direta */}
                        <button
                            onClick={() => handleRemoveField(selectedField.id)}
                            className="w-full mt-1 flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors border border-red-200"
                        >
                            <Trash2 size={12} /> Excluir Elemento
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* Área Central: páginas A4 separadas */}
        <div
          onClick={() => setSelectedFieldId(null)}
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
                    backgroundSize: '20px 20px'
                  }}
                  onDrop={(e) => handleDropOnCanvas(e, pageIndex)}
                  onDragOver={handleDragOver}
                  onClick={(e) => {
                    if (e.currentTarget === e.target) {
                      setSelectedFieldId(null);
                    }
                  }}
                >
                  <div className="pointer-events-none absolute inset-0 z-[1]">
                    <div className="absolute top-0 bottom-0 left-1/2 border-l border-blue-500/35" />
                    <div className="absolute left-0 right-0 top-1/2 border-t border-blue-500/25" />
                    <div className="absolute border border-dashed border-slate-300/80" style={{ left: 80, right: 80, top: 60, bottom: 60 }} />
                    {selectedField && pageIndexForField(selectedField) === pageIndex && (
                      <>
                        <div className="absolute top-0 bottom-0 border-l border-emerald-500/45" style={{ left: selectedField.x }} />
                        <div className="absolute left-0 right-0 border-t border-emerald-500/45" style={{ top: Number(selectedField.y || 0) - (pageIndex * PAGE_HEIGHT) }} />
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
                          transform: watermark.watermarkRotate !== false ? 'rotate(-45deg)' : 'none'
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
                      onInput={(e) => handleTextInput(e, pageIndex)}
                      dangerouslySetInnerHTML={{ __html: textPages[pageIndex] || '' }}
                      className="min-h-[160px] outline-none text-justify leading-loose text-lg p-4 border border-transparent hover:border-blue-100 rounded-lg transition-colors cursor-text text-black"
                      style={{ fontFamily: '"Times New Roman", Times, serif', color: '#000000' }}
                    />
                  </div>

                  {absoluteFields
                    .filter(field => pageIndexForField(field) === pageIndex)
                    .map(field => renderAbsoluteField(field, pageIndex))}
                </div>
              </div>
            ))}
          </div>
        </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-[9999] animate-fadeIn">
          <div className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-300 ${
            toast.type === 'success' 
            ? 'bg-emerald-500/95 border-emerald-400 text-white' 
            : 'bg-red-500/95 border-red-400 text-white'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span className="text-xs font-black uppercase tracking-wider">{toast.message}</span>
          </div>
        </div>
      )}

      </div>
    </div>
  );
};

export default DeclaracaoEditor;
