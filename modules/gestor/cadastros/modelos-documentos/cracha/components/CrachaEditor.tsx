import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Save, 
  LayoutTemplate, 
  ZoomOut, 
  ZoomIn, 
  Upload, 
  Loader2, 
  Trash2, 
  Plus, 
  Sliders, 
  Bold, 
  Italic, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  CheckCircle2, 
  AlertCircle,
  QrCode,
  User,
  Type,
  Image as ImageIcon
} from 'lucide-react';
import { supabase } from '../../../../../../lib/supabase';
import { assinaturasService } from '../../../../configuracoes/assinaturas/assinaturas.service';
import CrachaPreview from './CrachaPreview';

interface CrachaEditorProps {
  modelo: any;
  onSave: (modelo: any) => void;
  onCancel: () => void;
}

// Coordenadas padrão iniciais em porcentagem (%) para o crachá vertical
const posicoesPadrao: Record<string, { x: number; y: number }> = {
  foto: { x: 27.5, y: 14 },
  nome: { x: 3.7, y: 47.0 },
  cargo: { x: 3.7, y: 53.0 },
  matricula: { x: 5.5, y: 60.0 },
  cpf: { x: 5.5, y: 66.2 },
  polo: { x: 5.5, y: 72.4 },
  qrcode: { x: 62.0, y: 60.0 }
};

