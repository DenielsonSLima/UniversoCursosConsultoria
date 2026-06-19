import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, LayoutTemplate, ZoomOut, ZoomIn, Upload, Loader2 } from 'lucide-react';
import { supabase } from '../../../../../../lib/supabase';
import CrachaPreview from './CrachaPreview';

interface CrachaEditorProps {
  modelo: any;
  onSave: (modelo: any) => void;
  onCancel: () => void;
}

const CrachaEditor: React.FC<CrachaEditorProps> = ({ modelo, onSave, onCancel }) => {
  const [formData, setFormData] = useState(modelo || {
    id: `new-${Date.now()}`,
    nome: '',
    cargoPadrao: 'DOCENTE / PROFESSOR',
    status: 'ativo',
    startNumber: 1000,
    hasVerso: true,
    corPrimaria: '#0f172a', // Slate 900
    corSecundaria: '#38bdf8', // Sky 400
    textoFrente: 'DOCENTE',
    textoVerso: 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal, intransferível e obrigatório nas dependências da instituição.\n2. Mantenha-o sempre visível em local adequado com cordão de segurança.\n3. Em caso de perda, roubo ou extravio, comunique imediatamente o setor administrativo.\n4. Se encontrado, favor devolver à Universo Cursos e Consultoria.',
    bgFrenteUrl: '',
    bgVersoUrl: '',
    ocultarDesignPadrao: false,
    corTexto: '#1e293b',
    tamanhoFonteNome: 8.5,
    tamanhoFonteDados: 6.8,
    fotoWidth: 45.0,
    fotoHeight: 28.5
  });

  const [activeTab, setActiveTab] = useState<'config' | 'frente' | 'verso'>('config');
  const [previewMode, setPreviewMode] = useState<'frente' | 'verso' | 'ambos'>('ambos');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (activeTab === 'frente') setPreviewMode('frente');
    else if (activeTab === 'verso' && formData.hasVerso) setPreviewMode('verso');
    else setPreviewMode(formData.hasVerso ? 'ambos' : 'frente');
  }, [activeTab, formData.hasVerso]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData({ ...formData, [name]: checked });
    } else {
      setFormData({ ...formData, [name]: name === 'startNumber' ? parseInt(value) || 0 : value });
    }
  };

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
      alert('Upload da imagem do crachá concluído com sucesso!');
    } catch (err: any) {
      console.error('Erro ao fazer upload:', err);
      alert('Erro ao fazer upload da imagem: ' + err.message);
    } finally {
      setIsUploading(false);
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
              {modelo ? 'Editar Modelo de Crachá' : 'Novo Modelo de Crachá'}
            </h3>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">
              Personalize o layout e as cores do crachá corporativo
            </p>
          </div>
        </div>
        <button 
          onClick={() => onSave(formData)}
          className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 w-full sm:w-auto justify-center"
        >
          <Save size={16} /> {modelo ? 'Salvar Alterações' : 'Criar Modelo'}
        </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-8 flex-1">
        
        {/* Editor Config Panel (Left) */}
        <div className="w-full xl:w-[400px] flex flex-col gap-6">
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

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
            
            {activeTab === 'config' && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome do Modelo <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    name="nome"
                    value={formData.nome}
                    onChange={handleChange}
                    placeholder="Ex: Crachá Setor Pedagógico"
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
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1 leading-normal">Os crachás emitidos iniciarão a contagem sequencial a partir deste número.</p>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Cargo Padrão / Setor</label>
                  <input 
                    type="text" 
                    name="cargoPadrao"
                    value={formData.cargoPadrao}
                    onChange={handleChange}
                    placeholder="Ex: DOCENTE / PROFESSOR"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Status</label>
                  <select 
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer appearance-none"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
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
                    <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Normas internas de uso e devolução.</span>
                  </div>
                </label>
              </div>
            )}

            {activeTab === 'frente' && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Etiqueta de Classificação (Rodapé Frente)</label>
                  <input 
                    type="text" 
                    name="textoFrente"
                    value={formData.textoFrente}
                    placeholder="Ex: COLABORADOR"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>

                {/* Upload Imagem de Fundo Crachá (Frente) */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Imagem de Fundo (Frente) — Photoshop</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      name="bgFrenteUrl"
                      placeholder="URL da imagem de fundo (.png / .jpg)"
                      value={formData.bgFrenteUrl || ''}
                      onChange={handleChange}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                    <label className="flex items-center justify-center p-3 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 rounded-xl border border-slate-200 cursor-pointer transition-colors relative">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => handleUploadBg(e, 'bgFrenteUrl')} 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        disabled={isUploading}
                      />
                      {isUploading ? <Loader2 size={18} className="animate-spin text-blue-600" /> : <Upload size={18} />}
                    </label>
                  </div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Recomendado: 540 x 856 pixels (formato vertical .png)</p>
                </div>

                {/* Opções de Layout do Photoshop se tiver imagem de fundo crachá */}
                {!!formData.bgFrenteUrl && (
                  <div className="space-y-4 p-4 border border-blue-100 rounded-xl bg-blue-50/20 animate-fadeIn">
                    <label className="flex items-center gap-3 cursor-pointer hover:bg-slate-50/50 p-1 rounded transition-colors">
                      <input 
                        type="checkbox" 
                        name="usePhotoshopLayout" 
                        checked={formData.usePhotoshopLayout || false} 
                        onChange={handleChange}
                        className="w-5 h-5 text-blue-600 rounded" 
                      />
                      <div>
                        <span className="block text-sm font-bold text-[#001a33] uppercase">Ativar Layout Photoshop</span>
                        <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Alinha textos e fotos de forma absoluta permitindo o arrasto livre.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer hover:bg-slate-50/50 p-1 rounded transition-colors">
                      <input 
                        type="checkbox" 
                        name="ocultarDesignPadrao" 
                        checked={formData.ocultarDesignPadrao || false} 
                        onChange={handleChange}
                        className="w-5 h-5 text-blue-600 rounded" 
                      />
                      <div>
                        <span className="block text-sm font-bold text-[#001a33] uppercase">Usar Apenas Fundo Customizado</span>
                        <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Oculta as faixas e fundos padrão para exibir apenas o design do Photoshop.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer hover:bg-slate-50/50 p-1 rounded transition-colors">
                      <input 
                        type="checkbox" 
                        name="exibirRotulos" 
                        checked={formData.exibirRotulos !== false} 
                        onChange={handleChange}
                        className="w-5 h-5 text-blue-600 rounded" 
                      />
                      <div>
                        <span className="block text-sm font-bold text-[#001a33] uppercase">Exibir Rótulos nos Dados</span>
                        <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Mostra legendas (ex: "MATRÍCULA:") antes dos valores dos campos.</span>
                      </div>
                    </label>

                    {/* Controles de Estilo Avançados */}
                    {!!formData.usePhotoshopLayout && (
                      <div className="mt-4 pt-4 border-t border-blue-100 space-y-4 animate-fadeIn">
                        <h4 className="text-[10px] font-black text-[#001a33] uppercase tracking-widest">Estilização do Layout</h4>
                        
                        <div>
                          <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                            <span>Cor das Fontes</span>
                            <span className="font-mono">{formData.corTexto || '#1e293b'}</span>
                          </label>
                          <input 
                            type="color" 
                            name="corTexto"
                            value={formData.corTexto || '#1e293b'}
                            onChange={handleChange}
                            className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer p-0.5"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                              <span>Fonte Nome</span>
                              <span className="font-mono">{(formData.tamanhoFonteNome || 8.5)}px</span>
                            </label>
                            <input 
                              type="range" 
                              name="tamanhoFonteNome"
                              min="6" 
                              max="16" 
                              step="0.5"
                              value={formData.tamanhoFonteNome || 8.5}
                              onChange={(e) => setFormData({ ...formData, tamanhoFonteNome: parseFloat(e.target.value) })}
                              className="w-full h-1 bg-slate-250 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                          </div>
                          <div>
                            <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                              <span>Fonte Dados</span>
                              <span className="font-mono">{(formData.tamanhoFonteDados || 6.8)}px</span>
                            </label>
                            <input 
                              type="range" 
                              name="tamanhoFonteDados"
                              min="5" 
                              max="14" 
                              step="0.5"
                              value={formData.tamanhoFonteDados || 6.8}
                              onChange={(e) => setFormData({ ...formData, tamanhoFonteDados: parseFloat(e.target.value) })}
                              className="w-full h-1 bg-slate-250 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                              <span>Largura Foto</span>
                              <span className="font-mono">{(formData.fotoWidth || 45.0)}%</span>
                            </label>
                            <input 
                              type="range" 
                              name="fotoWidth"
                              min="20" 
                              max="70" 
                              step="0.5"
                              value={formData.fotoWidth || 45.0}
                              onChange={(e) => setFormData({ ...formData, fotoWidth: parseFloat(e.target.value) })}
                              className="w-full h-1 bg-slate-250 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                          </div>
                          <div>
                            <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                              <span>Altura Foto</span>
                              <span className="font-mono">{(formData.fotoHeight || 28.5)}%</span>
                            </label>
                            <input 
                              type="range" 
                              name="fotoHeight"
                              min="15" 
                              max="45" 
                              step="0.5"
                              value={formData.fotoHeight || 28.5}
                              onChange={(e) => setFormData({ ...formData, fotoHeight: parseFloat(e.target.value) })}
                              className="w-full h-1 bg-slate-250 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-600 font-bold leading-relaxed uppercase tracking-widest">
                    Os dados do funcionário (Foto, Nome, Cargo, Matrícula, CPF, Polo) flutuarão por cima do fundo vertical.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'verso' && formData.hasVerso && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Normas de Uso e Contato</label>
                  <textarea 
                    name="textoVerso"
                    value={formData.textoVerso}
                    onChange={handleChange}
                    className="w-full min-h-[150px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all resize-y custom-scrollbar"
                  ></textarea>
                </div>

                {/* Upload Imagem de Fundo Crachá (Verso) */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Imagem de Fundo (Verso) — Photoshop</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      name="bgVersoUrl"
                      placeholder="URL da imagem de fundo (.png / .jpg)"
                      value={formData.bgVersoUrl || ''}
                      onChange={handleChange}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                    <label className="flex items-center justify-center p-3 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 rounded-xl border border-slate-200 cursor-pointer transition-colors relative">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => handleUploadBg(e, 'bgVersoUrl')} 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        disabled={isUploading}
                      />
                      {isUploading ? <Loader2 size={18} className="animate-spin text-blue-600" /> : <Upload size={18} />}
                    </label>
                  </div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Recomendado: 540 x 856 pixels (.png)</p>
                </div>
              </div>
            )}
            
            {activeTab === 'verso' && !formData.hasVerso && (
               <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                 <p className="text-xs font-bold uppercase tracking-widest">O verso está desabilitado na aba de configuração.</p>
               </div>
            )}
          </div>
        </div>

        {/* Live Preview Area (Right) */}
        <div className="flex-1 bg-slate-200 rounded-2xl overflow-hidden flex flex-col relative border border-slate-300">
          <div className="bg-slate-800 text-white p-3 flex justify-between items-center text-xs font-bold uppercase shadow-md z-10 shrink-0">
            <span className="tracking-widest hidden sm:inline">Visualização Prévia do Crachá (CR80 Vertical)</span>
            
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
                  className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'frente' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-600'}`}
                >
                  FRENTE
                </button>
                {formData.hasVerso && (
                  <button 
                    onClick={() => setPreviewMode('verso')}
                    className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'verso' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-600'}`}
                  >
                    VERSO
                  </button>
                )}
                {formData.hasVerso && (
                  <button 
                    onClick={() => setPreviewMode('ambos')}
                    className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'ambos' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-600'}`}
                  >
                    AMBOS
                  </button>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto custom-scrollbar p-8 bg-slate-300 flex flex-col sm:flex-row items-center justify-center gap-8 min-h-0">
             {(previewMode === 'frente' || previewMode === 'ambos') && (
               <CrachaPreview 
                 formData={formData} 
                 page="frente" 
                 zoomLevel={zoomLevel} 
                 isEditable={true}
                 onChangePositions={(positions) => setFormData({ ...formData, posicoes: positions })}
               />
             )}
             {(previewMode === 'verso' || previewMode === 'ambos') && formData.hasVerso && (
               <CrachaPreview 
                 formData={formData} 
                 page="verso" 
                 zoomLevel={zoomLevel} 
               />
             )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default CrachaEditor;
