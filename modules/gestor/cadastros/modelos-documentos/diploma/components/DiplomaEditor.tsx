// File: modules/gestor/cadastros/modelos-documentos/diploma/components/DiplomaEditor.tsx

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Save, LayoutTemplate, Copy, Check, ZoomOut, ZoomIn, 
  Upload, Loader2, Sparkles, Plus, Trash2, Eye, Layout, Sliders 
} from 'lucide-react';
import { supabase } from '../../../../../../lib/supabase';
import DiplomaPreview, { getBlocks, posicoesPadrao } from './DiplomaPreview';

interface DiplomaEditorProps {
  modelo: any;
  onSave: (modelo: any) => void;
  onCancel: () => void;
}

const DiplomaEditor: React.FC<DiplomaEditorProps> = ({ modelo, onSave, onCancel }) => {
  // Inicializa o estado sincronizando/mapeando os blocos
  const [formData, setFormData] = useState<any>(() => {
    const data = modelo || {
      id: `new-${Date.now()}`,
      nome: '',
      tipoCurso: 'Cursos Livres',
      status: 'ativo',
      hasVerso: true,
      hasWatermark: false,
      watermarkText: '',
      layout: 'classic',
      usePhotoshopLayout: true, // Força layout interativo por padrão
      ocultarDesignPadrao: false,
      bgFrenteUrl: '',
      bgVersoUrl: '',
      corTexto: '#1e293b',
      corPrimaria: '#001a33',
      corSecundaria: '#e2e8f0',
    };
    
    // Injeta os blocos iniciais se não estiverem presentes
    if (!data.blocks) {
      data.blocks = getBlocks(data);
    }
    // Garante que o layout customizado está ativado
    data.usePhotoshopLayout = true;
    
    return data;
  });

  const [activeTab, setActiveTab] = useState<'visualizar' | 'frente' | 'verso'>('visualizar');
  const [previewMode, setPreviewMode] = useState<'frente' | 'verso' | 'ambos'>('ambos');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(50);
  const [isUploading, setIsUploading] = useState(false);

  // Sincroniza a exibição do preview de acordo com a aba de edição selecionada
  useEffect(() => {
    if (activeTab === 'frente') {
      setPreviewMode('frente');
    } else if (activeTab === 'verso') {
      setPreviewMode('verso');
    } else {
      setPreviewMode(formData.hasVerso ? 'ambos' : 'frente');
      setSelectedBlockId(null); // Deseleciona ao ir para visualização final
    }
  }, [activeTab, formData.hasVerso]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData({ ...formData, [name]: checked });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleUploadBg = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'bgFrenteUrl' | 'bgVersoUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const filePath = `templates/bg_diploma_${Date.now()}_${fieldName}.png`;

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
      alert('Upload da imagem concluído com sucesso!');
    } catch (err: any) {
      console.error('Erro ao fazer upload:', err);
      alert('Erro ao fazer upload da imagem: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedVar(text);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  const handleZoomOut = () => setZoomLevel(prev => Math.max(20, prev - 5));
  const handleZoomIn = () => setZoomLevel(prev => Math.min(150, prev + 5));

  // Adiciona / Torna Visível um bloco no canvas correspondente
  const handleAddBlock = (blockId: string) => {
    const updatedBlocks = formData.blocks.map((b: any) => {
      if (b.id === blockId) {
        // Se as posições estiverem zeradas ou não definidas, restaura o padrão
        const posX = b.x ?? posicoesPadrao[blockId]?.x ?? 10;
        const posY = b.y ?? posicoesPadrao[blockId]?.y ?? 10;
        return { 
          ...b, 
          visible: true,
          x: posX,
          y: posY
        };
      }
      return b;
    });

    setFormData({ ...formData, blocks: updatedBlocks });
    setSelectedBlockId(blockId);
  };

  // Atualiza propriedades de um bloco selecionado (conteúdo, fonte, largura, etc.)
  const handleUpdateBlockProp = (blockId: string, key: string, val: any) => {
    const updatedBlocks = formData.blocks.map((b: any) => {
      if (b.id === blockId) {
        return { ...b, [key]: val };
      }
      return b;
    });
    setFormData({ ...formData, blocks: updatedBlocks });
  };

  // Exclui/Oculta um bloco
  const handleRemoveBlock = (blockId: string) => {
    const updatedBlocks = formData.blocks.map((b: any) => {
      if (b.id === blockId) {
        return { ...b, visible: false };
      }
      return b;
    });
    setFormData({ ...formData, blocks: updatedBlocks });
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
  };

  // Sincroniza campos antigos/legados antes de salvar e chama onSave
  const handleFinalSave = () => {
    if (!formData.nome.trim()) {
      alert('Por favor, digite o nome do modelo.');
      return;
    }

    const blocks = formData.blocks;
    const findBlock = (id: string) => blocks.find((b: any) => b.id === id);

    // Mapeia de volta os campos antigos para garantir total compatibilidade em PDFs
    const selo = findBlock('selo');
    const titulo = findBlock('titulo');
    const subtitulo = findBlock('subtitulo');
    const texto = findBlock('texto');
    const cidadeData = findBlock('cidadeData');
    const assinatura1 = findBlock('assinatura1');
    const assinatura2 = findBlock('assinatura2');
    const qrcode = findBlock('qrcode');
    const historico = findBlock('historico');
    const registro = findBlock('registro');
    const versoQrcode = findBlock('versoQrcode');
    const carimbo = findBlock('carimbo');

    // Constrói objeto de posições legadas
    const posicoes: any = {};
    blocks.forEach((b: any) => {
      posicoes[b.id] = { x: b.x, y: b.y };
    });

    const finalData = {
      ...formData,
      posicoes,
      textoFrente: texto?.content || formData.textoFrente || '',
      textoVerso: historico?.content || formData.textoVerso || '',
      exibirLogo: selo ? selo.visible : true,
      exibirTitulo: titulo ? titulo.visible : true,
      exibirSubtitulo: subtitulo ? subtitulo.visible : true,
      exibirTexto: texto ? texto.visible : true,
      exibirCidadeData: cidadeData ? cidadeData.visible : true,
      exibirAssinatura1: assinatura1 ? signatureSync(assinatura1) : true,
      exibirAssinatura2: signatureSync(assinatura2),
      hasValidationQrCode: (qrcode?.visible || versoQrcode?.visible) ?? true,
      exibirVersoRegistro: registro ? registro.visible : true,
      exibirVersoCarimbo: carimbo ? carimbo.visible : true,
      
      // Valores de tamanhos legados
      tamanhoFonteTitulo: titulo?.fontSize || formData.tamanhoFonteTitulo || 45,
      tamanhoFonteSubtitulo: subtitulo?.fontSize || formData.tamanhoFonteSubtitulo || 14,
      tamanhoFonteTexto: texto?.fontSize || formData.tamanhoFonteTexto || 24,
      tamanhoFonteCidadeData: cidadeData?.fontSize || formData.tamanhoFonteCidadeData || 12,
      seloWidth: selo?.width || formData.seloWidth || 96,
      qrcodeWidth: qrcode?.width || formData.qrcodeWidth || 120,
      assinaturaWidth: assinatura1?.width || formData.assinaturaWidth || 256,
    };

    onSave(finalData);
  };

  const signatureSync = (block: any) => {
    return block ? block.visible : true;
  };

  // Localiza o bloco selecionado atualmente
  const selectedBlock = formData.blocks.find((b: any) => b.id === selectedBlockId);

  // Lista de blocos inativos (ocultos) na página atual
  const activePage = activeTab === 'verso' ? 'verso' : 'frente';
  const inactiveBlocks = formData.blocks.filter(
    (b: any) => b.page === activePage && !b.visible
  );

  const VariableToken = ({ token, label }: { token: string, label?: string }) => (
    <div 
      onClick={() => copyToClipboard(token)}
      className="bg-white px-2 py-1 rounded border border-purple-100 shadow-sm cursor-pointer hover:bg-purple-50 flex items-center justify-between gap-1.5 text-purple-700 transition-colors group"
      title="Clique para copiar"
    >
      <div className="flex flex-col">
        {label && <span className="text-[7px] text-purple-500 uppercase tracking-widest">{label}</span>}
        <span className="font-mono text-[9px]">{token}</span>
      </div>
      {copiedVar === token ? <Check size={10} className="text-emerald-500 shrink-0" /> : <Copy size={10} className="opacity-0 group-hover:opacity-100 shrink-0" />}
    </div>
  );

  return (
    <div className="bg-white rounded-[2.5rem] p-4 lg:p-8 border border-slate-200 shadow-sm animate-fadeIn flex flex-col min-h-[calc(100vh-10rem)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 pb-6 border-b border-slate-100 gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={onCancel}
            className="p-3 bg-slate-50 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-colors shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
              <LayoutTemplate size={24} className="text-purple-600" />
              {modelo ? 'Editar Modelo de Diploma' : 'Novo Modelo de Diploma'}
            </h3>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
              Personalize o layout de forma 100% interativa e flexível (Canva-style)
            </p>
          </div>
        </div>
        <button 
          onClick={handleFinalSave}
          className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 w-full sm:w-auto justify-center"
        >
          <Save size={16} /> Salvar Modelo
        </button>
      </div>

      {/* Main Content Area: Editor + Preview Side-by-Side */}
      <div className="flex flex-col xl:flex-row gap-8 flex-1">
        
        {/* Editor Config Panel (Left) */}
        <div className="w-full xl:w-[400px] flex flex-col gap-6 shrink-0">
          
          {/* Tabs */}
          <div className="p-1 rounded-xl flex gap-1 bg-slate-150 border border-slate-200">
             <button
                onClick={() => setActiveTab('visualizar')}
                className={`flex-1 py-2.5 px-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeTab === 'visualizar' ? 'bg-[#001a33] text-white shadow-md' : 'text-slate-600 hover:text-slate-800'}`}
             >
                <Eye size={14} /> Final
             </button>
             <button
                onClick={() => setActiveTab('frente')}
                className={`flex-1 py-2.5 px-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeTab === 'frente' ? 'bg-[#001a33] text-white shadow-md' : 'text-slate-600 hover:text-slate-800'}`}
             >
                <Layout size={14} /> Frente
             </button>
             <button
                onClick={() => setActiveTab('verso')}
                className={`flex-1 py-2.5 px-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeTab === 'verso' ? 'bg-[#001a33] text-white shadow-md' : 'text-slate-600 hover:text-slate-800'}`}
             >
                <Sliders size={14} /> Verso
             </button>
          </div>

          <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 space-y-6 max-h-[60vh] xl:max-h-[calc(100vh-25rem)]">
            
            {/* 1. VISUALIZAR FINAL TAB */}
            {activeTab === 'visualizar' && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome do Modelo *</label>
                  <input 
                    type="text" 
                    name="nome"
                    value={formData.nome}
                    onChange={handleChange}
                    placeholder="Ex: Diploma Padrão Téc. Enfermagem"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Tipo de Curso</label>
                  <select 
                    name="tipoCurso"
                    value={formData.tipoCurso}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="Educação a Distância (EAD)">Educação a Distância (EAD)</option>
                    <option value="Cursos Especialização">Cursos Especialização</option>
                    <option value="Cursos Técnicos">Cursos Técnicos</option>
                    <option value="Cursos Livres">Cursos Livres</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Status</label>
                  <select 
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>

                {/* Cores */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Cor Primária</label>
                    <input 
                      type="color" 
                      name="corPrimaria"
                      value={formData.corPrimaria || '#001a33'}
                      onChange={handleChange}
                      className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer p-1"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Cor Secundária</label>
                    <input 
                      type="color" 
                      name="corSecundaria"
                      value={formData.corSecundaria || '#e2e8f0'}
                      onChange={handleChange}
                      className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer p-1"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Cor do Texto</label>
                    <input 
                      type="color" 
                      name="corTexto"
                      value={formData.corTexto || '#1e293b'}
                      onChange={handleChange}
                      className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer p-1"
                    />
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <label className="flex items-center gap-3 cursor-pointer p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                    <input 
                      type="checkbox" 
                      name="hasVerso" 
                      checked={formData.hasVerso} 
                      onChange={handleChange}
                      className="w-5 h-5 text-purple-600 rounded" 
                    />
                    <div>
                      <span className="block text-sm font-bold text-[#001a33] uppercase">Ter página de verso</span>
                      <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Histórico acadêmico e registros.</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                    <input 
                      type="checkbox" 
                      name="ocultarDesignPadrao" 
                      checked={formData.ocultarDesignPadrao || false} 
                      onChange={handleChange}
                      className="w-5 h-5 text-purple-600 rounded" 
                    />
                    <div>
                      <span className="block text-sm font-bold text-[#001a33] uppercase">Ocultar Moldura/Borda Ornamental</span>
                      <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Oculta as linhas clássicas de moldura.</span>
                    </div>
                  </label>

                  {/* Watermark Section */}
                  <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                    <label className="flex items-center gap-3 cursor-pointer mb-3">
                      <input 
                        type="checkbox" 
                        name="hasWatermark" 
                        checked={formData.hasWatermark} 
                        onChange={handleChange}
                        className="w-5 h-5 text-purple-600 rounded" 
                      />
                      <div>
                        <span className="block text-sm font-bold text-[#001a33] uppercase">Marca d'água</span>
                        <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Texto ao fundo do diploma (Frente)</span>
                      </div>
                    </label>
                    
                    {formData.hasWatermark && (
                      <div className="pl-8">
                        <input 
                          type="text" 
                          name="watermarkText"
                          value={formData.watermarkText}
                          onChange={handleChange}
                          placeholder="EX: CERTIFICADO UNIVERSO"
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-purple-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 2. EDITAR FRENTE / VERSO TAB */}
            {(activeTab === 'frente' || activeTab === 'verso') && (
              <div className="space-y-6 animate-fadeIn">
                
                {/* Upload Imagem de Fundo correspondente */}
                <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Imagem de Fundo ({activeTab === 'frente' ? 'Frente' : 'Verso'})
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      name={activeTab === 'frente' ? 'bgFrenteUrl' : 'bgVersoUrl'}
                      placeholder="URL da imagem de fundo (.png / .jpg)"
                      value={(activeTab === 'frente' ? formData.bgFrenteUrl : formData.bgVersoUrl) || ''}
                      onChange={handleChange}
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-purple-500"
                    />
                    <label className="flex items-center justify-center p-3 bg-white hover:bg-purple-50 hover:text-purple-600 rounded-xl border border-slate-200 cursor-pointer transition-colors relative shadow-sm shrink-0">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => handleUploadBg(e, activeTab === 'frente' ? 'bgFrenteUrl' : 'bgVersoUrl')} 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        disabled={isUploading}
                      />
                      {isUploading ? <Loader2 size={18} className="animate-spin text-purple-600" /> : <Upload size={18} />}
                    </label>
                  </div>
                  <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1.5 leading-normal">
                    Recomendado: Proporção A4 horizontal (2970 x 2100 px). Pode ser exportado do Canva/Photoshop.
                  </p>
                </div>

                {/* ADICIONAR ELEMENTOS INATIVOS */}
                <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl">
                  <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5">
                    Adicionar Elementos à página
                  </span>
                  
                  {inactiveBlocks.length === 0 ? (
                    <p className="text-[10px] text-slate-500 font-semibold italic">Todos os elementos deste lado estão visíveis.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {inactiveBlocks.map((block: any) => (
                        <button
                          key={block.id}
                          onClick={() => handleAddBlock(block.id)}
                          className="flex items-center gap-1 bg-[#001a33] hover:bg-blue-900 text-white font-bold text-[9px] uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-colors shadow-sm"
                        >
                          <Plus size={10} />
                          {block.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* CONFIGURAÇÃO DO ELEMENTO SELECIONADO */}
                <div className="bg-purple-50/10 border border-purple-100 rounded-3xl p-5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-purple-100/50 pb-3">
                    <span className="p-1.5 bg-purple-100 text-purple-700 rounded-lg"><Sliders size={14} /></span>
                    <span className="text-xs font-black text-[#001a33] uppercase tracking-wider">
                      Propriedades do Elemento
                    </span>
                  </div>

                  {selectedBlock ? (
                    <div className="space-y-4 animate-fadeIn">
                      <div className="flex justify-between items-center bg-purple-50 border border-purple-100 rounded-lg px-3 py-1.5 text-xs text-purple-800 font-black uppercase tracking-wider">
                        <span>{selectedBlock.label}</span>
                        <button
                          onClick={() => handleRemoveBlock(selectedBlock.id)}
                          className="text-red-500 hover:text-red-700 flex items-center gap-0.5 text-[9px] uppercase font-bold"
                          title="Remover do Documento"
                        >
                          <Trash2 size={12} /> Remover
                        </button>
                      </div>

                      {/* Editor de Texto do Bloco */}
                      {selectedBlock.type === 'text' && (
                        <div className="space-y-2">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Conteúdo Textual
                          </label>
                          <textarea
                            rows={selectedBlock.id === 'texto' ? 6 : 3}
                            value={selectedBlock.content || ''}
                            onChange={(e) => handleUpdateBlockProp(selectedBlock.id, 'content', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:border-purple-500 outline-none transition-all resize-y custom-scrollbar"
                          />
                        </div>
                      )}

                      {/* Editor de Texto do Histórico */}
                      {selectedBlock.type === 'table' && (
                        <div className="space-y-2">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Conteúdo do Histórico / Grade
                          </label>
                          <textarea
                            rows={6}
                            value={selectedBlock.content || ''}
                            onChange={(e) => handleUpdateBlockProp(selectedBlock.id, 'content', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-medium text-slate-800 focus:border-purple-500 outline-none transition-all resize-y custom-scrollbar"
                          />
                        </div>
                      )}

                      {/* Editor de Fonte (Slidres) */}
                      {(selectedBlock.type === 'text') && (
                        <div>
                          <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                            <span>Tamanho da Fonte</span>
                            <span className="font-mono">{selectedBlock.fontSize || 14}px</span>
                          </label>
                          <input 
                            type="range" 
                            min={selectedBlock.id === 'titulo' ? "20" : "8"} 
                            max={selectedBlock.id === 'titulo' ? "90" : "40"} 
                            step="1" 
                            value={selectedBlock.fontSize || 14} 
                            onChange={(e) => handleUpdateBlockProp(selectedBlock.id, 'fontSize', parseInt(e.target.value))} 
                            className="w-full accent-purple-600" 
                          />
                        </div>
                      )}

                      {/* Editor de Larguras (Selo, QR, Assinatura) */}
                      {(selectedBlock.type === 'logo' || selectedBlock.type === 'qrcode' || selectedBlock.type === 'signature') && (
                        <div>
                          <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                            <span>Largura do Elemento</span>
                            <span className="font-mono">{selectedBlock.width || 120}px</span>
                          </label>
                          <input 
                            type="range" 
                            min="40" 
                            max="450" 
                            step="5" 
                            value={selectedBlock.width || 120} 
                            onChange={(e) => handleUpdateBlockProp(selectedBlock.id, 'width', parseInt(e.target.value))} 
                            className="w-full accent-purple-600" 
                          />
                        </div>
                      )}

                      {/* Editor de Cargo de Assinatura */}
                      {selectedBlock.type === 'signature' && (
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Cargo / Identificação da Assinatura
                          </label>
                          <input
                            type="text"
                            value={selectedBlock.title || ''}
                            onChange={(e) => handleUpdateBlockProp(selectedBlock.id, 'title', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-purple-500"
                            placeholder="Ex: Diretor Geral"
                          />
                        </div>
                      )}

                      {/* Variáveis e Token Helper para Textos */}
                      {selectedBlock.type === 'text' && (
                        <div className="bg-purple-50/50 p-3 rounded-xl border border-purple-100/50 space-y-2">
                          <span className="block text-[8px] font-black text-purple-700 uppercase tracking-widest">Variáveis Suportadas</span>
                          <div className="grid grid-cols-1 gap-1 text-[8px]">
                            <VariableToken token="{{nome_aluno}}" label="Nome do Aluno" />
                            <VariableToken token="{{cpf}}" label="CPF" />
                            <VariableToken token="{{curso_nome}}" label="Curso" />
                            <VariableToken token="{{carga_horaria}}" label="Carga" />
                            <VariableToken token="{{data_conclusao}}" label="Data" />
                          </div>
                        </div>
                      )}

                      {/* Variáveis Helper para Verso */}
                      {selectedBlock.type === 'table' && (
                        <div className="bg-purple-50/50 p-3 rounded-xl border border-purple-100/50 space-y-2">
                          <span className="block text-[8px] font-black text-purple-700 uppercase tracking-widest">Blocos do Verso</span>
                          <div className="grid grid-cols-1 gap-1 text-[8px]">
                            <VariableToken token="{{grade_curricular}}" label="Estrutura de Disciplinas" />
                            <VariableToken token="{{livro_registro}}" label="Dados de Registro Geral" />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-400 text-xs font-semibold italic leading-relaxed">
                      Clique em qualquer elemento do diploma no painel à direita para selecioná-lo e abrir suas configurações individuais.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Live Preview Area (Right) */}
        <div className="flex-1 bg-slate-200 rounded-2xl overflow-hidden flex flex-col relative border border-slate-300 min-h-[400px]">
          <div className="bg-slate-800 text-white p-3 flex justify-between items-center text-xs font-bold uppercase shadow-md z-10 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="tracking-widest">Visualização / Tela de Trabalho</span>
              {(activeTab === 'frente' || activeTab === 'verso') && (
                <span className="bg-purple-650 text-white font-black text-[8px] px-2 py-0.5 rounded tracking-wide animate-pulse">ARRASAR PARA MOVER</span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-700/50 p-1 rounded-lg">
                <button onClick={handleZoomOut} className="p-1 text-slate-300 hover:text-white hover:bg-slate-600 rounded">
                  <ZoomOut size={14} />
                </button>
                <span className="text-[10px] w-8 text-center">{zoomLevel}%</span>
                <button onClick={handleZoomIn} className="p-1 text-slate-300 hover:text-white hover:bg-slate-600 rounded">
                  <ZoomIn size={14} />
                </button>
              </div>
              
              <div className="flex items-center gap-1 bg-slate-700 p-1 rounded-lg">
                <button 
                  onClick={() => setPreviewMode('frente')}
                  disabled={activeTab === 'verso'}
                  className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'frente' ? 'bg-purple-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-600 disabled:opacity-30'}`}
                >
                  FRENTE
                </button>
                {formData.hasVerso && (
                  <button 
                    onClick={() => setPreviewMode('verso')}
                    disabled={activeTab === 'frente'}
                    className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'verso' ? 'bg-purple-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-600 disabled:opacity-30'}`}
                  >
                    VERSO
                  </button>
                )}
                {formData.hasVerso && activeTab === 'visualizar' && (
                  <button 
                    onClick={() => setPreviewMode('ambos')}
                    className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'ambos' ? 'bg-purple-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-600'}`}
                  >
                    AMBOS
                  </button>
                )}
              </div>
            </div>
          </div>
          
          <div 
            onClick={() => setSelectedBlockId(null)}
            className="flex-1 overflow-auto custom-scrollbar p-8 bg-slate-300 flex flex-col items-center gap-8 min-h-0 cursor-default"
          >
             {(previewMode === 'frente' || previewMode === 'ambos') && (
               <DiplomaPreview 
                 formData={formData} 
                 page="frente" 
                 zoomLevel={zoomLevel} 
                 isEditable={activeTab === 'frente'}
                 selectedBlockId={selectedBlockId}
                 onSelectBlock={setSelectedBlockId}
                 onChangeBlocks={(updated) => setFormData({ ...formData, blocks: updated })}
               />
             )}
             {(previewMode === 'verso' || previewMode === 'ambos') && formData.hasVerso && (
               <DiplomaPreview 
                 formData={formData} 
                 page="verso" 
                 zoomLevel={zoomLevel} 
                 isEditable={activeTab === 'verso'}
                 selectedBlockId={selectedBlockId}
                 onSelectBlock={setSelectedBlockId}
                 onChangeBlocks={(updated) => setFormData({ ...formData, blocks: updated })}
               />
             )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default DiplomaEditor;
