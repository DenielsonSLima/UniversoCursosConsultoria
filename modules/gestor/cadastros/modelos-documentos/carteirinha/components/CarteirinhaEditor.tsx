import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, LayoutTemplate, ZoomOut, ZoomIn, Upload, Loader2, Palette, FileText, Image, AlignLeft, AlignCenter, AlignRight, AlignJustify, ShieldCheck, HelpCircle, Trash2 } from 'lucide-react';
import { supabase } from '../../../../../../lib/supabase';
import CarteirinhaPreview from './CarteirinhaPreview';
import ToastNotification, { useToast } from '../../../../components/ToastNotification';
import { usePoloInstitutionalData } from '../../../../../shared/polo-institutional/use-polo-institutional-data';

interface CarteirinhaEditorProps {
  modelo: any;
  onSave: (modelo: any) => void;
  onCancel: () => void;
}

const CarteirinhaEditor: React.FC<CarteirinhaEditorProps> = ({ modelo, onSave, onCancel }) => {
  const { toasts, removeToast, toast } = useToast();
  const [formData, setFormData] = useState(() => {
    const base = modelo || {};
    return {
      id: base.id || `new-${Date.now()}`,
      nome: base.nome || '',
      tipoCurso: base.tipoCurso || 'Cursos Técnicos',
      status: base.status || 'ativo',
      startNumber: base.startNumber || 1000,
      hasVerso: base.hasVerso !== undefined ? base.hasVerso : true,
      corPrimaria: base.corPrimaria || '#001a33',
      corSecundaria: base.corSecundaria || '#e2e8f0',
      textoFrente: base.textoFrente || 'CARTEIRA DE ESTUDANTE',
      textoVerso: base.textoVerso || 'Este documento é padronizado nacionalmente nos termos da Lei nº 12.933/2013 e garante o direito de meia-entrada em eventos artísticos-culturais e esportivos.\n\nUso pessoal e intransferível.\nVerifique a validade via QR Code.',
      bgFrenteUrl: base.bgFrenteUrl || '',
      bgVersoUrl: base.bgVersoUrl || '',
      usePhotoshopLayout: base.usePhotoshopLayout !== undefined ? base.usePhotoshopLayout : false,
      ocultarDesignPadrao: base.ocultarDesignPadrao !== undefined ? base.ocultarDesignPadrao : false,
      exibirRotulos: base.exibirRotulos !== undefined ? base.exibirRotulos : true,
      corTexto: base.corTexto || '#1e293b',
      tamanhoFonteNome: base.tamanhoFonteNome || 8.5,
      tamanhoFonteDados: base.tamanhoFonteDados || 7.0,
      fotoWidth: base.fotoWidth || 18.5,
      fotoHeight: base.fotoHeight || 44.0,
      showValidationCode: base.showValidationCode !== undefined ? base.showValidationCode : true,
      rotuloCodigoValidacao: base.rotuloCodigoValidacao || 'CÓD.:',
      tamanhoFonteCodigoValidacao: base.tamanhoFonteCodigoValidacao || 4.2,
      corCodigoValidacao: base.corCodigoValidacao || '#1e293b',
      // Novos campos
      showTextoVerso: base.showTextoVerso !== undefined ? base.showTextoVerso : true,
      showInstitutionalData: base.showInstitutionalData !== undefined ? base.showInstitutionalData : true,
      tamanhoFonteDadosInstitucionais: base.tamanhoFonteDadosInstitucionais || 5.2,
      corDadosInstitucionais: base.corDadosInstitucionais || '#1e293b',
      alinhamentoDadosInstitucionais: base.alinhamentoDadosInstitucionais || 'left',
      showAssinaturaAluno: base.showAssinaturaAluno !== undefined ? base.showAssinaturaAluno : true,
      showAssinaturaDiretor: base.showAssinaturaDiretor !== undefined ? base.showAssinaturaDiretor : true,
      textoDiretor: base.textoDiretor || 'Assinatura do Diretor(a)',
      assinaturaDiretorPngUrl: base.assinaturaDiretorPngUrl || '',
      assinaturaOrigem: base.assinaturaOrigem || 'none',
      mesclarAssinatura: base.mesclarAssinatura !== undefined ? base.mesclarAssinatura : true,
      assinaturaDiretorWidth: base.assinaturaDiretorWidth || 25.0,
      showSiteValidador: base.showSiteValidador !== undefined ? base.showSiteValidador : true,
      siteValidadorUrl: base.siteValidadorUrl || 'www.universocc.com.br',
      showDataEmissao: base.showDataEmissao !== undefined ? base.showDataEmissao : true,
      dataEmissaoTexto: base.dataEmissaoTexto || 'EMISSÃO: 18/06/2026',
      corTextoVerso: base.corTextoVerso || '#1e293b',
      tamanhoFonteVerso: base.tamanhoFonteVerso || 5.0,
      alinhamentoTextoVerso: base.alinhamentoTextoVerso || 'center',
      tamanhoFonteValidador: base.tamanhoFonteValidador || 6.0,
      corTextoValidador: base.corTextoValidador || '#1e293b',
      tamanhoFonteEmissao: base.tamanhoFonteEmissao || 5.5,
      corTextoEmissao: base.corTextoEmissao || '#ef4444',
      posicoes: base.posicoes || null
    };
  });

  const [activeTab, setActiveTab] = useState<'config' | 'frente' | 'verso' | 'certificado'>('config');
  const [previewMode, setPreviewMode] = useState<'frente' | 'verso' | 'ambos'>('ambos');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isUploading, setIsUploading] = useState(false);
  const activePoloId =
    sessionStorage.getItem('current_polo_id') ||
    sessionStorage.getItem('active_polo_id');
  const { data: institutionalData } = usePoloInstitutionalData(activePoloId);
  const previewAluno = institutionalData
    ? {
        nome: 'ANA CLARA DOS SANTOS E SILVA',
        cpf: '123.456.789-00',
        rg: '12.345.678-9',
        nascimento: '15/08/2005',
        matricula: '2026100123',
        curso: formData.tipoCurso === 'Cursos Livres'
          ? 'Design Gráfico para Web'
          : 'Técnico em Informática',
        instituicao: institutionalData.poloNome || 'Universo Cursos e Consultoria',
        validade: '31/03/2027',
        tipoDocumento: 'RG',
        validationCode: 'CIE-AB12-CD34-EF56',
        poloRazaoSocial: institutionalData.razaoSocial,
        poloCnpj: institutionalData.cnpj,
        poloTelefone: institutionalData.telefone,
      }
    : undefined;

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

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'bgFrenteUrl' | 'bgVersoUrl' | 'assinaturaDiretorPngUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const originalExtension = file.name.split('.').pop()?.toLowerCase();
      const mimeExtension = file.type === 'image/jpeg'
        ? 'jpg'
        : file.type === 'image/webp'
          ? 'webp'
          : file.type === 'image/png'
            ? 'png'
            : originalExtension || 'png';
      const filePath = `templates/${fieldName}_${Date.now()}.${mimeExtension}`;

      const { data, error } = await supabase.storage
        .from('documentos')
        .upload(filePath, file, {
          cacheControl: '31536000',
          contentType: file.type || undefined,
          upsert: true
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(data.path);

      setFormData(prev => ({ ...prev, [fieldName]: urlData.publicUrl }));
      toast.success('Upload Concluído', 'Imagem enviada com sucesso!');
    } catch (err: any) {
      console.error('Erro ao fazer upload:', err);
      toast.error('Erro no Upload', err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleZoomOut = () => setZoomLevel(prev => Math.max(50, prev - 10));
  const handleZoomIn = () => setZoomLevel(prev => Math.min(200, prev + 10));

  return (
    <>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
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
             <button
                onClick={() => setActiveTab('certificado')}
                className={`flex-1 py-2 px-4 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === 'certificado' ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
             >
                Certificado
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
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Número Sequencial Inicial</label>
                  <input 
                    type="number" 
                    name="startNumber"
                    value={formData.startNumber || 1000}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-pink-500 focus:bg-white transition-all"
                  />
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1 leading-normal">As novas carteirinhas emitidas iniciarão a contagem sequencial a partir deste número.</p>
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

                {/* Upload Imagem de Fundo (Frente) */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Imagem de Fundo (Frente) — Photoshop</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      name="bgFrenteUrl"
                      placeholder="URL da imagem de fundo (.png / .jpg)"
                      value={formData.bgFrenteUrl || ''}
                      onChange={handleChange}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:border-pink-500 focus:bg-white transition-all"
                    />
                    <label className="flex items-center justify-center p-3 bg-slate-100 hover:bg-pink-50 hover:text-pink-600 rounded-xl border border-slate-200 cursor-pointer transition-colors relative">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => handleUploadFile(e, 'bgFrenteUrl')} 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        disabled={isUploading}
                      />
                      {isUploading ? <Loader2 size={18} className="animate-spin text-pink-600" /> : <Upload size={18} />}
                    </label>
                  </div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Recomendado: 856 x 540 pixels (.png transparente ou opaco)</p>
                </div>

                {/* Opções de Layout do Photoshop se tiver imagem de fundo */}
                {(!!formData.bgFrenteUrl || !!formData.bgVersoUrl) && (
                  <div className="space-y-4 p-4 border border-pink-100 rounded-xl bg-pink-50/20 animate-fadeIn">
                    <label className="flex items-center gap-3 cursor-pointer hover:bg-slate-50/50 p-1 rounded transition-colors">
                      <input 
                        type="checkbox" 
                        name="usePhotoshopLayout" 
                        checked={formData.usePhotoshopLayout || false} 
                        onChange={handleChange}
                        className="w-5 h-5 text-pink-600 rounded" 
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
                        className="w-5 h-5 text-pink-600 rounded" 
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
                        className="w-5 h-5 text-pink-600 rounded" 
                      />
                      <div>
                        <span className="block text-sm font-bold text-[#001a33] uppercase">Exibir Rótulos nos Dados</span>
                        <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Mostra legendas (ex: "NOME:") antes dos valores dos campos.</span>
                      </div>
                    </label>

                    {/* Controles de Estilo Avançados */}
                    {!!formData.usePhotoshopLayout && (
                      <div className="mt-4 pt-4 border-t border-pink-100 space-y-4 animate-fadeIn">
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
                              className="w-full h-1 bg-slate-250 rounded-lg appearance-none cursor-pointer accent-pink-600"
                            />
                          </div>
                          <div>
                            <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                              <span>Fonte Dados</span>
                              <span className="font-mono">{(formData.tamanhoFonteDados || 7.0)}px</span>
                            </label>
                            <input 
                              type="range" 
                              name="tamanhoFonteDados"
                              min="5" 
                              max="14" 
                              step="0.5"
                              value={formData.tamanhoFonteDados || 7.0}
                              onChange={(e) => setFormData({ ...formData, tamanhoFonteDados: parseFloat(e.target.value) })}
                              className="w-full h-1 bg-slate-250 rounded-lg appearance-none cursor-pointer accent-pink-600"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                              <span>Largura Foto</span>
                              <span className="font-mono">{(formData.fotoWidth || 18.5)}%</span>
                            </label>
                            <input 
                              type="range" 
                              name="fotoWidth"
                              min="10" 
                              max="35" 
                              step="0.5"
                              value={formData.fotoWidth || 18.5}
                              onChange={(e) => setFormData({ ...formData, fotoWidth: parseFloat(e.target.value) })}
                              className="w-full h-1 bg-slate-250 rounded-lg appearance-none cursor-pointer accent-pink-600"
                            />
                          </div>
                          <div>
                            <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                              <span>Altura Foto</span>
                              <span className="font-mono">{(formData.fotoHeight || 44.0)}%</span>
                            </label>
                            <input 
                              type="range" 
                              name="fotoHeight"
                              min="20" 
                              max="60" 
                              step="0.5"
                              value={formData.fotoHeight || 44.0}
                              onChange={(e) => setFormData({ ...formData, fotoHeight: parseFloat(e.target.value) })}
                              className="w-full h-1 bg-slate-250 rounded-lg appearance-none cursor-pointer accent-pink-600"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-[#001a33] uppercase tracking-widest">Código abaixo do QR</h4>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Permite digitar o código no site quando a câmera não conseguir ler o QR</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name="showValidationCode"
                        checked={formData.showValidationCode !== false}
                        onChange={handleChange}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-600" />
                    </label>
                  </div>
                  {formData.showValidationCode !== false && (
                    <div className="pt-2 border-t border-slate-100 space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Rótulo</label>
                        <input
                          type="text"
                          name="rotuloCodigoValidacao"
                          value={formData.rotuloCodigoValidacao}
                          onChange={handleChange}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-pink-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                            <span>Tamanho</span>
                            <span className="font-mono">{Number(formData.tamanhoFonteCodigoValidacao || 4.2).toFixed(1)}px</span>
                          </label>
                          <input
                            type="range"
                            min="3"
                            max="10"
                            step="0.2"
                            value={formData.tamanhoFonteCodigoValidacao || 4.2}
                            onChange={(e) => setFormData({ ...formData, tamanhoFonteCodigoValidacao: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-600"
                          />
                        </div>
                        <div>
                          <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                            <span>Cor</span>
                            <span className="font-mono">{formData.corCodigoValidacao}</span>
                          </label>
                          <input
                            type="color"
                            name="corCodigoValidacao"
                            value={formData.corCodigoValidacao || '#1e293b'}
                            onChange={handleChange}
                            className="w-full h-8 bg-white border border-slate-200 rounded-lg cursor-pointer p-0.5"
                          />
                        </div>
                      </div>
                      <p className="text-[9px] text-pink-600 font-bold uppercase tracking-widest">No preview, arraste o código para ajustar sua posição.</p>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-600 font-bold leading-relaxed uppercase tracking-widest">
                    Os dados do aluno (Foto, Nome, CPF, RG, Nascimento, Curso, Matrícula) flutuarão por cima do fundo.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'verso' && formData.hasVerso && (
              <div className="space-y-5 animate-fadeIn">
                {/* Cor do Texto do Verso */}
                <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-3">
                  <h4 className="text-xs font-black text-[#001a33] uppercase tracking-widest flex items-center gap-2">
                    <Palette size={14} className="text-pink-600" />
                    Estilização do Verso
                  </h4>
                  <div>
                    <label className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                      <span>Cor das Fontes (Verso)</span>
                      <span className="font-mono">{formData.corTextoVerso || '#1e293b'}</span>
                    </label>
                    <input 
                      type="color" 
                      name="corTextoVerso"
                      value={formData.corTextoVerso || '#1e293b'}
                      onChange={handleChange}
                      className="w-full h-9 bg-white border border-slate-200 rounded-xl cursor-pointer p-1"
                    />
                  </div>
                </div>

                {/* Upload Imagem de Fundo (Verso) */}
                <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-3">
                  <h4 className="text-xs font-black text-[#001a33] uppercase tracking-widest flex items-center gap-2">
                    <Image size={14} className="text-pink-600" />
                    Imagem de Fundo (Verso)
                  </h4>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      name="bgVersoUrl"
                      placeholder="URL da imagem de fundo (.png / .jpg)"
                      value={formData.bgVersoUrl || ''}
                      onChange={handleChange}
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:border-pink-500 focus:bg-white transition-all"
                    />
                    <label className="flex items-center justify-center p-3 bg-white hover:bg-pink-50 hover:text-pink-600 rounded-xl border border-slate-200 cursor-pointer transition-colors relative shrink-0">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => handleUploadFile(e, 'bgVersoUrl')} 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        disabled={isUploading}
                      />
                      {isUploading ? <Loader2 size={18} className="animate-spin text-pink-600" /> : <Upload size={18} />}
                    </label>
                  </div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-normal">Recomendado: 856 x 540 pixels (.png)</p>
                </div>

                {/* Texto de Regras/Leis */}
                <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-[#001a33] uppercase tracking-widest flex items-center gap-2">
                      <FileText size={14} className="text-pink-600" />
                      Regras e Legislação
                    </h4>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        name="showTextoVerso" 
                        checked={formData.showTextoVerso !== false} 
                        onChange={handleChange}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-600"></div>
                    </label>
                  </div>
                  {formData.showTextoVerso !== false && (
                    <>
                      <textarea 
                        name="textoVerso"
                        value={formData.textoVerso}
                        onChange={handleChange}
                        className="w-full min-h-[100px] bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:border-pink-500 focus:bg-white transition-all resize-y custom-scrollbar"
                        placeholder="Instruções e leis de meia-entrada"
                      ></textarea>
                      
                      <div className="flex items-center gap-1.5 mt-2">
                        {(['left', 'center', 'right', 'justify'] as const).map((align) => {
                          const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : align === 'right' ? AlignRight : AlignJustify;
                          return (
                            <button
                              key={align}
                              type="button"
                              onClick={() => setFormData({ ...formData, alinhamentoTextoVerso: align })}
                              className={`p-2 rounded-lg border transition-all ${formData.alinhamentoTextoVerso === align || (!formData.alinhamentoTextoVerso && align === 'center') ? 'bg-pink-50 border-pink-300 text-pink-600' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'}`}
                              title={align.toUpperCase()}
                            >
                              <Icon size={14} />
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-2.5">
                        <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                          <span>Tamanho Fonte</span>
                          <span className="font-mono">{(formData.tamanhoFonteVerso || 5.0).toFixed(1)}px</span>
                        </label>
                        <input 
                          type="range" 
                          name="tamanhoFonteVerso"
                          min="3" 
                          max="9" 
                          step="0.2"
                          value={formData.tamanhoFonteVerso || 5.0}
                          onChange={(e) => setFormData({ ...formData, tamanhoFonteVerso: parseFloat(e.target.value) })}
                          className="w-full h-1 bg-slate-250 rounded-lg appearance-none cursor-pointer accent-pink-600"
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Assinatura do Aluno */}
                <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-[#001a33] uppercase tracking-widest">Local de Assinatura do Aluno</h4>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Habilita a linha para assinatura física do aluno</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      name="showAssinaturaAluno" 
                      checked={formData.showAssinaturaAluno !== false} 
                      onChange={handleChange}
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-600"></div>
                  </label>
                </div>

                {/* Assinatura do Diretor */}
                <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-[#001a33] uppercase tracking-widest">Assinatura do Diretor/Gestor</h4>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Mostra linha e imagem da assinatura do diretor</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        name="showAssinaturaDiretor" 
                        checked={formData.showAssinaturaDiretor !== false} 
                        onChange={handleChange}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-600"></div>
                    </label>
                  </div>
                  {formData.showAssinaturaDiretor !== false && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Cargo / Título do Gestor</label>
                        <input 
                          type="text" 
                          name="textoDiretor"
                          value={formData.textoDiretor}
                          onChange={handleChange}
                          placeholder="Ex: Assinatura do Diretor(a)"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-pink-500 focus:bg-white transition-all"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Origem da Assinatura</label>
                        <select
                          name="assinaturaOrigem"
                          value={formData.assinaturaOrigem || 'none'}
                          onChange={handleChange}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-pink-500 transition-all cursor-pointer"
                        >
                          <option value="none">Nenhuma Assinatura</option>
                          <option value="diretoriaGeral">Diretoria Geral (Configurações)</option>
                          <option value="secretaria">Secretaria (Configurações)</option>
                          <option value="coordenacao">Coordenação (Configurações)</option>
                          <option value="financeiro">Financeiro (Configurações)</option>
                          <option value="manual">Upload Manual / URL Personalizada</option>
                        </select>
                      </div>

                      {formData.assinaturaOrigem === 'manual' && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Upload da Assinatura PNG</label>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              name="assinaturaDiretorPngUrl"
                              placeholder="URL da assinatura digitalizada (.png)"
                              value={formData.assinaturaDiretorPngUrl || ''}
                              onChange={handleChange}
                              className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-pink-500 focus:bg-white transition-all"
                            />
                            {formData.assinaturaDiretorPngUrl && (
                              <button
                                type="button"
                                onClick={() => setFormData({ ...formData, assinaturaDiretorPngUrl: '' })}
                                className="p-2.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl border border-red-200 transition-colors shrink-0"
                                title="Excluir Assinatura"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                            <label className="flex items-center justify-center p-2.5 bg-white hover:bg-pink-50 hover:text-pink-600 rounded-xl border border-slate-200 cursor-pointer transition-colors relative shrink-0">
                              <input 
                                type="file" 
                                accept="image/*" 
                                onChange={(e) => handleUploadFile(e, 'assinaturaDiretorPngUrl')} 
                                className="absolute inset-0 opacity-0 cursor-pointer" 
                                disabled={isUploading}
                              />
                              {isUploading ? <Loader2 size={16} className="animate-spin text-pink-600" /> : <Upload size={16} />}
                            </label>
                          </div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Recomendado: PNG com fundo transparente</p>
                        </div>
                      )}

                      {formData.assinaturaOrigem && formData.assinaturaOrigem !== 'none' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200/60 rounded-xl">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input 
                                type="checkbox" 
                                name="mesclarAssinatura" 
                                checked={formData.mesclarAssinatura !== false} 
                                onChange={handleChange}
                                className="w-4 h-4 text-pink-600 rounded" 
                              />
                              <div>
                                <span className="block text-xs font-bold text-[#001a33] uppercase">Modo Mesclagem (Multiplicar)</span>
                                <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-0.5">Remove fundo branco da assinatura</span>
                              </div>
                            </label>
                          </div>

                          <div>
                            <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                              <span>Largura da Assinatura</span>
                              <span className="font-mono">{(formData.assinaturaDiretorWidth || 25.0).toFixed(1)}%</span>
                            </label>
                            <input 
                              type="range" 
                              name="assinaturaDiretorWidth"
                              min="10" 
                              max="60" 
                              step="0.5"
                              value={formData.assinaturaDiretorWidth || 25.0}
                              onChange={(e) => setFormData({ ...formData, assinaturaDiretorWidth: parseFloat(e.target.value) })}
                              className="w-full h-1 bg-slate-250 rounded-lg appearance-none cursor-pointer accent-pink-600"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Validador de Documentos */}
                <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-[#001a33] uppercase tracking-widest">Dados automáticos do polo</h4>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Razão social, CNPJ e telefone vêm do cadastro do polo/empresa</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name="showInstitutionalData"
                        checked={formData.showInstitutionalData !== false}
                        onChange={handleChange}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-600" />
                    </label>
                  </div>
                  {formData.showInstitutionalData !== false && (
                    <div className="pt-2 border-t border-slate-100 space-y-3">
                      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[10px] font-bold text-blue-800 leading-relaxed">
                        {institutionalData
                          ? <>
                              <p>{institutionalData.razaoSocial}</p>
                              <p>CNPJ: {institutionalData.cnpj || 'Não cadastrado'}</p>
                              <p>Contato: {institutionalData.telefone || 'Não cadastrado'}</p>
                            </>
                          : 'Selecione/cadastre o polo ativo para visualizar os dados automáticos.'}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                            <span>Tamanho</span>
                            <span className="font-mono">{Number(formData.tamanhoFonteDadosInstitucionais || 5.2).toFixed(1)}px</span>
                          </label>
                          <input
                            type="range"
                            min="3"
                            max="10"
                            step="0.2"
                            value={formData.tamanhoFonteDadosInstitucionais || 5.2}
                            onChange={(e) => setFormData({ ...formData, tamanhoFonteDadosInstitucionais: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-600"
                          />
                        </div>
                        <div>
                          <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                            <span>Cor</span>
                            <span className="font-mono">{formData.corDadosInstitucionais}</span>
                          </label>
                          <input
                            type="color"
                            name="corDadosInstitucionais"
                            value={formData.corDadosInstitucionais || '#1e293b'}
                            onChange={handleChange}
                            className="w-full h-8 bg-white border border-slate-200 rounded-lg cursor-pointer p-0.5"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {(['left', 'center', 'right'] as const).map((align) => (
                          <button
                            key={align}
                            type="button"
                            onClick={() => setFormData({ ...formData, alinhamentoDadosInstitucionais: align })}
                            className={`flex-1 py-2 rounded-lg border text-[9px] font-black uppercase ${formData.alinhamentoDadosInstitucionais === align ? 'bg-pink-50 border-pink-300 text-pink-600' : 'bg-white border-slate-200 text-slate-500'}`}
                          >
                            {align === 'left' ? 'Esquerda' : align === 'center' ? 'Centro' : 'Direita'}
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-pink-600 font-bold uppercase tracking-widest">No preview do verso, arraste o bloco para ajustar sua posição.</p>
                    </div>
                  )}
                </div>

                {/* Validador de Documentos */}
                <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-[#001a33] uppercase tracking-widest">Site de Validação</h4>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Exibe a URL para validação de autenticidade</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        name="showSiteValidador" 
                        checked={formData.showSiteValidador !== false} 
                        onChange={handleChange}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-600"></div>
                    </label>
                  </div>
                  {formData.showSiteValidador !== false && (
                    <div className="pt-2 border-t border-slate-100 space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">URL do Validador</label>
                        <input 
                          type="text" 
                          name="siteValidadorUrl"
                          value={formData.siteValidadorUrl}
                          onChange={handleChange}
                          placeholder="Ex: www.universocc.com.br"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-pink-500 focus:bg-white transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                            <span>Tamanho Fonte</span>
                            <span className="font-mono">{(formData.tamanhoFonteValidador || 6.0).toFixed(1)}px</span>
                          </label>
                          <input 
                            type="range" 
                            name="tamanhoFonteValidador"
                            min="3" 
                            max="12" 
                            step="0.2"
                            value={formData.tamanhoFonteValidador || 6.0}
                            onChange={(e) => setFormData({ ...formData, tamanhoFonteValidador: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-600"
                          />
                        </div>
                        <div>
                          <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                            <span>Cor do Texto</span>
                            <span className="font-mono">{formData.corTextoValidador || '#1e293b'}</span>
                          </label>
                          <input 
                            type="color" 
                            name="corTextoValidador"
                            value={formData.corTextoValidador || '#1e293b'}
                            onChange={handleChange}
                            className="w-full h-8 bg-white border border-slate-200 rounded-lg cursor-pointer p-0.5"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Data de Emissão */}
                <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-[#001a33] uppercase tracking-widest">Data de Emissão</h4>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Exibe a data de emissão no documento</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        name="showDataEmissao" 
                        checked={formData.showDataEmissao !== false} 
                        onChange={handleChange}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-600"></div>
                    </label>
                  </div>
                  {formData.showDataEmissao !== false && (
                    <div className="pt-2 border-t border-slate-100 space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Texto/Formato da Emissão</label>
                        <input 
                          type="text" 
                          name="dataEmissaoTexto"
                          value={formData.dataEmissaoTexto}
                          onChange={handleChange}
                          placeholder="Ex: EMISSÃO: 18/06/2026"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-pink-500 focus:bg-white transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                            <span>Tamanho Fonte</span>
                            <span className="font-mono">{(formData.tamanhoFonteEmissao || 5.5).toFixed(1)}px</span>
                          </label>
                          <input 
                            type="range" 
                            name="tamanhoFonteEmissao"
                            min="3" 
                            max="12" 
                            step="0.2"
                            value={formData.tamanhoFonteEmissao || 5.5}
                            onChange={(e) => setFormData({ ...formData, tamanhoFonteEmissao: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-600"
                          />
                        </div>
                        <div>
                          <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                            <span>Cor do Texto</span>
                            <span className="font-mono">{formData.corTextoEmissao || '#ef4444'}</span>
                          </label>
                          <input 
                            type="color" 
                            name="corTextoEmissao"
                            value={formData.corTextoEmissao || '#ef4444'}
                            onChange={handleChange}
                            className="w-full h-8 bg-white border border-slate-200 rounded-lg cursor-pointer p-0.5"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {activeTab === 'certificado' && (
              <div className="space-y-5 animate-fadeIn">
                <div className="p-5 border border-slate-200 rounded-3xl bg-slate-50/50 space-y-4">
                  <h4 className="text-sm font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck size={18} className="text-pink-600" />
                    Assinatura Digital ICP-Brasil
                  </h4>
                  
                  <div className="space-y-3 text-xs leading-relaxed text-slate-500 font-medium">
                    <p>
                      Sim! Um <strong>Certificado Digital corporativo (A1 ou A3)</strong> pode assinar e selar as carteirinhas de forma automática na emissão do documento.
                    </p>
                    <p>
                      <strong>Como funcionaria a assinatura automática?</strong><br/>
                      No momento em que a secretaria clica em "Emitir CIE", o servidor envia o arquivo PDF gerado para um serviço criptográfico que sela o documento digitalmente com o par de chaves da instituição.
                    </p>
                    <p>
                      <strong>Validade Jurídica:</strong><br/>
                      A assinatura atesta a integridade do PDF nos termos da MP 2.200-2/2001, inviabilizando falsificações digitais.
                    </p>
                  </div>

                  <div className="border-t border-slate-200/60 pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="block text-xs font-bold text-[#001a33] uppercase">Selo Digital Automatizado</span>
                        <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-0.5">Assinar novos lotes em PDF via API</span>
                      </div>
                      <span className="bg-pink-100 text-pink-700 text-[8px] font-black uppercase px-2 py-1 rounded-md tracking-wider">
                        Em Breve
                      </span>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-2.5">
                      <HelpCircle size={16} className="text-pink-600 shrink-0 mt-0.5" />
                      <p className="text-[9px] text-slate-400 leading-normal uppercase font-bold tracking-wider">
                        Quer habilitar a assinatura com certificado A1 no seu portal? Fale com a equipe de TI da Universo.
                      </p>
                    </div>
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
            <span className="tracking-widest hidden sm:inline">Visualização Prévia (CR80)</span>
            
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
               <CarteirinhaPreview 
                 formData={formData} 
                 page="frente" 
                 zoomLevel={zoomLevel} 
                 aluno={previewAluno}
                 isEditable={true}
                 onChangePositions={(positions) => setFormData({ ...formData, posicoes: positions })}
               />
             )}
             {(previewMode === 'verso' || previewMode === 'ambos') && formData.hasVerso && (
               <CarteirinhaPreview 
                 formData={formData} 
                 page="verso" 
                 zoomLevel={zoomLevel} 
                 aluno={previewAluno}
                 isEditable={true}
                 onChangePositions={(positions) => setFormData({ ...formData, posicoes: positions })}
               />
             )}
          </div>
        </div>

      </div>
    </div>
    </>
  );
};

export default CarteirinhaEditor;
