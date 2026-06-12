import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, FileText, Image as ImageIcon, LayoutTemplate, Copy, Check, ZoomOut, ZoomIn } from 'lucide-react';
import CarteirinhaPreview from './CarteirinhaPreview';

interface CarteirinhaEditorProps {
  modelo: any;
  onSave: (modelo: any) => void;
  onCancel: () => void;
}

const CarteirinhaEditor: React.FC<CarteirinhaEditorProps> = ({ modelo, onSave, onCancel }) => {
  const [formData, setFormData] = useState(modelo || {
    id: `new-${Date.now()}`,
    nome: '',
    tipoCurso: 'Cursos Técnicos',
    status: 'ativo',
    hasVerso: true,
    corPrimaria: '#001a33',
    corSecundaria: '#e2e8f0',
    textoFrente: 'CARTEIRA DE ESTUDANTE',
    textoVerso: 'Este documento é pessoal e intransferível.\\nVálido em todo o território nacional segundo a Lei nº 12.933/2013.\\n\\nEm caso de perda, favor contatar a secretaria.',
  });

  const [activeTab, setActiveTab] = useState<'config' | 'frente' | 'verso'>('config');
  const [previewMode, setPreviewMode] = useState<'frente' | 'verso' | 'ambos'>('ambos');
  const [zoomLevel, setZoomLevel] = useState(100);

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
      setFormData({ ...formData, [name]: value });
    }
  };

  const handeZoomOut = () => setZoomLevel(prev => Math.max(50, prev - 10));
  const handeZoomIn = () => setZoomLevel(prev => Math.min(200, prev + 10));

  return (
    <div className="bg-white rounded-[2.5rem] p-4 lg:p-8 border border-slate-200 shadow-sm animate-fadeIn flex flex-col min-h-[calc(100vh-10rem)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 pb-6 border-b border-slate-100 gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={onCancel}
            className="p-3 bg-slate-50 text-slate-400 hover:text-pink-600 hover:bg-pink-50 rounded-xl transition-colors shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
              <LayoutTemplate size={24} className="text-pink-600" />
              {modelo ? 'Editar Modelo de Carteirinha' : 'Novo Modelo de Carteirinha'}
            </h3>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">
              Personalize o layout e as cores da CIE
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
                className={`flex-1 py-2 px-4 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === 'config' ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
             >
                Config
             </button>
             <button
                onClick={() => setActiveTab('frente')}
                className={`flex-1 py-2 px-4 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === 'frente' ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
             >
                Frente
             </button>
             <button
                onClick={() => setActiveTab('verso')}
                className={`flex-1 py-2 px-4 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === 'verso' ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
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
                    placeholder="Ex: Carteirinha Ensino Técnico"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-pink-500 focus:bg-white transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Tipo de Curso</label>
                  <select 
                    name="tipoCurso"
                    value={formData.tipoCurso}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-pink-500 focus:bg-white transition-all cursor-pointer appearance-none"
                  >
                    <option value="Cursos Técnicos">Cursos Técnicos</option>
                    <option value="Ensino Superior">Ensino Superior (Graduação/Pós)</option>
                    <option value="Educação a Distância (EAD)">Educação a Distância (EAD)</option>
                    <option value="Cursos Livres">Cursos Livres / Extensão (Uso Interno)</option>
                  </select>
                  {formData.tipoCurso === 'Cursos Livres' && (
                    <p className="text-[10px] text-amber-600 font-bold mt-2 bg-amber-50 p-2 rounded-lg border border-amber-100">
                      Atenção: A Lei 12.933/2013 (Lei da Meia-Entrada) não abrange Cursos Livres. Esta carteirinha geralmente tem validade apenas para uso interno (biblioteca, catracas).
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Status</label>
                  <select 
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-pink-500 focus:bg-white transition-all cursor-pointer appearance-none"
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
                    className="w-5 h-5 text-pink-600 rounded" 
                  />
                  <div>
                    <span className="block text-sm font-bold text-[#001a33] uppercase">Ter verso impresso</span>
                    <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Informações legais, QR Code e regras.</span>
                  </div>
                </label>
              </div>
            )}

            {activeTab === 'frente' && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Título do Documento (Cabeçalho)</label>
                  <input 
                    type="text" 
                    name="textoFrente"
                    value={formData.textoFrente}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-pink-500 focus:bg-white transition-all"
                  />
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-600 font-bold leading-relaxed uppercase tracking-widest">
                    A frente da carteirinha é gerada automaticamente pelo sistema com os dados do aluno (Foto, Nome, CPF, RG, Nascimento, Curso, Matrícula, Validade).
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'verso' && formData.hasVerso && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Informações Adicionais (Regras/Leis)</label>
                  <textarea 
                    name="textoVerso"
                    value={formData.textoVerso}
                    onChange={handleChange}
                    className="w-full min-h-[200px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-pink-500 focus:bg-white transition-all resize-y custom-scrollbar"
                  ></textarea>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-2 px-1">
                    Este texto aparecerá no rodapé do verso da carteirinha.
                  </p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-600 font-bold leading-relaxed uppercase tracking-widest">
                    O QR Code de validação será sempre impresso no verso automaticamente pelo sistema.
                  </p>
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
            <span className="tracking-widest hidden sm:inline">Visualização Prévia (CR80)</span>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-700/50 p-1 rounded-lg">
                <button onClick={handeZoomOut} className="p-1 text-slate-300 hover:text-white hover:bg-slate-600 rounded">
                  <ZoomOut size={14} />
                </button>
                <span className="text-[10px] w-8 text-center">{zoomLevel}%</span>
                <button onClick={handeZoomIn} className="p-1 text-slate-300 hover:text-white hover:bg-slate-600 rounded">
                  <ZoomIn size={14} />
                </button>
              </div>
              
              <div className="flex items-center gap-1 bg-slate-700 p-1 rounded-lg">
                <button 
                  onClick={() => setPreviewMode('frente')}
                  className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'frente' ? 'bg-pink-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-600'}`}
                >
                  FRENTE
                </button>
                {formData.hasVerso && (
                  <button 
                    onClick={() => setPreviewMode('verso')}
                    className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'verso' ? 'bg-pink-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-600'}`}
                  >
                    VERSO
                  </button>
                )}
                {formData.hasVerso && (
                  <button 
                    onClick={() => setPreviewMode('ambos')}
                    className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'ambos' ? 'bg-pink-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-600'}`}
                  >
                    AMBOS
                  </button>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto custom-scrollbar p-8 bg-slate-300 flex flex-col items-center justify-center gap-8 min-h-0">
             {(previewMode === 'frente' || previewMode === 'ambos') && (
               <CarteirinhaPreview formData={formData} page="frente" zoomLevel={zoomLevel} />
             )}
             {(previewMode === 'verso' || previewMode === 'ambos') && formData.hasVerso && (
               <CarteirinhaPreview formData={formData} page="verso" zoomLevel={zoomLevel} />
             )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default CarteirinhaEditor;
