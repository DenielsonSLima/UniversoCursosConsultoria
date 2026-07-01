// File: modules/gestor/cadastros/modelos-documentos/estagio/components/EstagioEditor.tsx

import React, { useState, useRef, useEffect } from 'react';
import { 
  Save, Type, Trash2, AlignLeft, AlignCenter, AlignRight, Bold, Italic, 
  GripVertical, ArrowLeft, QrCode, Image as ImageIcon, Upload, Building2, Sliders,
  CheckCircle2, AlertCircle
} from 'lucide-react';
import { estagioService } from '../estagio.service';
import { marcaDaguaService } from '../../../../configuracoes/marca-dagua/marca-dagua.service';
import { assinaturasService } from '../../../../configuracoes/assinaturas/assinaturas.service';
import DocumentHeader from '../../../../components/DocumentHeader';
import { sanitizedHtml, sanitizeHtml, sanitizeTemplateFields } from '../../../../../../lib/htmlSanitizer';

interface EstagioEditorProps {
  polo: any;
  onBack: () => void;
}

// Variáveis de Texto para Estágio
const VARIABLES = [
  { code: '{{ALUNO_NOME}}', label: 'Nome do Aluno' },
  { code: '{{ALUNO_CPF}}', label: 'CPF do Aluno' },
  { code: '{{ALUNO_RG}}', label: 'RG do Aluno' },
  { code: '{{ALUNO_MATRICULA}}', label: 'Matrícula' },
  { code: '{{CURSO_NOME}}', label: 'Nome do Curso' },
  { code: '{{TURMA_NOME}}', label: 'Nome da Turma' },
  { code: '{{POLO_NOME}}', label: 'Nome do Polo' },
  { code: '{{CIDADE_POLO}}', label: 'Cidade do Polo' },
  { code: '{{DATA_ATUAL}}', label: 'Data Atual (Extenso)' },
  { code: '{{HORA_ATUAL}}', label: 'Hora Atual' },
  { code: '{{VALIDADE_DIAS}}', label: 'Dias de Validade' },
  { code: '{{VALIDADE_DATA}}', label: 'Data de Validade (Limite)' },
  { code: '{{CARGA_HORARIA_ESTAGIO}}', label: 'Carga Horária Estágio' },
  { code: '{{CONCEDENTE_NOME}}', label: 'Unidade Concedente (Parceira)' },
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

const EstagioEditor: React.FC<EstagioEditorProps> = ({ polo, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [watermark, setWatermark] = useState<any>(null);
  const [qrConfig, setQrConfig] = useState<any>(null);

  // Estado do Documento
  const [textContent, setTextContent] = useState('');
  const [absoluteFields, setAbsoluteFields] = useState<AbsoluteField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [validityDays, setValidityDays] = useState<number>(90); // Padrão 90 dias para termo de estágio
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };
  
  const selectedField = absoluteFields.find(f => f.id === selectedFieldId);

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
    const template = await estagioService.getTemplate(polo.id);
    setTextContent(sanitizeHtml(template.textContent));
    setValidityDays(template.validityDays || 90);
    
    const fieldsWithTypes = (template.absoluteFields || []).map((f: any) => ({
        ...f,
        type: f.type || 'text'
    }));
    setAbsoluteFields(sanitizeTemplateFields(fieldsWithTypes));

    // 2. Carrega Marca D'água
    const watermarks = await marcaDaguaService.getCompaniesWithWatermark();
    const wm = watermarks.find(w => w.id === polo.id) || 
               watermarks.find(w => w.id === polo.company_id) ||
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
               watermarks[0];
    setWatermark(wm);

    // 3. Carrega Configuração de QR Code
    const qrData = await estagioService.getQrConfig();
    setQrConfig(qrData);

    setLoading(false);
  };

  // --- Helpers de Edição Texto ---
  const handleInsertVariable = (variableCode: string) => {
    document.execCommand('insertText', false, variableCode);
  };

  const handleTextInput = (e: React.FormEvent<HTMLDivElement>) => {
    setTextContent(sanitizeHtml(e.currentTarget.innerHTML));
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

  const handleDropOnCanvas = (e: React.DragEvent) => {
    e.preventDefault();
    if (!canvasRef.current || !draggedItem) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left; 
    const y = e.clientY - rect.top;

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
      await estagioService.saveTemplate(polo.id, {
          textContent: sanitizeHtml(textContent),
          absoluteFields: sanitizeTemplateFields(absoluteFields),
          validityDays
      });
      showToast(`Modelo de Estágio para ${polo.nomeFantasia} salvo com sucesso!`, 'success');
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
    return 'EST-' + codeStr;
  };

  const getValidationUrl = () => {
    return 'https://www.universocc.com.br/#/validador';
  };

  // Retorna a URL completa para o validador
  const getQrCodeExampleUrl = () => {
    return `${getValidationUrl()}?q=${getValidationCode()}`;
  };

  if (loading) return <div className="p-12 text-center text-slate-500">Carregando editor...</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] animate-fadeIn">
      
      {/* Toolbar Superior */}
      <div className="flex justify-between items-center mb-6 pb-6 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-4">
            <button 
                onClick={onBack}
                className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-teal-600 hover:border-teal-200 transition-colors"
            >
                <ArrowLeft size={20} />
            </button>
            <div>
                <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Editor de Termo de Estágio</h3>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                    Unidade: <span className="text-teal-600">{polo.nomeFantasia}</span>
                </p>
            </div>
        </div>
        <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-teal-900 transition-colors shadow-lg"
        >
            <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>

      {/* Conteúdo Principal Flexível (Sidebar + Canvas) */}
      <div className="flex flex-1 gap-8 overflow-hidden h-full">
        
        {/* Sidebar: Ferramentas */}
        <div className="w-72 flex flex-col gap-6 bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden h-full shrink-0">
            
            {/* Seção de Validade do Documento */}
            <div className="border-b border-slate-100 pb-4 flex flex-col gap-2 shrink-0">
                <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2 mb-1">
                    <Building2 size={14} className="text-teal-600" /> Validade do Documento
                </h4>
                <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                    {([30, 60, 90, 180] as const).map((days) => (
                        <button
                            key={days}
                            onClick={() => setValidityDays(days)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${
                                validityDays === days
                                ? 'bg-white text-teal-600 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {days}D
                        </button>
                    ))}
                </div>
                <p className="text-[9px] text-slate-400 font-medium leading-normal">
                    Define o prazo padrão que será impresso no documento e usado na verificação do QR Code.
                </p>
            </div>

            {/* Seção de Variáveis de Texto */}
            <div className="flex flex-col gap-2 flex-1 overflow-hidden">
                <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2 mb-1">
                    <Type size={14} className="text-teal-600" /> Texto Dinâmico
                </h4>
                <div className="overflow-y-auto custom-scrollbar space-y-2 pr-1 pb-2">
                    {VARIABLES.map(variable => (
                        <div 
                            key={variable.code}
                            draggable
                            onDragStart={(e) => handleDragStart(e, variable, 'variable')}
                            className="bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-200 rounded-xl p-3 cursor-grab active:cursor-grabbing transition-colors group select-none"
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[10px] font-bold text-slate-700 uppercase">{variable.label}</span>
                                <button 
                                    onClick={() => handleInsertVariable(variable.code)}
                                    className="text-[9px] bg-white border border-slate-200 px-2 py-0.5 rounded text-teal-600 font-bold hover:bg-teal-600 hover:text-white transition-colors"
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
                            <Sliders size={14} className="text-teal-600" /> Ajustar Elemento
                        </h4>
                        <button 
                            onClick={() => setSelectedFieldId(null)}
                            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase"
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
                                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
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
                                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                                />
                            </div>
                        )}

                        {/* Controles para Texto Dinâmico */}
                        {selectedField.type === 'text' && (
                            <div className="space-y-3">
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
                                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                                    />
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
                                            ? 'bg-teal-50 border-teal-200 text-teal-600 font-bold'
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
                                            ? 'bg-teal-50 border-teal-200 text-teal-600 font-bold'
                                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                        }`}
                                        title="Itálico"
                                    >
                                        <Italic size={12} />
                                    </button>
                                </div>

                                {/* Alinhamento de Texto */}
                                <div className="flex gap-1 bg-slate-100 p-0.5 rounded-xl">
                                    {(['left', 'center', 'right'] as const).map((align) => {
                                        const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
                                        const isAligned = selectedField.style?.textAlign === align || (!selectedField.style?.textAlign && align === 'left');
                                        return (
                                            <button
                                                key={align}
                                                onClick={() => updateSelectedFieldStyle({ textAlign: align })}
                                                className={`flex-1 flex items-center justify-center py-1 rounded-lg transition-colors ${
                                                    isAligned
                                                    ? 'bg-white text-teal-600 shadow-sm font-bold'
                                                    : 'text-slate-400 hover:text-slate-600'
                                                }`}
                                            >
                                                <Icon size={12} />
                                            </button>
                                        );
                                    })}
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

        {/* Área Central: Canvas A4 Scrollável */}
        <div 
            onClick={() => setSelectedFieldId(null)}
            className="flex-1 bg-slate-200/50 rounded-[2rem] border border-slate-300/50 overflow-auto flex justify-center p-8 custom-scrollbar shadow-inner relative animate-fadeIn"
        >
            
            <div 
                ref={canvasRef}
                className="bg-white shadow-2xl relative transition-transform duration-300 shrink-0"
                style={{ 
                    width: '794px', 
                    minHeight: '1123px', 
                    height: '1123px',
                    padding: '60px 80px', 
                    position: 'relative'
                }}
                onDrop={handleDropOnCanvas}
                onDragOver={handleDragOver}
                onClick={(e) => {
                    if (e.target === canvasRef.current) {
                        setSelectedFieldId(null);
                    }
                }}
            >
                {/* 1. Marca D'água */}
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

                {/* 2. Cabeçalho */}
                <DocumentHeader polo={polo} orientation="portrait" />

                {/* Título */}
                <div className="text-center mb-12 relative z-10">
                    <h2 className="text-2xl font-bold text-[#001a33] uppercase underline decoration-2 decoration-teal-600 underline-offset-4">
                        Termo de Compromisso de Estágio
                    </h2>
                </div>

                {/* 3. Corpo do Texto */}
                <div className="relative z-20 group mb-20">
                    <div 
                        ref={editorRef}
                        contentEditable
                        onInput={handleTextInput}
                        dangerouslySetInnerHTML={sanitizedHtml(textContent)}
                        className="min-h-[200px] outline-none text-justify leading-loose text-lg p-4 border border-transparent hover:border-teal-100 rounded-lg transition-colors cursor-text text-black"
                        style={{ fontFamily: '"Times New Roman", Times, serif', color: '#000000' }}
                    >
                    </div>
                </div>

                {/* 4. Campos Absolutos */}
                {absoluteFields.map(field => {
                    const isSelected = selectedFieldId === field.id;
                    return (
                        <div 
                            key={field.id}
                            onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                            onClick={(e) => e.stopPropagation()}
                            className={`absolute z-30 cursor-move group flex items-center justify-center transition-all ${
                                isSelected 
                                ? 'border-2 border-teal-500 shadow-md ring-2 ring-teal-500/20' 
                                : field.type === 'text' 
                                  ? 'bg-yellow-50/20 border border-yellow-200/50 hover:bg-yellow-100 hover:border-yellow-400 px-2 py-1 rounded' 
                                  : 'border-2 border-transparent hover:border-teal-400 hover:bg-slate-50/5'
                            }`}
                            style={{ 
                                left: field.x, 
                                top: field.y,
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
                                        <p className="text-[9px] font-mono font-black text-teal-600 tracking-wider mt-1 leading-none">
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
                                <>
                                    <GripVertical size={12} className="text-yellow-600 opacity-50 hidden group-hover:block mr-1" />
                                    {field.value}
                                </>
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
                })}

                {/* Footer Fixo */}
                <div className="absolute bottom-24 left-0 w-full px-20 text-center pointer-events-none">
                    <div className="w-72 border-t border-black mx-auto mb-2"></div>
                    <p className="font-bold text-black uppercase text-sm">Supervisão Geral de Estágio</p>
                    <p className="text-xs text-slate-600">{polo.nomeFantasia}</p>
                </div>

                {/* Aviso de Validade e Autenticidade do Documento */}
                <div className="absolute bottom-10 left-0 w-full text-center text-[9px] text-slate-400 font-bold uppercase tracking-wider select-none pointer-events-none flex flex-col gap-1">
                    <p>Para verificar a autenticidade deste termo de estágio acesse: <span className="text-teal-600 font-black">www.universocc.com.br/#/validador</span></p>
                    <p>Validade deste documento: {validityDays} dias a partir da data de emissão.</p>
                </div>

            </div>
        </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-[9999] animate-fadeIn">
          <div className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-300 ${
            toast.type === 'success' 
            ? 'bg-[#0d9488] border-teal-400 text-white' 
            : 'bg-red-500 border-red-400 text-white'
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

export default EstagioEditor;
