import React, { useEffect, useState } from 'react';
import { 
  Upload, 
  Loader2, 
  Plus, 
  QrCode,
  User,
  Type,
  Image as ImageIcon
} from 'lucide-react';
import { supabase } from '../../../../../../lib/supabase';
import { assinaturasService } from '../../../../configuracoes/assinaturas/assinaturas.service';
import CrachaFieldEditorPanel from './CrachaFieldEditorPanel';
import CrachaEditorHeader from './CrachaEditorHeader';
import CrachaEditorToast, { CrachaEditorToastState } from './CrachaEditorToast';
import CrachaPreviewWorkspace from './CrachaPreviewWorkspace';
import { getCrachaUploadExtension, initializeCrachaModel } from './cracha-editor.model';

interface CrachaEditorProps {
  modelo: any;
  onSave: (modelo: any) => void;
  onCancel: () => void;
}

const CrachaEditor: React.FC<CrachaEditorProps> = ({ modelo, onSave, onCancel }) => {
  const [formData, setFormData] = useState<any>(() => initializeCrachaModel(modelo));

  const [activeTab, setActiveTab] = useState<'config' | 'frente' | 'verso'>('config');
  const [previewMode, setPreviewMode] = useState<'frente' | 'verso' | 'ambos'>('ambos');
  const [zoomLevel, setZoomLevel] = useState(120);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [toast, setToast] = useState<CrachaEditorToastState | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

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
      const side = fieldName === 'bgFrenteUrl' ? 'frente' : 'verso';
      const uniqueId = crypto.randomUUID?.() || `${Date.now()}`;
      const filePath = `templates/cracha-${side}-${uniqueId}.${getCrachaUploadExtension(file)}`;

      const { data, error } = await supabase.storage
        .from('documentos')
        .upload(filePath, file, {
          cacheControl: '31536000',
          upsert: false
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
      e.target.value = '';
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
      <CrachaEditorHeader onCancel={onCancel} onSave={() => onSave(formData)} />

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

          {selectedField ? (
            <CrachaFieldEditorPanel
              field={selectedField}
              hasBack={formData.hasVerso}
              onClose={() => setSelectedFieldId(null)}
              onRemove={handleRemoveField}
              onUpdate={updateSelectedField}
              onUpdateStyle={updateSelectedFieldStyle}
            />
          ) : null}

        </div>

        <CrachaPreviewWorkspace
          formData={formData}
          previewMode={previewMode}
          selectedFieldId={selectedFieldId}
          zoomLevel={zoomLevel}
          onFieldsChange={(fields) => setFormData((previous: any) => ({ ...previous, fields }))}
          onPreviewModeChange={setPreviewMode}
          onSelectField={setSelectedFieldId}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />

      </div>

      {toast ? <CrachaEditorToast toast={toast} /> : null}
    </div>
  );
};

export default CrachaEditor;
