import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { supabase } from '../../../../../lib/supabase';
import { assinaturasService } from '../../../configuracoes/assinaturas/assinaturas.service';
import {
  crachaPeriodoEleitoralService,
  CrachaSesCatalog,
  DEFAULT_CRACHA_SES_CATALOG,
  DEFAULT_CRACHA_PERIODO_ELEITORAL_TEMPLATE,
  getDefaultCrachaPeriodoEleitoralFields,
  isCrachaEleitoralTemplateAvailable,
} from './cracha-periodo-eleitoral.service';

export type CrachaEditorTab = 'modelos' | 'config' | 'frente' | 'verso';
export type CrachaPreviewMode = 'frente' | 'verso' | 'ambos';
export type CrachaToast = { message: string; type: 'success' | 'error' | 'warning' };
export type CrachaSignatureRole = 'diretoriaGeral' | 'secretaria' | 'coordenacao' | 'financeiro';

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

export const useCrachaPeriodoEleitoralEditor = () => {
  const [formData, setFormData] = useState<any>(DEFAULT_CRACHA_PERIODO_ELEITORAL_TEMPLATE);
  const [catalog, setCatalog] = useState<CrachaSesCatalog>(DEFAULT_CRACHA_SES_CATALOG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [signatureLoadingRole, setSignatureLoadingRole] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CrachaEditorTab>('modelos');
  const [previewMode, setPreviewMode] = useState<CrachaPreviewMode>('ambos');
  const [zoomLevel, setZoomLevel] = useState(90);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [toast, setToast] = useState<CrachaToast | null>(null);

  const availableNow = useMemo(() => isCrachaEleitoralTemplateAvailable(formData), [formData]);
  const selectedField = useMemo(
    () => (formData.fields || []).find((field: any) => field.id === selectedFieldId),
    [formData.fields, selectedFieldId]
  );

  const showToast = (message: string, type: CrachaToast['type'] = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const loadTemplate = async () => {
      setIsLoading(true);
      const savedCatalog = await crachaPeriodoEleitoralService.getCatalog();
      const activeModel = savedCatalog.models.find((model) => model.id === savedCatalog.activeModelId) || savedCatalog.models[0];
      setCatalog(savedCatalog);
      setFormData(activeModel || DEFAULT_CRACHA_PERIODO_ELEITORAL_TEMPLATE);
      setIsLoading(false);
    };

    loadTemplate();
  }, []);

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = event.target;
    if (type === 'checkbox') {
      setFormData((prev: any) => ({ ...prev, [name]: (event.target as HTMLInputElement).checked }));
      return;
    }

    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleUploadBg = async (event: ChangeEvent<HTMLInputElement>, fieldName: 'bgFrenteUrl' | 'bgVersoUrl') => {
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
      console.error('Erro ao enviar imagem do crachá SES:', error);
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

  const handleAddPhoto = () => {
    const id = `foto-${getSafeUniqueId()}`;
    addField({
      id,
      type: 'photo',
      value: '{{ALUNO_FOTO}}',
      x: 8,
      y: 23,
      width: 25,
      height: 46,
      page: 'frente',
      style: { borderRadius: '6px', borderColor: formData.corBorda || '#0b58a8', borderWidth: '2px', objectFit: 'cover' },
    }, 'Foto do aluno adicionada.');
    setActiveTab('frente');
  };

  const handleAddSignature = async (roleId: CrachaSignatureRole, label: string) => {
    setSignatureLoadingRole(roleId);
    try {
      const signatures = await assinaturasService.getSignatures();
      const imageUrl = signatures[roleId];
      if (!imageUrl) {
        showToast(`Assinatura de ${label} não cadastrada nas Configurações.`, 'warning');
        return;
      }

      const existingSignatures = (formData.fields || []).filter((field: any) => (
        field.page === 'verso' && field.type === 'image' && field.signatureRole
      ));
      const useSecondSlot = existingSignatures.length % 2 === 1;
      const id = `assinatura-${roleId}-${getSafeUniqueId()}`;
      addField({
        id,
        type: 'image',
        value: imageUrl,
        label: `Assinatura — ${label}`,
        signatureRole: roleId,
        x: useSecondSlot ? 56 : 12,
        y: 66,
        width: 32,
        height: 8,
        page: 'verso',
        style: {
          objectFit: 'contain',
          mixBlendMode: 'multiply',
          zIndex: 35,
        },
      }, `Assinatura de ${label} inserida.`);
      setActiveTab('verso');
    } catch (error) {
      console.error('Erro ao carregar assinatura centralizada:', error);
      showToast('Não foi possível carregar as assinaturas cadastradas.', 'error');
    } finally {
      setSignatureLoadingRole(null);
    }
  };

  const handleResetDefaultFields = () => {
    setFormData((prev: any) => ({ ...prev, fields: getDefaultCrachaPeriodoEleitoralFields() }));
    setSelectedFieldId(null);
    showToast('Layout padrão do SES restaurado.', 'success');
  };

  const handleSave = async () => {
    setIsSaving(true);
    const nextModels = catalog.models.some((model) => model.id === formData.id)
      ? catalog.models.map((model) => (model.id === formData.id ? formData : model))
      : [...catalog.models, formData];
    const nextCatalog = { ...catalog, models: nextModels };
    const saved = await crachaPeriodoEleitoralService.saveCatalog(nextCatalog);
    if (saved) setCatalog(nextCatalog);
    setIsSaving(false);
    showToast(saved ? 'Modelo SES salvo.' : 'Erro ao salvar o modelo.', saved ? 'success' : 'error');
  };

  const handleSelectModel = (model: any) => {
    setFormData(model);
    setSelectedFieldId(null);
    setActiveTab('config');
  };

  const handleNewModel = (source?: any) => {
    const id = `ses-${getSafeUniqueId()}`;
    const base = source || DEFAULT_CRACHA_PERIODO_ELEITORAL_TEMPLATE;
    const model = {
      ...base,
      id,
      nome: source ? `${source.nome} — Cópia` : 'Novo modelo SES',
      fields: (base.fields || getDefaultCrachaPeriodoEleitoralFields()).map((field: any) => ({
        ...field,
        style: { ...(field.style || {}) },
      })),
    };
    setCatalog((current) => ({ ...current, models: [...current.models, model] }));
    setFormData(model);
    setActiveTab('config');
    showToast(source ? 'Modelo duplicado. Ajuste e salve.' : 'Novo modelo criado. Ajuste e salve.', 'success');
  };

  const handleSetActiveModel = async (modelId: string) => {
    const nextCatalog = {
      ...catalog,
      activeModelId: modelId,
      models: catalog.models.map((model) => (model.id === formData.id ? formData : model)),
    };
    setIsSaving(true);
    const saved = await crachaPeriodoEleitoralService.saveCatalog(nextCatalog);
    setIsSaving(false);
    if (saved) {
      setCatalog(nextCatalog);
      showToast('Modelo ativo do SES atualizado.', 'success');
    } else showToast('Erro ao selecionar o modelo ativo.', 'error');
  };

  const handleDeleteModel = async (modelId: string) => {
    if (catalog.models.length <= 1) {
      showToast('Mantenha ao menos um modelo SES.', 'warning');
      return;
    }
    const models = catalog.models.filter((model) => model.id !== modelId);
    const activeModelId = catalog.activeModelId === modelId ? models[0].id : catalog.activeModelId;
    const nextCatalog = { ...catalog, activeModelId, models };
    const saved = await crachaPeriodoEleitoralService.saveCatalog(nextCatalog);
    if (!saved) {
      showToast('Erro ao excluir o modelo.', 'error');
      return;
    }
    setCatalog(nextCatalog);
    if (formData.id === modelId) setFormData(models.find((model) => model.id === activeModelId) || models[0]);
    showToast('Modelo removido.', 'success');
  };

  useEffect(() => {
    if (activeTab === 'frente') setPreviewMode('frente');
    else if (activeTab === 'verso' && formData.hasVerso !== false) setPreviewMode('verso');
    else setPreviewMode(formData.hasVerso === false ? 'frente' : 'ambos');
    if (activeTab === 'config' || activeTab === 'modelos') setSelectedFieldId(null);
  }, [activeTab, formData.hasVerso]);

  const handleZoomOut = () => setZoomLevel((current) => Math.max(50, current - 10));
  const handleZoomIn = () => setZoomLevel((current) => Math.min(150, current + 10));

  return {
    formData,
    setFormData,
    catalog,
    isLoading,
    isSaving,
    isUploading,
    signatureLoadingRole,
    activeTab,
    setActiveTab,
    previewMode,
    setPreviewMode,
    zoomLevel,
    selectedFieldId,
    setSelectedFieldId,
    toast,
    availableNow,
    selectedField,
    handleChange,
    handleUploadBg,
    updateSelectedField,
    updateSelectedFieldStyle,
    handleRemoveField,
    handleAddText,
    handleAddBox,
    handleAddLine,
    handleAddShape,
    handleAddPhoto,
    handleAddSignature,
    handleResetDefaultFields,
    handleSave,
    handleSelectModel,
    handleNewModel,
    handleSetActiveModel,
    handleDeleteModel,
    handleZoomOut,
    handleZoomIn,
  };
};

export type CrachaPeriodoEleitoralEditor = ReturnType<typeof useCrachaPeriodoEleitoralEditor>;
