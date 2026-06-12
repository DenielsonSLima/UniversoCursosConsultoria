import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, FileText, Image as ImageIcon, LayoutTemplate, Copy, Check, ZoomOut, ZoomIn } from 'lucide-react';
import DiplomaPreview from './DiplomaPreview';

interface DiplomaEditorProps {
  modelo: any;
  onSave: (modelo: any) => void;
  onCancel: () => void;
}

const DiplomaEditor: React.FC<DiplomaEditorProps> = ({ modelo, onSave, onCancel }) => {
  const [formData, setFormData] = useState(modelo || {
    id: `new-${Date.now()}`,
    nome: '',
    tipoCurso: 'Cursos Livres',
    status: 'ativo',
    hasVerso: true,
    hasWatermark: false,
    watermarkText: '',
    hasValidationQrCode: true,
    textoFrente: 'Certificamos que {{nome_aluno}} concluiu o curso de {{curso_nome}} com carga horária de {{carga_horaria}} horas.',
    textoVerso: 'Conteúdo programático e histórico escolar...',
    layout: 'classic',
  });

  const [activeTab, setActiveTab] = useState<'config' | 'frente' | 'verso'>('config');
  const [previewMode, setPreviewMode] = useState<'frente' | 'verso' | 'ambos'>('ambos');
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(60);

  // Sync preview with active tab by default
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedVar(text);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  const handeZoomOut = () => setZoomLevel(prev => Math.max(30, prev - 10));
  const handeZoomIn = () => setZoomLevel(prev => Math.min(150, prev + 10));

  const VariableToken = ({ token, label }: { token: string, label?: string }) => (
    <div 
      onClick={() => copyToClipboard(token)}
      className="bg-white px-2 py-1.5 rounded shadow-sm cursor-pointer hover:bg-blue-100 flex items-center justify-between gap-2 text-blue-700 transition-colors group border border-blue-50"
      title="Clique para copiar"
    >
      <div className="flex flex-col">
        {label && <span className="text-[8px] text-blue-500 uppercase tracking-widest">{label}</span>}
        <span className="font-mono text-[10px]">{token}</span>
      </div>
      {copiedVar === token ? <Check size={12} className="text-emerald-500 shrink-0" /> : <Copy size={12} className="opacity-0 group-hover:opacity-100 shrink-0" />}
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
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">
              Personalize o layout e as variáveis
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

      {/* Main Content Area: Editor + Preview Side-by-Side */}
      <div className="flex flex-col xl:flex-row gap-8 flex-1">
        
        {/* Editor Config Panel (Left) */}
        <div className="w-full xl:w-[400px] flex flex-col gap-6">
          
          {/* Tabs */}
          <div className="flexbg-slate-100/50 p-1 rounded-xl flex gap-1 bg-slate-100">
             <button
                onClick={() => setActiveTab('config')}
                className={`flex-1 py-2 px-4 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === 'config' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
             >
                Config
             </button>
             <button
                onClick={() => setActiveTab('frente')}
                className={`flex-1 py-2 px-4 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === 'frente' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
             >
                Frente
             </button>
             <button
                onClick={() => setActiveTab('verso')}
                className={`flex-1 py-2 px-4 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === 'verso' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
             >
                Verso
             </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
            
            {/* CONFIG TAB */}
            {activeTab === 'config' && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome do Modelo <span className="text-red-500">*</span></label>
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all cursor-pointer appearance-none"
                  >
                    <option value="Educação a Distância (EAD)">Educação a Distância (EAD)</option>
                    <option value="Ensino Superior">Ensino Superior (Graduação/Pós)</option>
                    <option value="Cursos Técnicos">Cursos Técnicos</option>
                    <option value="Cursos Livres">Cursos Livres / Extensão</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Status</label>
                  <select 
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all cursor-pointer appearance-none"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>

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
                      <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Grade curricular, assinaturas extra.</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                    <input 
                      type="checkbox" 
                      name="hasValidationQrCode" 
                      checked={formData.hasValidationQrCode} 
                      onChange={handleChange}
                      className="w-5 h-5 text-purple-600 rounded" 
                    />
                    <div>
                      <span className="block text-sm font-bold text-[#001a33] uppercase">QR Code / ID de Validação</span>
                      <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Adiciona QR Code no verso para validação pública.</span>
                    </div>
                  </label>

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
                          placeholder="EX: DOCUMENTO OFICIAL"
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-purple-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* FRENTE TAB */}
            {activeTab === 'frente' && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center justify-between">
                    Editor FRENTE
                    {copiedVar && <span className="text-emerald-500 text-[9px]">Copiado!</span>}
                  </label>
                  <textarea 
                    name="textoFrente"
                    value={formData.textoFrente}
                    onChange={handleChange}
                    className="w-full min-h-[300px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-purple-500 focus:bg-white transition-all resize-y custom-scrollbar"
                  ></textarea>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                  <h5 className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-2">Variáveis Disponíveis para a Frente</h5>
                  <p className="text-[10px] text-blue-600 mb-3 leading-relaxed">Clique em qualquer variável abaixo para copiá-la e cole no editor acima. O sistema vai substituir automaticamente na hora de gerar o documento do aluno.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] font-mono font-bold text-blue-600">
                    <VariableToken token="{{nome_aluno}}" label="Nome Completo" />
                    <VariableToken token="{{cpf}}" label="CPF Formatado" />
                    <VariableToken token="{{curso_nome}}" label="Nome do Curso" />
                    <VariableToken token="{{carga_horaria}}" label="Carga em Horas" />
                    <VariableToken token="{{data_conclusao}}" label="Data Formatada" />
                  </div>
                </div>
              </div>
            )}

            {/* VERSO TAB */}
            {activeTab === 'verso' && formData.hasVerso && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center justify-between">
                    Editor VERSO (Grade e Histórico)
                    {copiedVar && <span className="text-emerald-500 text-[9px]">Copiado!</span>}
                  </label>
                  <textarea 
                    name="textoVerso"
                    value={formData.textoVerso}
                    onChange={handleChange}
                    className="w-full min-h-[300px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-purple-500 focus:bg-white transition-all resize-y custom-scrollbar"
                  ></textarea>
                </div>
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                  <h5 className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-2">Blocos Especiais para o Verso</h5>
                  <p className="text-[10px] text-blue-600 mb-3 leading-relaxed">Para injetar a lista de notas com disciplinas ou o livro de registro do aluno, utilize as variáveis estruturais abaixo:</p>
                  <div className="grid grid-cols-1 gap-2 text-[10px] font-mono font-bold text-blue-600">
                    <VariableToken token="{{grade_curricular}}" label="Lista de Disciplinas e Notas" />
                    <VariableToken token="{{livro_registro}}" label="Dados do Livro de Registro" />
                  </div>
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
            <span className="tracking-widest">Visualização Prévia</span>
            
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
                  className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'frente' ? 'bg-purple-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-600'}`}
                >
                  FRENTE
                </button>
                {formData.hasVerso && (
                  <button 
                    onClick={() => setPreviewMode('verso')}
                    className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'verso' ? 'bg-purple-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-600'}`}
                  >
                    VERSO
                  </button>
                )}
                {formData.hasVerso && (
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
          
          <div className="flex-1 overflow-auto custom-scrollbar p-8 bg-slate-300 flex flex-col items-center gap-8">
             {(previewMode === 'frente' || previewMode === 'ambos') && (
               <DiplomaPreview formData={formData} page="frente" zoomLevel={zoomLevel} />
             )}
             {(previewMode === 'verso' || previewMode === 'ambos') && formData.hasVerso && (
               <DiplomaPreview formData={formData} page="verso" zoomLevel={zoomLevel} />
             )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default DiplomaEditor;