const CrachaEditor: React.FC<CrachaEditorProps> = ({ modelo, onSave, onCancel }) => {
  const [formData, setFormData] = useState<any>(modelo || {
    id: 'cracha',
    nome: 'Crachá de Estágio',
    cargoPadrao: 'ESTAGIÁRIO',
    status: 'ativo',
    startNumber: 1000,
    hasVerso: true,
    corPrimaria: '#0f172a',
    corSecundaria: '#10b981',
    textoFrente: 'ESTAGIÁRIO',
    textoVerso: 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal, intransferível e obrigatório nas dependências da instituição e no local do estágio.\n2. Mantenha-o sempre visível.\n3. Em caso de perda, comunique imediatamente a Universo Cursos e Consultoria.',
    bgFrenteUrl: '',
    bgVersoUrl: '',
    ocultarDesignPadrao: false,
    corTexto: '#1e293b',
    tamanhoFonteNome: 8.5,
    tamanhoFonteDados: 6.8,
    fotoWidth: 45.0,
    fotoHeight: 28.5,
    fields: []
  });

  const [activeTab, setActiveTab] = useState<'config' | 'frente' | 'verso'>('config');
  const [previewMode, setPreviewMode] = useState<'frente' | 'verso' | 'ambos'>('ambos');
  const [zoomLevel, setZoomLevel] = useState(120);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Migração/inicialização automática de templates antigos para o novo array de fields
  useEffect(() => {
    if (!formData.fields || !Array.isArray(formData.fields) || formData.fields.length === 0) {
      const pos = formData.posicoes || posicoesPadrao;
      const initialFields = [
        {
          id: 'foto',
          type: 'foto',
          value: '{{ALUNO_FOTO}}',
          x: pos.foto?.x ?? 27.5,
          y: pos.foto?.y ?? 14,
          width: formData.fotoWidth || 45,
          height: formData.fotoHeight || 28.5,
          page: 'frente'
        },
        {
          id: 'nome',
          type: 'text',
          value: '{{ALUNO_NOME}}',
          x: pos.nome?.x ?? 3.7,
          y: pos.nome?.y ?? 47.0,
          page: 'frente',
          style: { fontWeight: 'bold', fontSize: `${formData.tamanhoFonteNome || 8.5}px`, textAlign: 'center', color: formData.corTexto || '#1e293b' }
        },
        {
          id: 'cargo',
          type: 'text',
          value: formData.textoFrente || formData.cargoPadrao || 'ESTAGIÁRIO',
          x: pos.cargo?.x ?? 3.7,
          y: pos.cargo?.y ?? 53.0,
          page: 'frente',
          style: { fontWeight: 'bold', fontSize: `${formData.tamanhoFonteDados || 7.5}px`, textAlign: 'center', color: formData.corSecundaria || '#10b981' }
        },
        {
          id: 'matricula',
          type: 'text',
          value: 'MATRÍCULA: {{ALUNO_MATRICULA}}',
          x: pos.matricula?.x ?? 5.5,
          y: pos.matricula?.y ?? 60.0,
          page: 'frente',
          style: { fontSize: `${formData.tamanhoFonteDados || 6.8}px`, color: formData.corTexto || '#1e293b' }
        },
        {
          id: 'cpf',
          type: 'text',
          value: 'CPF: {{ALUNO_CPF}}',
          x: pos.cpf?.x ?? 5.5,
          y: pos.cpf?.y ?? 66.2,
          page: 'frente',
          style: { fontSize: `${formData.tamanhoFonteDados || 6.8}px`, color: formData.corTexto || '#1e293b' }
        },
        {
          id: 'polo',
          type: 'text',
          value: 'POLO: {{POLO_NOME}}',
          x: pos.polo?.x ?? 5.5,
          y: pos.polo?.y ?? 72.4,
          page: 'frente',
          style: { fontSize: `${formData.tamanhoFonteDados || 6.8}px`, color: formData.corTexto || '#1e293b' }
        },
        {
          id: 'qrcode',
          type: 'qrcode',
          value: 'QR_VALIDADOR_CRACHA',
          x: pos.qrcode?.x ?? 62.0,
          y: pos.qrcode?.y ?? 60.0,
          width: 22,
          height: 14,
          page: 'frente'
        },
        {
          id: 'instrucoes',
          type: 'text',
          value: formData.textoVerso || 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal, intransferível e obrigatório nas dependências da instituição e no local do estágio.\n2. Mantenha-o sempre visível.\n3. Em caso de perda, comunique imediatamente a Universo Cursos e Consultoria.',
          x: 7.4,
          y: 14.0,
          width: 85.2,
          page: 'verso',
          style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' }
        },
        {
          id: 'admissao_label',
          type: 'text',
          value: 'ADMISSÃO',
          x: 7.4,
          y: 56.0,
          page: 'verso',
          style: { fontSize: '4px', fontWeight: 'bold', color: '#94a3b8' }
        },
        {
          id: 'admissao_valor',
          type: 'text',
          value: '05/01/2024',
          x: 7.4,
          y: 59.0,
          page: 'verso',
          style: { fontSize: '5.8px', fontWeight: 'bold', color: '#475569' }
        },
        {
          id: 'emissao_label',
          type: 'text',
          value: 'EMISSÃO',
          x: 50.0,
          y: 56.0,
          page: 'verso',
          style: { fontSize: '4px', fontWeight: 'bold', color: '#94a3b8' }
        },
        {
          id: 'emissao_valor',
          type: 'text',
          value: '{{DATA_HOJE}}',
          x: 50.0,
          y: 59.0,
          page: 'verso',
          style: { fontSize: '5.8px', fontWeight: 'bold', color: '#475569' }
        },
        {
          id: 'assinatura_linha',
          type: 'text',
          value: '_____________________________________',
          x: 7.4,
          y: 70.0,
          page: 'verso',
          style: { fontSize: '5px', textAlign: 'center', color: '#94a3b8' }
        },
        {
          id: 'assinatura_cargo',
          type: 'text',
          value: 'Diretoria de Recursos Humanos',
          x: 7.4,
          y: 74.0,
          page: 'verso',
          style: { fontSize: '4.5px', fontWeight: 'bold', color: '#94a3b8', textAlign: 'center' }
        },
        {
          id: 'assinatura_instituicao',
          type: 'text',
          value: 'UNIVERSO CURSOS E CONSULTORIA',
          x: 7.4,
          y: 78.0,
          page: 'verso',
          style: { fontSize: '5.5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' }
        }
      ];

      setFormData((prev: any) => ({ ...prev, fields: initialFields }));
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'frente') setPreviewMode('frente');
    else if (activeTab === 'verso' && formData.hasVerso) setPreviewMode('verso');
    else setPreviewMode(formData.hasVerso ? 'ambos' : 'frente');
  }, [activeTab, formData.hasVerso]);

  const selectedField = formData.fields?.find((f: any) => f.id === selectedFieldId);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData({ ...formData, [name]: checked });
    } else {
      setFormData({ ...formData, [name]: name === 'startNumber' ? parseInt(value) || 0 : value });
    }
  };

  // Upload Imagem de Fundo (Storage Supabase)
  const handleUploadBg = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'bgFrenteUrl' | 'bgVersoUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const filePath = `templates/bg_${Date.now()}_${fieldName}.png`;

      const { data, error } = await supabase.storage
        .from('documentos')
        .upload(filePath, file, {
          cacheControl: '31536000',
          upsert: true
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(data.path);

      setFormData({ ...formData, [fieldName]: urlData.publicUrl });
      showToast('Imagem de fundo do crachá salva com sucesso!', 'success');
    } catch (err: any) {
      console.error('Erro ao fazer upload:', err);
      showToast('Erro ao fazer upload da imagem: ' + err.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Helpers de Modificação dos Campos Absolutos
  const updateSelectedField = (updates: any) => {
    if (!selectedFieldId) return;
    setFormData((prev: any) => ({
      ...prev,
      fields: (prev.fields || []).map((f: any) => 
        f.id === selectedFieldId ? { ...f, ...updates } : f
      )
    }));
  };

  const updateSelectedFieldStyle = (styleUpdates: any) => {
    if (!selectedFieldId) return;
    setFormData((prev: any) => ({
      ...prev,
      fields: (prev.fields || []).map((f: any) => 
        f.id === selectedFieldId ? { 
          ...f, 
          style: { ...(f.style || {}), ...styleUpdates } 
        } : f
      )
    }));
  };

  const handleRemoveField = (fieldId: string) => {
    setFormData((prev: any) => ({
      ...prev,
      fields: (prev.fields || []).filter((f: any) => f.id !== fieldId)
    }));
    setSelectedFieldId(null);
    showToast('Elemento removido do layout!', 'success');
  };

  const handleAddText = () => {
    const generatedId = `txt-${Math.random().toString(36).substr(2, 9)}`;
    const newField = {
      id: generatedId,
      type: 'text',
      value: 'Novo Texto',
      x: 10,
      y: 50,
      width: 80,
      page: activeTab === 'verso' ? 'verso' : 'frente',
      style: { fontSize: '8px', color: formData.corTexto || '#1e293b', textAlign: 'center' }
    };
    setFormData((prev: any) => ({
      ...prev,
      fields: [...(prev.fields || []), newField]
    }));
    setSelectedFieldId(generatedId);
    showToast('Novo bloco de texto adicionado!', 'success');
  };

  const handleAddSignature = async (roleId: 'diretoriaGeral' | 'secretaria' | 'coordenacao' | 'financeiro', label: string) => {
    try {
      const sigs = await assinaturasService.getSignatures();
      const url = sigs[roleId];
      if (!url) {
        showToast(`Assinatura de ${label} não cadastrada nas Configurações.`, 'warning');
        return;
      }
      const generatedId = `sig-${Math.random().toString(36).substr(2, 9)}`;
      const newField = {
        id: generatedId,
        type: 'image',
        value: url,
        x: 15,
        y: 70,
        width: 70,
        height: 10,
        page: activeTab === 'verso' ? 'verso' : 'frente',
        style: { zIndex: 40, mixBlendMode: 'multiply' }
      };
      setFormData((prev: any) => ({
        ...prev,
        fields: [...(prev.fields || []), newField]
      }));
      setSelectedFieldId(generatedId);
      showToast(`Assinatura de ${label} inserida!`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Erro ao obter assinaturas do Supabase.', 'error');
    }
  };

  const handleZoomOut = () => setZoomLevel(prev => Math.max(50, prev - 10));
  const handleZoomIn = () => setZoomLevel(prev => Math.min(200, prev + 10));

  return (
    <div className="bg-white rounded-[2.5rem] p-4 lg:p-8 border border-slate-200 shadow-sm animate-fadeIn flex flex-col min-h-[calc(100vh-10rem)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 pb-6 border-b border-slate-100 gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={onCancel}
            className="p-3 bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
              <LayoutTemplate size={24} className="text-blue-600" />
              Editar Crachá de Estágio
            </h3>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">
              Personalize o layout, posicione e edite os elementos do crachá
            </p>
          </div>
        </div>
        <button 
          onClick={() => onSave(formData)}
          className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 w-full sm:w-auto justify-center"
        >
          <Save size={16} /> Salvar Alterações
        </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-8 flex-1">
        
        {/* Editor Config Panel (Left) */}
        <div className="w-full xl:w-[400px] flex flex-col gap-6 shrink-0">
          <div className="p-1 rounded-xl flex gap-1 bg-slate-100">
             <button
                onClick={() => setActiveTab('config')}
                className={`flex-1 py-2 px-4 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === 'config' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
             >
                Config
             </button>
             <button
                onClick={() => setActiveTab('frente')}
                className={`flex-1 py-2 px-4 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === 'frente' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
             >
                Frente
             </button>
             <button
                onClick={() => setActiveTab('verso')}
                className={`flex-1 py-2 px-4 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === 'verso' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
             >
                Verso
             </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6 max-h-[60vh] xl:max-h-[68vh]">
            
            {activeTab === 'config' && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome do Modelo <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    name="nome"
                    value={formData.nome}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Número Sequencial Inicial</label>
                  <input 
                    type="number" 
                    name="startNumber"
                    value={formData.startNumber || 1000}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Cargo Padrão / Setor</label>
                  <input 
                    type="text" 
                    name="cargoPadrao"
                    value={formData.cargoPadrao}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Cor Primária</label>
                    <input 
                      type="color" 
                      name="corPrimaria"
                      value={formData.corPrimaria}
                      onChange={handleChange}
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer p-1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Cor Secundária</label>
                    <input 
                      type="color" 
                      name="corSecundaria"
                      value={formData.corSecundaria}
                      onChange={handleChange}
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer p-1"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 cursor-pointer p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                  <input 
                    type="checkbox" 
                    name="hasVerso" 
                    checked={formData.hasVerso} 
                    onChange={handleChange}
                    className="w-5 h-5 text-blue-600 rounded" 
                  />
                  <div>
                    <span className="block text-sm font-bold text-[#001a33] uppercase">Ter verso impresso</span>
                    <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Normas internas de uso e devolução no verso.</span>
                  </div>
                </label>
              </div>
            )}

            {(activeTab === 'frente' || (activeTab === 'verso' && formData.hasVerso)) && (
              <div className="space-y-5 animate-fadeIn">
                
                {/* Background upload section */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Imagem de Fundo ({activeTab === 'frente' ? 'Frente' : 'Verso'})
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      name={activeTab === 'frente' ? 'bgFrenteUrl' : 'bgVersoUrl'}
                      placeholder="URL da imagem (.png / .jpg)"
                      value={(activeTab === 'frente' ? formData.bgFrenteUrl : formData.bgVersoUrl) || ''}
                      onChange={handleChange}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                    <label className="flex items-center justify-center p-3 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 rounded-xl border border-slate-200 cursor-pointer transition-colors relative">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => handleUploadBg(e, activeTab === 'frente' ? 'bgFrenteUrl' : 'bgVersoUrl')} 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        disabled={isUploading}
                      />
                      {isUploading ? <Loader2 size={18} className="animate-spin text-blue-600" /> : <Upload size={18} />}
                    </label>
                  </div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Recomendado: 540 x 856 pixels (vertical .png transparente)</p>
                </div>

                {/* Design Ocultation for frente */}
                {activeTab === 'frente' && (
                  <label className="flex items-center gap-3 cursor-pointer p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                    <input 
                      type="checkbox" 
                      name="ocultarDesignPadrao" 
                      checked={formData.ocultarDesignPadrao || false} 
                      onChange={handleChange}
                      className="w-5 h-5 text-blue-600 rounded" 
                    />
                    <div>
                      <span className="block text-xs font-bold text-[#001a33] uppercase">Ocultar Cabeçalho/Marca d'água</span>
                      <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Mostra apenas o fundo PNG customizado.</span>
                    </div>
                  </label>
                )}

                {/* Add items panel */}
                <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-4">
                  <h4 className="text-[10px] font-black text-[#001a33] uppercase tracking-widest flex items-center gap-2">
                    <Plus size={14} className="text-blue-600" /> Inserir Elemento ({activeTab === 'frente' ? 'Frente' : 'Verso'})
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleAddText}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl text-xs font-bold text-slate-700 transition-colors"
                    >
                      Texto
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        const generatedId = `qrcode-${Date.now()}`;
                        const newField = {
                          id: generatedId,
                          type: 'qrcode',
                          value: 'QR_VALIDADOR_CRACHA',
                          x: 40,
                          y: 40,
                          width: 22,
                          height: 14,
                          page: activeTab === 'verso' ? 'verso' : 'frente'
                        };
                        setFormData((prev: any) => ({
                          ...prev,
                          fields: [...(prev.fields || []), newField]
                        }));
                        setSelectedFieldId(generatedId);
                        showToast('QR Code de Validação adicionado!', 'success');
                      }}
                      disabled={formData.fields?.some((f: any) => f.type === 'qrcode' && (f.page || 'frente') === activeTab)}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl text-xs font-bold text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      QR Code
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Inserir Assinaturas Cadastradas</label>
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
                          onClick={() => handleAddSignature(role.id, role.label)}
                          className="py-1.5 px-2 bg-white hover:bg-pink-50 hover:text-pink-600 rounded-xl border border-slate-200 hover:border-pink-200 text-[10px] font-bold text-slate-600 transition-colors truncate"
                        >
                          {role.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Elements list on this page */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Elementos na Página</label>
                  <div className="flex flex-col gap-1 max-h-[250px] overflow-y-auto custom-scrollbar">
                    {(formData.fields || [])
                      .filter((f: any) => (f.page || 'frente') === activeTab)
                      .map((f: any) => {
                        const isSelected = selectedFieldId === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setSelectedFieldId(f.id)}
                            className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-between ${
                              isSelected 
                                ? 'bg-blue-50 border-blue-200 text-blue-600' 
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <span className="truncate flex-1 flex items-center gap-2">
                              {f.type === 'foto' && (
                                <>
                                  <User size={14} className="text-slate-400 shrink-0" />
                                  <span>Foto do Estudante</span>
                                </>
                              )}
                              {f.type === 'qrcode' && (
                                <>
                                  <QrCode size={14} className="text-slate-400 shrink-0" />
                                  <span>QR Code de Validação</span>
                                </>
                              )}
                              {f.type === 'image' && (
                                <>
                                  <ImageIcon size={14} className="text-slate-400 shrink-0" />
                                  <span>Assinatura Cadastrada</span>
                                </>
                              )}
                              {f.type === 'text' && (
                                <>
                                  <Type size={14} className="text-slate-400 shrink-0" />
                                  <span className="truncate">{f.value.length > 25 ? f.value.substring(0, 25) + '...' : f.value}</span>
                                </>
                              )}
                            </span>
                            <span className="text-[9px] font-mono opacity-60">
                              X:{Math.round(f.x)}% Y:{Math.round(f.y)}%
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>

              </div>
            )}

            {activeTab === 'verso' && !formData.hasVerso && (
               <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                 <p className="text-xs font-bold uppercase tracking-widest">O verso está desabilitado na aba Config.</p>
               </div>
            )}
          </div>

          {/* Adjust Selected Element Panel */}
          {selectedField && (
            <div className="border-t border-slate-200 pt-4 flex flex-col gap-3 shrink-0 animate-fadeIn bg-white">
              <div className="flex justify-between items-center mb-1">
                <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2">
                  <Sliders size={14} className="text-blue-600" /> Ajustar Elemento
                </h4>
                <button 
                  onClick={() => setSelectedFieldId(null)}
                  className="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase"
                >
                  Fechar
                </button>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col gap-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                
                {/* Coordinates Sliders */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      <span>Posição X</span>
                      <span className="font-mono">{selectedField.x}%</span>
                    </label>
                    <input 
                      type="range" 
                      min="-10" 
                      max="100" 
                      step="0.5"
                      value={selectedField.x}
                      onChange={(e) => updateSelectedField({ x: parseFloat(e.target.value) })}
                      className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                  <div>
                    <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      <span>Posição Y</span>
                      <span className="font-mono">{selectedField.y}%</span>
                    </label>
                    <input 
                      type="range" 
                      min="-10" 
                      max="100" 
                      step="0.5"
                      value={selectedField.y}
                      onChange={(e) => updateSelectedField({ y: parseFloat(e.target.value) })}
                      className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                </div>

                {/* Width & Height Sliders */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      <span>Largura</span>
                      <span className="font-mono">{selectedField.width || 30}%</span>
                    </label>
                    <input 
                      type="range" 
                      min="5" 
                      max="100" 
                      step="0.5"
                      value={selectedField.width || 30}
                      onChange={(e) => updateSelectedField({ width: parseFloat(e.target.value) })}
                      className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                  {(selectedField.type === 'foto' || selectedField.type === 'qrcode' || selectedField.type === 'image') && (
                    <div>
                      <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                        <span>Altura</span>
                        <span className="font-mono">{selectedField.height || 15}%</span>
                      </label>
                      <input 
                        type="range" 
                        min="3" 
                        max="100" 
                        step="0.5"
                        value={selectedField.height || 15}
                        onChange={(e) => updateSelectedField({ height: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                  )}
                </div>

                {/* Page Placement selection */}
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Página do Elemento</label>
                  <select 
                    value={selectedField.page || 'frente'} 
                    onChange={(e) => updateSelectedField({ page: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none"
                  >
                    <option value="frente">Frente</option>
                    {formData.hasVerso && <option value="verso">Verso</option>}
                  </select>
                </div>

                {/* Text specific adjustments */}
                {selectedField.type === 'text' && (
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Conteúdo do Texto</label>
                      <textarea
                        value={selectedField.value}
                        onChange={(e) => updateSelectedField({ value: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 resize-y custom-scrollbar min-h-[60px]"
                      />
                      <div className="flex flex-wrap gap-1 mt-1">
                        {['{{ALUNO_NOME}}', '{{ALUNO_MATRICULA}}', '{{ALUNO_CPF}}', '{{POLO_NOME}}', '{{DATA_HOJE}}'].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => updateSelectedField({ value: selectedField.value + ' ' + v })}
                            className="text-[7.5px] font-mono font-bold bg-slate-200 hover:bg-slate-300 text-slate-600 px-1 py-0.5 rounded"
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                          <span>Tam. Fonte</span>
                          <span className="font-mono">{selectedField.style?.fontSize || '8px'}</span>
                        </label>
                        <input 
                          type="range" 
                          min="4" 
                          max="24" 
                          step="0.2"
                          value={parseFloat(selectedField.style?.fontSize) || 8}
                          onChange={(e) => updateSelectedFieldStyle({ fontSize: `${e.target.value}px` })}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Cor Texto</label>
                        <input 
                          type="color" 
                          value={selectedField.style?.color || '#1e293b'}
                          onChange={(e) => updateSelectedFieldStyle({ color: e.target.value })}
                          className="w-full h-7 bg-white border border-slate-200 rounded cursor-pointer p-0.5"
                        />
                      </div>
                    </div>

                    {/* Font styling and Alignments buttons */}
                    <div className="flex gap-2">
                      <div className="flex rounded-lg bg-white border border-slate-200 p-0.5 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => updateSelectedFieldStyle({ fontWeight: selectedField.style?.fontWeight === 'bold' ? 'normal' : 'bold' })}
                          className={`p-1.5 rounded transition-colors ${selectedField.style?.fontWeight === 'bold' ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                          <Bold size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedFieldStyle({ fontStyle: selectedField.style?.fontStyle === 'italic' ? 'normal' : 'italic' })}
                          className={`p-1.5 rounded transition-colors ${selectedField.style?.fontStyle === 'italic' ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                          <Italic size={12} />
                        </button>
                      </div>

                      <div className="flex rounded-lg bg-white border border-slate-200 p-0.5 overflow-hidden">
                        {(['left', 'center', 'right'] as const).map((align) => {
                          const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
                          const isActive = (selectedField.style?.textAlign || 'center') === align;
                          return (
                            <button
                              key={align}
                              type="button"
                              onClick={() => updateSelectedFieldStyle({ textAlign: align })}
                              className={`p-1.5 rounded transition-colors ${isActive ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                              <Icon size={12} />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                )}

                {/* Blend modes for image/signatures */}
                {selectedField.type === 'image' && (
                  <div className="pt-2 border-t border-slate-200">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Modo de Mesclagem</label>
                    <select
                      value={selectedField.style?.mixBlendMode || 'multiply'}
                      onChange={(e) => updateSelectedFieldStyle({ mixBlendMode: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none"
                    >
                      <option value="normal">Normal (Sem transparência)</option>
                      <option value="multiply">Multiplicar (Fundo transparente)</option>
                    </select>
                  </div>
                )}

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => handleRemoveField(selectedField.id)}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 py-2 border border-red-200 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors"
                >
                  <Trash2 size={12} /> Remover Elemento
                </button>

              </div>
            </div>
          )}

        </div>

        {/* Live Preview Area (Right) */}
        <div className="flex-1 bg-slate-200 rounded-2xl overflow-hidden flex flex-col relative border border-slate-300">
          <div className="bg-slate-850 bg-[#0d1527] text-white p-3 flex justify-between items-center text-xs font-bold uppercase shadow-md z-10 shrink-0">
            <span className="tracking-widest hidden sm:inline text-slate-350">Visualização Prévia (CR80 Vertical)</span>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg">
                <button onClick={handleZoomOut} className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded">
                  <ZoomOut size={14} />
                </button>
                <span className="text-[10px] w-8 text-center">{zoomLevel}%</span>
                <button onClick={handleZoomIn} className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded">
                  <ZoomIn size={14} />
                </button>
              </div>
              
              <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg">
                <button 
                  onClick={() => setPreviewMode('frente')}
                  className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'frente' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
                >
                  FRENTE
                </button>
                {formData.hasVerso && (
                  <button 
                    onClick={() => setPreviewMode('verso')}
                    className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'verso' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
                  >
                    VERSO
                  </button>
                )}
                {formData.hasVerso && (
                  <button 
                    onClick={() => setPreviewMode('ambos')}
                    className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'ambos' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
                  >
                    AMBOS
                  </button>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto custom-scrollbar p-8 bg-slate-200 flex flex-col sm:flex-row items-center justify-center gap-8 min-h-0 select-none">
             {(previewMode === 'frente' || previewMode === 'ambos') && (
               <div className="flex flex-col items-center gap-2">
                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Frente</span>
                 <CrachaPreview 
                   formData={formData} 
                   page="frente" 
                   zoomLevel={zoomLevel} 
                   isEditable={true}
                   selectedFieldId={selectedFieldId}
                   onSelectField={setSelectedFieldId}
                   onChangePositions={(updatedFields) => setFormData({ ...formData, fields: updatedFields })}
                 />
               </div>
             )}
             {(previewMode === 'verso' || previewMode === 'ambos') && formData.hasVerso && (
               <div className="flex flex-col items-center gap-2">
                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Verso</span>
                 <CrachaPreview 
                   formData={formData} 
                   page="verso" 
                   zoomLevel={zoomLevel} 
                   isEditable={true}
                   selectedFieldId={selectedFieldId}
                   onSelectField={setSelectedFieldId}
                   onChangePositions={(updatedFields) => setFormData({ ...formData, fields: updatedFields })}
                 />
               </div>
             )}
          </div>
        </div>

      </div>

      {/* Elegant Toast Notifications */}
      {toast && (
        <div className="fixed top-6 right-6 z-[99999] animate-fadeIn">
          <div className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-300 ${
            toast.type === 'success' 
            ? 'bg-emerald-500/95 border-emerald-400 text-white' 
            : toast.type === 'error'
              ? 'bg-red-500/95 border-red-400 text-white'
              : 'bg-amber-500/95 border-amber-400 text-white'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span className="text-xs font-black uppercase tracking-wider">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrachaEditor;
