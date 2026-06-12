// File: modules/gestor/cadastros/modelos-documentos/declaracao/components/DeclaracaoEditor.tsx

import React, { useState, useRef, useEffect } from 'react';
import { 
  Save, Type, Trash2, AlignLeft, AlignCenter, AlignRight, Bold, Italic, 
  GripVertical, ArrowLeft, QrCode, Image as ImageIcon, Upload, Building2
} from 'lucide-react';
import { declaracaoService } from '../declaracao.service';
import { marcaDaguaService } from '../../../../configuracoes/marca-dagua/marca-dagua.service';

interface DeclaracaoEditorProps {
  polo: any;
  onBack: () => void;
}

// Variáveis de Texto
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

const DeclaracaoEditor: React.FC<DeclaracaoEditorProps> = ({ polo, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [watermark, setWatermark] = useState<any>(null);
  const [qrConfig, setQrConfig] = useState<any>(null);

  // Estado do Documento
  const [textContent, setTextContent] = useState('');
  const [absoluteFields, setAbsoluteFields] = useState<AbsoluteField[]>([]);
  
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
    const template = await declaracaoService.getTemplate(polo.id);
    setTextContent(template.textContent);
    
    const fieldsWithTypes = (template.absoluteFields || []).map((f: any) => ({
        ...f,
        type: f.type || 'text'
    }));
    setAbsoluteFields(fieldsWithTypes);

    // 2. Carrega Marca D'água
    const watermarks = await marcaDaguaService.getCompaniesWithWatermark();
    const wm = watermarks.find(w => w.id === polo.id);
    setWatermark(wm);

    // 3. Carrega Configuração de QR Code
    const qrData = await declaracaoService.getQrConfig();
    setQrConfig(qrData);

    setLoading(false);
  };

  // --- Helpers de Edição Texto ---
  const handleInsertVariable = (variableCode: string) => {
    document.execCommand('insertText', false, variableCode);
  };

  const handleFormat = (command: string) => {
    document.execCommand(command, false);
  };

  const handleTextInput = (e: React.FormEvent<HTMLDivElement>) => {
    setTextContent(e.currentTarget.innerHTML);
  };

  // --- Upload de Assinatura ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const newField: AbsoluteField = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'image',
            value: event.target?.result as string,
            x: 250, 
            y: 850, 
            width: 200,
            style: { zIndex: 50 }
        };
        setAbsoluteFields(prev => [...prev, newField]);
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
  };

  const handleSave = async () => {
    setSaving(true);
    await declaracaoService.saveTemplate(polo.id, {
        textContent,
        absoluteFields
    });
    setSaving(false);
    alert(`Modelo para ${polo.nomeFantasia} salvo com sucesso!`);
  };

  // Retorna a URL completa para o validador
  const getQrCodeExampleUrl = () => {
    const baseUrl = window.location.origin + window.location.pathname + '#/validador?q=';
    let codeStr = 'VALIDACAO-PADRAO';
    
    if (qrConfig && qrConfig.pattern) {
      codeStr = qrConfig.pattern.map((token: string) => {
          if (token === '{POLO_ID}') return polo.id.slice(0,3).toUpperCase();
          if (token === '{ANO_ATUAL}') return new Date().getFullYear();
          return token.replace(/[{}]/g, '').substring(0, 4);
      }).join(qrConfig.separator || '-');
    }
    
    // Adiciona DEC para diferenciar no validador
    return baseUrl + 'DEC-' + codeStr;
  };

  if (loading) return <div className="p-12 text-center text-slate-500">Carregando editor...</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] animate-fadeIn">
      
      {/* Toolbar Superior */}
      <div className="flex justify-between items-center mb-6 pb-6 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-4">
            <button 
                onClick={onBack}
                className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-colors"
            >
                <ArrowLeft size={20} />
            </button>
            <div>
                <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Editor de Declaração</h3>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                    Unidade: <span className="text-blue-600">{polo.nomeFantasia}</span>
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
        <div className="w-72 flex flex-col gap-6 bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden h-full shrink-0">
            {/* Seção de Variáveis de Texto */}
            <div className="flex flex-col gap-2 flex-1 overflow-hidden">
                <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2 mb-1">
                    <Type size={14} className="text-blue-600" /> Texto Dinâmico
                </h4>
                <div className="overflow-y-auto custom-scrollbar space-y-2 pr-1 pb-2">
                    {VARIABLES.map(variable => (
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
            </div>
        </div>

        {/* Área Central: Canvas A4 Scrollável */}
        <div className="flex-1 bg-slate-200/50 rounded-[2rem] border border-slate-300/50 overflow-auto flex justify-center p-8 custom-scrollbar shadow-inner relative">
            
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
                                transform: 'rotate(-45deg)'
                            }}
                        />
                    </div>
                )}

                {/* 2. Cabeçalho */}
                <div className="flex flex-col items-center border-b-2 border-blue-900/10 pb-6 mb-10 relative z-10 select-none pointer-events-none text-center">
                    {polo.logoUrl ? (
                        <img src={polo.logoUrl} alt="Logo" className="h-24 mb-4 object-contain" />
                    ) : (
                        <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center mb-4 border border-slate-200">
                            <Building2 size={32} className="text-slate-300" />
                        </div>
                    )}
                    <h1 className="text-xl font-black text-[#001a33] uppercase tracking-wide">{polo.nomeFantasia}</h1>
                    <p className="text-xs text-slate-600 font-medium mt-1">
                        {polo.endereco}, {polo.numero} - {polo.cidade}/{polo.uf}
                    </p>
                    <p className="text-xs text-slate-500 font-medium">CNPJ: {polo.cnpj}</p>
                </div>

                {/* Título */}
                <div className="text-center mb-12 relative z-10">
                    <h2 className="text-2xl font-bold text-[#001a33] uppercase underline decoration-2 decoration-blue-600 underline-offset-4">
                        Declaração de Matrícula
                    </h2>
                </div>

                {/* 3. Corpo do Texto */}
                <div className="relative z-20 group mb-20">
                    <div 
                        ref={editorRef}
                        contentEditable
                        onInput={handleTextInput}
                        dangerouslySetInnerHTML={{ __html: textContent }}
                        className="min-h-[200px] outline-none text-justify leading-loose text-lg p-4 border border-transparent hover:border-blue-100 rounded-lg transition-colors cursor-text text-black"
                        style={{ fontFamily: '"Times New Roman", Times, serif', color: '#000000' }}
                    >
                    </div>
                </div>

                {/* 4. Campos Absolutos */}
                {absoluteFields.map(field => (
                    <div 
                        key={field.id}
                        onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                        className={`absolute z-30 cursor-move group flex items-center justify-center ${
                            field.type === 'text' 
                            ? 'bg-yellow-50/20 border border-yellow-200/50 hover:bg-yellow-100 hover:border-yellow-400 px-2 py-1 rounded' 
                            : 'border-2 border-transparent hover:border-blue-400'
                        }`}
                        style={{ 
                            left: field.x, 
                            top: field.y,
                            color: '#000',
                            width: field.width ? `${field.width}px` : 'auto',
                            ...field.style
                        }}
                    >
                        {field.type === 'qrcode' && (
                            <div className="w-full h-full bg-white p-1 shadow-sm">
                                <img 
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getQrCodeExampleUrl())}`} 
                                    alt="QR Code"
                                    className="w-full h-full object-contain pointer-events-none"
                                />
                                <div className="absolute -bottom-5 left-0 w-full text-center text-[8px] font-mono text-slate-500 bg-white/80">
                                    Validação
                                </div>
                            </div>
                        )}

                        {field.type === 'image' && (
                            <img 
                                src={field.value} 
                                alt="Assinatura" 
                                className="w-full h-full object-contain pointer-events-none"
                            />
                        )}

                        {field.type === 'text' && (
                            <>
                                <GripVertical size={12} className="text-yellow-600 opacity-50 hidden group-hover:block mr-1" />
                                {field.value}
                            </>
                        )}

                        <button 
                            onClick={() => handleRemoveField(field.id)}
                            className="absolute -top-3 -right-3 ml-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-1 shadow-md border border-slate-100 z-50"
                            title="Remover"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}

                {/* Footer Fixo */}
                <div className="absolute bottom-24 left-0 w-full px-20 text-center pointer-events-none">
                    <div className="w-72 border-t border-black mx-auto mb-2"></div>
                    <p className="font-bold text-black uppercase text-sm">Secretaria Acadêmica</p>
                    <p className="text-xs text-slate-600">{polo.nomeFantasia}</p>
                </div>

            </div>
        </div>

      </div>
    </div>
  );
};

export default DeclaracaoEditor;