import React, { useEffect, useMemo, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlertTriangle,
  Bold,
  CheckCircle2,
  Italic,
  LayoutTemplate,
  Loader2,
  Minus,
  Plus,
  Save,
  ShieldCheck,
  Sliders,
  Square,
  Trash2,
  Type,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { supabase } from '../../../../../lib/supabase';
import {
  crachaPeriodoEleitoralService,
  DEFAULT_CRACHA_PERIODO_ELEITORAL_TEMPLATE,
  formatCrachaEleitoralDate,
  getDefaultCrachaPeriodoEleitoralFields,
  isCrachaEleitoralTemplateAvailable,
} from './cracha-periodo-eleitoral.service';
import CrachaPeriodoEleitoralPreview from './components/CrachaPeriodoEleitoralPreview';

const getUploadExtension = (file: File) => {
  const extensionFromName = file.name.split('.').pop()?.toLowerCase();
  if (extensionFromName && ['png', 'jpg', 'jpeg', 'webp'].includes(extensionFromName)) {
    return extensionFromName === 'jpeg' ? 'jpg' : extensionFromName;
  }

  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
};

const getSafeUniqueId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const CrachaPeriodoEleitoralPage: React.FC = () => {
  const [formData, setFormData] = useState<any>(DEFAULT_CRACHA_PERIODO_ELEITORAL_TEMPLATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'frente' | 'verso'>('config');
  const [previewMode, setPreviewMode] = useState<'frente' | 'verso' | 'ambos'>('ambos');
  const [zoomLevel, setZoomLevel] = useState(90);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const availableNow = useMemo(() => isCrachaEleitoralTemplateAvailable(formData), [formData]);
  const hasConfiguredPeriod = Boolean(formData.disponivelInicio && formData.disponivelFim);
  const selectedField = useMemo(
    () => (formData.fields || []).find((field: any) => field.id === selectedFieldId),
    [formData.fields, selectedFieldId]
  );

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const loadTemplate = async () => {
      setIsLoading(true);
      const template = await crachaPeriodoEleitoralService.getTemplate();
      setFormData(template || DEFAULT_CRACHA_PERIODO_ELEITORAL_TEMPLATE);
      setIsLoading(false);
    };

    loadTemplate();
  }, []);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = event.target;
    if (type === 'checkbox') {
      setFormData((prev: any) => ({ ...prev, [name]: (event.target as HTMLInputElement).checked }));
      return;
    }

    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleUploadBg = async (event: React.ChangeEvent<HTMLInputElement>, fieldName: 'bgFrenteUrl' | 'bgVersoUrl') => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const side = fieldName === 'bgFrenteUrl' ? 'frente' : 'verso';
      const uniqueId = getSafeUniqueId();
      const filePath = `templates/cracha-periodo-eleitoral-${side}-${uniqueId}.${getUploadExtension(file)}`;
      const { data, error } = await supabase.storage
        .from('documentos')
        .upload(filePath, file, {
          cacheControl: '31536000',
          upsert: false,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(data.path);

      setFormData((prev: any) => ({ ...prev, [fieldName]: urlData.publicUrl }));
      showToast('Imagem de fundo salva com sucesso.', 'success');
    } catch (error: any) {
      console.error('Erro ao enviar imagem do crachá eleitoral:', error);
      showToast(error?.message || 'Erro ao enviar imagem de fundo.', 'error');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const updateSelectedField = (updates: any) => {
    if (!selectedFieldId) return;
    setFormData((prev: any) => ({
      ...prev,
      fields: (prev.fields || []).map((field: any) => (
        field.id === selectedFieldId ? { ...field, ...updates } : field
      )),
    }));
  };

  const updateSelectedFieldStyle = (styleUpdates: any) => {
    if (!selectedFieldId) return;
    setFormData((prev: any) => ({
      ...prev,
      fields: (prev.fields || []).map((field: any) => (
        field.id === selectedFieldId
          ? { ...field, style: { ...(field.style || {}), ...styleUpdates } }
          : field
      )),
    }));
  };

  const handleRemoveField = (fieldId: string) => {
    setFormData((prev: any) => ({
      ...prev,
      fields: (prev.fields || []).filter((field: any) => field.id !== fieldId),
    }));
    setSelectedFieldId(null);
    showToast('Elemento removido do layout.', 'success');
  };

  const addField = (field: any, message: string) => {
    setFormData((prev: any) => ({
      ...prev,
      fields: [...(Array.isArray(prev.fields) ? prev.fields : getDefaultCrachaPeriodoEleitoralFields()), field],
    }));
    setSelectedFieldId(field.id);
    showToast(message, 'success');
  };

  const getActiveEditorPage = () => (activeTab === 'verso' ? 'verso' : 'frente');

  const handleAddText = () => {
    const page = getActiveEditorPage();
    const id = `texto-${getSafeUniqueId()}`;
    addField({
      id,
      type: 'text',
      value: 'Novo Texto',
      x: 12,
      y: page === 'verso' ? 60 : 58,
      width: 50,
      page,
      style: {
        fontSize: '14px',
        fontWeight: '700',
        textAlign: 'center',
        color: formData.corTexto || formData.corPrimaria || '#0b58a8',
        lineHeight: '1.1',
      },
    }, 'Texto adicionado.');
  };

  const handleAddBox = () => {
    const page = getActiveEditorPage();
    const id = `caixa-${getSafeUniqueId()}`;
    addField({
      id,
      type: 'boxText',
      value: 'Texto na caixa',
      x: 10,
      y: page === 'verso' ? 62 : 62,
      width: 55,
      height: 8,
      page,
      style: {
        fontSize: '14px',
        fontWeight: '800',
        textAlign: 'center',
        color: formData.corTexto || formData.corPrimaria || '#0b58a8',
        borderColor: formData.corBorda || formData.corPrimaria || '#0b58a8',
      },
    }, 'Caixa de texto adicionada.');
  };

  const handleAddLine = () => {
    const page = getActiveEditorPage();
    const id = `linha-${getSafeUniqueId()}`;
    addField({
      id,
      type: 'line',
      value: '',
      x: 15,
      y: page === 'verso' ? 75 : 55,
      width: 35,
      height: 0.25,
      page,
      style: { backgroundColor: formData.corPrimaria || '#0b58a8' },
    }, 'Linha adicionada.');
  };

  const handleAddShape = () => {
    const page = getActiveEditorPage();
    const id = `forma-${getSafeUniqueId()}`;
    addField({
      id,
      type: 'rect',
      value: '',
      x: 15,
      y: page === 'verso' ? 70 : 55,
      width: 35,
      height: 4,
      page,
      style: { backgroundColor: formData.corPrimaria || '#0b58a8', borderRadius: '4px' },
    }, 'Forma adicionada.');
  };

  const handleResetDefaultFields = () => {
    setFormData((prev: any) => ({ ...prev, fields: getDefaultCrachaPeriodoEleitoralFields() }));
    setSelectedFieldId(null);
    showToast('Layout padrão do crachá eleitoral restaurado.', 'success');
  };

  const handleSave = async () => {
    if (!formData.disponivelInicio || !formData.disponivelFim) {
      showToast('Informe a data inicial e a data final de disponibilidade.', 'warning');
      return;
    }

    if (formData.disponivelInicio > formData.disponivelFim) {
      showToast('A data inicial não pode ser maior que a data final.', 'warning');
      return;
    }

    setIsSaving(true);
    const saved = await crachaPeriodoEleitoralService.saveTemplate(formData);
    setIsSaving(false);
    showToast(saved ? 'Modelo de crachá período eleitoral salvo.' : 'Erro ao salvar o modelo.', saved ? 'success' : 'error');
  };

  useEffect(() => {
    if (activeTab === 'frente') setPreviewMode('frente');
    else if (activeTab === 'verso' && formData.hasVerso !== false) setPreviewMode('verso');
    else setPreviewMode(formData.hasVerso === false ? 'frente' : 'ambos');
    if (activeTab === 'config') setSelectedFieldId(null);
  }, [activeTab, formData.hasVerso]);

  const handleZoomOut = () => setZoomLevel((current) => Math.max(50, current - 10));
  const handleZoomIn = () => setZoomLevel((current) => Math.min(150, current + 10));

  const renderBackgroundControl = (fieldName: 'bgFrenteUrl' | 'bgVersoUrl', label: string) => (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
        Imagem de Fundo ({label})
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          name={fieldName}
          placeholder="URL da imagem (.png / .jpg)"
          value={formData[fieldName] || ''}
          onChange={handleChange}
          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all"
        />
        <label className="flex items-center justify-center p-3 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 rounded-xl border border-slate-200 cursor-pointer transition-colors relative">
          <input
            type="file"
            accept="image/*"
            onChange={(event) => handleUploadBg(event, fieldName)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            disabled={isUploading}
          />
          {isUploading ? <Loader2 size={18} className="animate-spin text-blue-600" /> : <Upload size={18} />}
        </label>
      </div>
      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Recomendado: imagem horizontal na proporção do crachá eleitoral.</p>
    </div>
  );

  const getFieldDescription = (field: any) => {
    if (field.type === 'boxText') return `Caixa: ${String(field.value || '').slice(0, 24)}`;
    if (field.type === 'line') return 'Linha';
    if (field.type === 'rect') return 'Forma';
    if (field.type === 'seal') return 'Selo Sergipe';
    return String(field.value || 'Texto').slice(0, 28);
  };

  const renderElementIcon = (type: string) => {
    if (type === 'boxText') return <Square size={14} className="text-slate-400 shrink-0" />;
    if (type === 'line') return <Minus size={14} className="text-slate-400 shrink-0" />;
    if (type === 'rect') return <Square size={14} className="text-slate-400 shrink-0" />;
    if (type === 'seal') return <ShieldCheck size={14} className="text-slate-400 shrink-0" />;
    return <Type size={14} className="text-slate-400 shrink-0" />;
  };

  const renderEditableElementsPanel = (page: 'frente' | 'verso') => (
    <div className="space-y-5">
      <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/70 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-[10px] font-black text-[#001a33] uppercase tracking-widest flex items-center gap-2">
            <Plus size={14} className="text-blue-600" /> Inserir Elemento
          </h4>
          <button
            type="button"
            onClick={handleResetDefaultFields}
            className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600"
          >
            Restaurar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={handleAddText} className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl text-xs font-bold text-slate-700 transition-colors">
            <Type size={14} /> Texto
          </button>
          <button type="button" onClick={handleAddBox} className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl text-xs font-bold text-slate-700 transition-colors">
            <Square size={14} /> Caixa
          </button>
          <button type="button" onClick={handleAddLine} className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl text-xs font-bold text-slate-700 transition-colors">
            <Minus size={14} /> Linha
          </button>
          <button type="button" onClick={handleAddShape} className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl text-xs font-bold text-slate-700 transition-colors">
            <Square size={14} /> Forma
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Elementos na {page === 'frente' ? 'Frente' : 'Verso'}
        </label>
        <div className="flex flex-col gap-1 max-h-[230px] overflow-y-auto custom-scrollbar">
          {(formData.fields || [])
            .filter((field: any) => (field.page || 'frente') === page)
            .map((field: any) => {
              const isSelected = selectedFieldId === field.id;
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => setSelectedFieldId(field.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-blue-50 border-blue-200 text-blue-600'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="min-w-0 flex-1 flex items-center gap-2">
                    {renderElementIcon(field.type)}
                    <span className="truncate">{getFieldDescription(field)}</span>
                  </span>
                  <span className="text-[9px] font-mono opacity-60 shrink-0">
                    X:{Math.round(Number(field.x || 0))}% Y:{Math.round(Number(field.y || 0))}%
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center text-slate-400">
        <Loader2 className="mx-auto mb-3 animate-spin text-blue-600" />
        <p className="text-xs font-black uppercase tracking-widest">Carregando modelo do crachá eleitoral...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2.5rem] p-4 lg:p-8 border border-slate-200 shadow-sm animate-fadeIn flex flex-col min-h-[calc(100vh-10rem)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 pb-6 border-b border-slate-100 gap-4">
        <div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <LayoutTemplate size={24} className="text-blue-600" />
            Editar Crachá Período Eleitoral
          </h3>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">
            Personalize o layout, configure frente e verso e defina a janela de liberação
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 w-full sm:w-auto justify-center disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar Alterações
        </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-8 flex-1">
        <div className="w-full xl:w-[400px] flex flex-col gap-6 shrink-0">
          <div className={`rounded-2xl border p-4 ${availableNow ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-amber-100 bg-amber-50 text-amber-800'}`}>
            <div className="flex items-start gap-3">
              {availableNow ? <CheckCircle2 size={20} className="mt-0.5 shrink-0" /> : <AlertTriangle size={20} className="mt-0.5 shrink-0" />}
              <div>
                <p className="text-xs font-black uppercase tracking-widest">
                  {availableNow ? 'Disponível agora' : 'Fora do período de liberação'}
                </p>
                <p className="mt-1 text-xs font-semibold leading-relaxed">
                  {hasConfiguredPeriod
                    ? `Período configurado: ${formatCrachaEleitoralDate(formData.disponivelInicio)} até ${formatCrachaEleitoralDate(formData.disponivelFim)}.`
                    : 'Configure data inicial e data final para liberar este crachá na secretaria e no portal do aluno.'}
                </p>
              </div>
            </div>
          </div>

          <div className="p-1 rounded-xl flex gap-1 bg-slate-100">
            {[
              ['config', 'Config'],
              ['frente', 'Frente'],
              ['verso', 'Verso'],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as 'config' | 'frente' | 'verso')}
                className={`flex-1 py-2 px-4 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6 max-h-[60vh] xl:max-h-[68vh]">
            {activeTab === 'config' && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome do Modelo <span className="text-red-500">*</span></label>
                  <input name="nome" value={formData.nome || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Data Inicial</label>
                    <input type="date" name="disponivelInicio" value={formData.disponivelInicio || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Data Final</label>
                    <input type="date" name="disponivelFim" value={formData.disponivelFim || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Status</label>
                  <select name="status" value={formData.status || 'ativo'} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all">
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Órgão / Cabeçalho</label>
                  <input name="orgaoTitulo" value={formData.orgaoTitulo || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Título da Frente</label>
                  <textarea name="tituloPrincipal" value={formData.tituloPrincipal || ''} onChange={handleChange} rows={2} className="w-full resize-y bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all" />
                </div>

                {[
                  ['instituicaoEnsinoPadrao', 'Instituição de Ensino Padrão'],
                  ['categoriaPadrao', 'Categoria Profissional'],
                  ['instrutorPadrao', 'Instrutor Padrão'],
                  ['validadePadrao', 'Validade Padrão'],
                ].map(([name, label]) => (
                  <div key={name}>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{label}</label>
                    <input name={name} value={formData[name] || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all" />
                  </div>
                ))}

                <div className="grid grid-cols-3 gap-3">
                  {[
                    ['corPrimaria', 'Cor Primária'],
                    ['corTexto', 'Cor Texto'],
                    ['corBorda', 'Cor Borda'],
                  ].map(([name, label]) => (
                    <div key={name}>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{label}</label>
                      <input type="color" name={name} value={formData[name] || '#0b58a8'} onChange={handleChange} className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer p-1" />
                    </div>
                  ))}
                </div>

                <label className="flex items-center gap-3 cursor-pointer p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                  <input type="checkbox" name="hasVerso" checked={formData.hasVerso !== false} onChange={handleChange} className="w-5 h-5 text-blue-600 rounded" />
                  <div>
                    <span className="block text-sm font-bold text-[#001a33] uppercase">Ter verso impresso</span>
                    <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Dados complementares e assinaturas no verso.</span>
                  </div>
                </label>
              </div>
            )}

            {activeTab === 'frente' && (
              <div className="space-y-5 animate-fadeIn">
                {renderBackgroundControl('bgFrenteUrl', 'Frente')}
                <label className="flex items-center gap-3 cursor-pointer p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                  <input type="checkbox" name="ocultarDesignPadrao" checked={!!formData.ocultarDesignPadrao} onChange={handleChange} className="w-5 h-5 text-blue-600 rounded" />
                  <div>
                    <span className="block text-xs font-bold text-[#001a33] uppercase">Ocultar desenho padrão</span>
                    <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Mostra apenas a imagem de fundo customizada.</span>
                  </div>
                </label>
                {renderEditableElementsPanel('frente')}
              </div>
            )}

            {activeTab === 'verso' && formData.hasVerso !== false && (
              <div className="space-y-5 animate-fadeIn">
                {renderBackgroundControl('bgVersoUrl', 'Verso')}
                {renderEditableElementsPanel('verso')}
              </div>
            )}

            {activeTab === 'verso' && formData.hasVerso === false && (
              <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                <p className="text-xs font-bold uppercase tracking-widest">O verso está desabilitado na aba Config.</p>
              </div>
            )}
          </div>

          {selectedField && activeTab !== 'config' && (
            <div className="border-t border-slate-200 pt-4 flex flex-col gap-3 shrink-0 animate-fadeIn bg-white">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider flex items-center gap-2">
                  <Sliders size={14} className="text-blue-600" /> Ajustar Elemento
                </h4>
                <button
                  type="button"
                  onClick={() => setSelectedFieldId(null)}
                  className="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase"
                >
                  Fechar
                </button>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col gap-3 max-h-[330px] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      <span>Posição X</span>
                      <span className="font-mono">{selectedField.x}%</span>
                    </label>
                    <input
                      type="range"
                      min="-10"
                      max="105"
                      step="0.5"
                      value={selectedField.x || 0}
                      onChange={(event) => updateSelectedField({ x: parseFloat(event.target.value) })}
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
                      max="105"
                      step="0.5"
                      value={selectedField.y || 0}
                      onChange={(event) => updateSelectedField({ y: parseFloat(event.target.value) })}
                      className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      <span>Largura</span>
                      <span className="font-mono">{selectedField.width || 35}%</span>
                    </label>
                    <input
                      type="range"
                      min="3"
                      max="100"
                      step="0.5"
                      value={selectedField.width || 35}
                      onChange={(event) => updateSelectedField({ width: parseFloat(event.target.value) })}
                      className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                  <div>
                    <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      <span>Altura</span>
                      <span className="font-mono">{selectedField.height || 8}%</span>
                    </label>
                    <input
                      type="range"
                      min="0.2"
                      max="80"
                      step="0.25"
                      value={selectedField.height || (selectedField.type === 'line' ? 0.25 : 8)}
                      onChange={(event) => updateSelectedField({ height: parseFloat(event.target.value) })}
                      className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Página do Elemento</label>
                  <select
                    value={selectedField.page || 'frente'}
                    onChange={(event) => {
                      const nextPage = event.target.value as 'frente' | 'verso';
                      updateSelectedField({ page: nextPage });
                      setActiveTab(nextPage);
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none"
                  >
                    <option value="frente">Frente</option>
                    {formData.hasVerso !== false && <option value="verso">Verso</option>}
                  </select>
                </div>

                {['text', 'boxText'].includes(selectedField.type) && (
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Conteúdo</label>
                      <textarea
                        value={selectedField.value || ''}
                        onChange={(event) => updateSelectedField({ value: event.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 resize-y custom-scrollbar min-h-[62px]"
                      />
                      <div className="flex flex-wrap gap-1 mt-1">
                        {['{{ALUNO_NOME}}', '{{ALUNO_MATRICULA}}', '{{ALUNO_CURSO}}', '{{INSTITUICAO_ENSINO}}', '{{CATEGORIA_PROFISSIONAL}}', '{{VALIDADE}}'].map((variable) => (
                          <button
                            key={variable}
                            type="button"
                            onClick={() => updateSelectedField({ value: `${selectedField.value || ''} ${variable}` })}
                            className="text-[7.5px] font-mono font-bold bg-slate-200 hover:bg-slate-300 text-slate-600 px-1 py-0.5 rounded"
                          >
                            {variable}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                          <span>Tam. Fonte</span>
                          <span className="font-mono">{selectedField.style?.fontSize || '14px'}</span>
                        </label>
                        <input
                          type="range"
                          min="5"
                          max="40"
                          step="0.5"
                          value={parseFloat(selectedField.style?.fontSize) || 14}
                          onChange={(event) => updateSelectedFieldStyle({ fontSize: `${event.target.value}px` })}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Cor Texto</label>
                        <input
                          type="color"
                          value={selectedField.style?.color || formData.corTexto || '#0b58a8'}
                          onChange={(event) => updateSelectedFieldStyle({ color: event.target.value })}
                          className="w-full h-7 bg-white border border-slate-200 rounded cursor-pointer p-0.5"
                        />
                      </div>
                    </div>

                    {selectedField.type === 'boxText' && (
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Cor da Borda</label>
                        <input
                          type="color"
                          value={selectedField.style?.borderColor || formData.corBorda || '#0b58a8'}
                          onChange={(event) => updateSelectedFieldStyle({ borderColor: event.target.value })}
                          className="w-full h-7 bg-white border border-slate-200 rounded cursor-pointer p-0.5"
                        />
                      </div>
                    )}

                    <div className="flex gap-2">
                      <div className="flex rounded-lg bg-white border border-slate-200 p-0.5 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => updateSelectedFieldStyle({ fontWeight: selectedField.style?.fontWeight === '900' || selectedField.style?.fontWeight === 'bold' ? '400' : '900' })}
                          className={`p-1.5 rounded transition-colors ${selectedField.style?.fontWeight === '900' || selectedField.style?.fontWeight === 'bold' ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
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
                          const isActive = (selectedField.style?.textAlign || 'left') === align;
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

                {['line', 'rect'].includes(selectedField.type) && (
                  <div className="pt-2 border-t border-slate-200">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Cor</label>
                    <input
                      type="color"
                      value={selectedField.style?.backgroundColor || formData.corPrimaria || '#0b58a8'}
                      onChange={(event) => updateSelectedFieldStyle({ backgroundColor: event.target.value })}
                      className="w-full h-7 bg-white border border-slate-200 rounded cursor-pointer p-0.5"
                    />
                  </div>
                )}

                {selectedField.type === 'seal' && (
                  <div className="pt-2 border-t border-slate-200">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Cor do Selo</label>
                    <input
                      type="color"
                      value={selectedField.style?.color || '#1f2937'}
                      onChange={(event) => updateSelectedFieldStyle({ color: event.target.value })}
                      className="w-full h-7 bg-white border border-slate-200 rounded cursor-pointer p-0.5"
                    />
                  </div>
                )}

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

        <div className="flex-1 bg-slate-200 rounded-2xl overflow-hidden flex flex-col relative border border-slate-300">
          <div className="bg-[#0d1527] text-white p-3 flex justify-between items-center text-xs font-bold uppercase shadow-md z-10 shrink-0">
            <span className="tracking-widest hidden sm:inline text-slate-350">Visualização Prévia (Horizontal)</span>
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
              <div>
                <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg">
                  <button onClick={() => setPreviewMode('frente')} className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'frente' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}>FRENTE</button>
                  {formData.hasVerso !== false && (
                    <button onClick={() => setPreviewMode('verso')} className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'verso' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}>VERSO</button>
                  )}
                  {formData.hasVerso !== false && (
                    <button onClick={() => setPreviewMode('ambos')} className={`px-3 py-1 rounded text-[10px] font-black transition-colors ${previewMode === 'ambos' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}>AMBOS</button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar p-8 bg-slate-200 flex flex-col items-center justify-start gap-8 min-h-0 select-none">
            {(previewMode === 'frente' || previewMode === 'ambos') && (
              <div className="flex flex-col items-center gap-2 mx-auto">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Frente</span>
                <CrachaPeriodoEleitoralPreview
                  formData={formData}
                  page="frente"
                  zoomLevel={zoomLevel}
                  isEditable={activeTab === 'frente'}
                  selectedFieldId={selectedFieldId}
                  onSelectField={setSelectedFieldId}
                  onChangePositions={(updatedFields) => setFormData((prev: any) => ({ ...prev, fields: updatedFields }))}
                />
              </div>
            )}
            {(previewMode === 'verso' || previewMode === 'ambos') && formData.hasVerso !== false && (
              <div className="flex flex-col items-center gap-2 mx-auto">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Verso</span>
                <CrachaPeriodoEleitoralPreview
                  formData={formData}
                  page="verso"
                  zoomLevel={zoomLevel}
                  isEditable={activeTab === 'verso'}
                  selectedFieldId={selectedFieldId}
                  onSelectField={setSelectedFieldId}
                  onChangePositions={(updatedFields) => setFormData((prev: any) => ({ ...prev, fields: updatedFields }))}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed right-6 top-6 z-[99999] animate-fadeIn">
          <div className={`flex items-center gap-3 rounded-2xl border px-6 py-3.5 text-white shadow-2xl ${
            toast.type === 'success' ? 'border-emerald-400 bg-emerald-500/95' : toast.type === 'warning' ? 'border-amber-400 bg-amber-500/95' : 'border-red-400 bg-red-500/95'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span className="text-xs font-black uppercase tracking-wider">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrachaPeriodoEleitoralPage;
