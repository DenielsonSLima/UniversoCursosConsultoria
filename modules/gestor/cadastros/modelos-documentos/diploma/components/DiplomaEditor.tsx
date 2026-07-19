import React, { useEffect, useState } from 'react';
import { ArrowLeft, LayoutTemplate, Save } from 'lucide-react';
import { supabase } from '../../../../../../lib/supabase';
import { marcaDaguaService } from '../../../../configuracoes/marca-dagua/marca-dagua.service';
import { posicoesPadrao } from './DiplomaPreview';
import DiplomaEditorPreview from './DiplomaEditorPreview';
import DiplomaEditorSidebar from './DiplomaEditorSidebar';
import {
  buildBackgroundPatch,
  buildFinalDiplomaData,
  createInitialDiplomaData,
  DiplomaEditorTab,
  DiplomaPreviewMode,
} from './diploma-editor.helpers';

interface DiplomaEditorProps {
  modelo: any;
  onSave: (modelo: any) => void;
  onCancel: () => void;
}

const ensureUploadSession = async () => {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw new Error('Sua sessão expirou. Entre novamente no portal antes de enviar imagens.');
  }
};

const getUploadExtension = (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return extension || 'png';
};

const validateTemplateImage = (file: File) => {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem.');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('A imagem deve possuir no máximo 12 MB.');
  }
};

const DiplomaEditor: React.FC<DiplomaEditorProps> = ({ modelo, onSave, onCancel }) => {
  const [formData, setFormData] = useState<any>(() => createInitialDiplomaData(modelo));
  const [activeTab, setActiveTab] = useState<DiplomaEditorTab>('visualizar');
  const [previewMode, setPreviewMode] = useState<DiplomaPreviewMode>('ambos');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(50);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const loadLandscapeWatermark = async () => {
      try {
        const watermarks = await marcaDaguaService.getCompaniesWithWatermark();
        const preferred = watermarks.find(item => item.landscapeWatermarkUrl) || watermarks.find(item => item.watermarkUrl);
        if (!preferred) return;
        setFormData((prev: any) => ({
          ...prev,
          landscapeWatermarkUrl: prev.landscapeWatermarkUrl || preferred.landscapeWatermarkUrl || preferred.watermarkUrl,
          landscapeWatermarkOpacity: prev.landscapeWatermarkOpacity ?? preferred.landscapeWatermarkOpacity ?? preferred.watermarkOpacity ?? 0.1,
          landscapeWatermarkScale: prev.landscapeWatermarkScale ?? preferred.landscapeWatermarkScale ?? preferred.watermarkScale ?? 55,
          landscapeWatermarkRotate: prev.landscapeWatermarkRotate ?? (preferred.landscapeWatermarkRotate === true),
        }));
      } catch (error) {
        console.warn('[DiplomaEditor] Não foi possível carregar marca dágua paisagem:', error);
      }
    };
    void loadLandscapeWatermark();
  }, []);

  useEffect(() => {
    if (activeTab === 'frente') {
      setPreviewMode('frente');
    } else if (activeTab === 'verso') {
      setPreviewMode('verso');
    } else {
      setPreviewMode(formData.hasVerso ? 'ambos' : 'frente');
      setSelectedBlockId(null);
    }
  }, [activeTab, formData.hasVerso]);

  const signatureSourceOptions = [
    { value: 'none', label: 'Nenhuma Assinatura' },
    { value: 'diretoriaGeral', label: 'Diretoria Geral (Configurações)' },
    { value: 'secretaria', label: 'Secretaria Escolar (Configurações)' },
    { value: 'manual', label: 'Upload Manual / URL Personalizada' },
  ];
  const activePage = activeTab === 'verso' ? 'verso' : 'frente';
  const selectedBlock = formData.blocks.find((block: any) => block.id === selectedBlockId);
  const inactiveBlocks = formData.blocks.filter((block: any) => block.page === activePage && !block.visible);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = event.target;
    const nextValue = type === 'checkbox' ? (event.target as HTMLInputElement).checked : value;
    setFormData({ ...formData, [name]: nextValue });
  };

  const uploadTemplateImage = async (file: File) => {
    validateTemplateImage(file);
    await ensureUploadSession();
    const fileExt = getUploadExtension(file);
    const uniqueId = crypto.randomUUID?.() || `${Date.now()}`;
    const filePath = `templates/certificados/assets_${uniqueId}.${fileExt}`;
    const { data, error } = await supabase.storage.from('documentos').upload(filePath, file, {
      cacheControl: '31536000',
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) throw error;
    return supabase.storage.from('documentos').getPublicUrl(data.path).data.publicUrl;
  };

  const handleUploadBg = async (event: React.ChangeEvent<HTMLInputElement>, fieldName: 'bgFrenteUrl' | 'bgVersoUrl') => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      validateTemplateImage(file);
      await ensureUploadSession();
      const fileExt = getUploadExtension(file);
      const safeModelId = String(formData.id || 'certificado').replace(/[^a-z0-9_-]/gi, '_');
      const uniqueId = crypto.randomUUID?.() || `${Date.now()}`;
      const filePath = `templates/certificados/${safeModelId}_${fieldName}_${uniqueId}.${fileExt}`;
      const { data, error } = await supabase.storage.from('documentos').upload(filePath, file, {
        cacheControl: '31536000',
        contentType: file.type || undefined,
        upsert: false,
      });
      if (error) throw error;
      const publicUrl = supabase.storage.from('documentos').getPublicUrl(data.path).data.publicUrl;
      const page = fieldName === 'bgFrenteUrl' ? 'frente' : 'verso';
      setFormData((prev: any) => ({ ...prev, ...buildBackgroundPatch(page, publicUrl) }));
      window.setTimeout(() => alert('Upload da imagem concluído com sucesso!'), 0);
    } catch (err: any) {
      console.error('Erro ao fazer upload:', err);
      alert('Erro ao fazer upload da imagem: ' + err.message);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleUploadBlockImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const imageUrl = await uploadTemplateImage(file);
      const newBlock = {
        id: `imagem-${Date.now()}`,
        type: 'image',
        label: 'Imagem',
        page: activePage,
        x: 10,
        y: 10,
        width: 180,
        visible: true,
        imageUrl,
        opacity: 1,
      };
      setFormData({ ...formData, blocks: [...formData.blocks, newBlock] });
      setSelectedBlockId(newBlock.id);
    } catch (err: any) {
      console.error('Erro ao fazer upload:', err);
      alert('Erro ao fazer upload da imagem: ' + err.message);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleUploadSignature = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedBlockId) return;
    setIsUploading(true);
    try {
      const signatureImageUrl = await uploadTemplateImage(file);
      const blocks = formData.blocks.map((block: any) => block.id === selectedBlockId && ['signature', 'signatureImage'].includes(block.type)
        ? { ...block, signatureSource: 'manual', signatureImageUrl }
        : block);
      setFormData({ ...formData, blocks });
    } catch (err: any) {
      console.error('Erro ao fazer upload da assinatura:', err);
      alert('Erro ao fazer upload da assinatura: ' + err.message);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleAddBlock = (blockId: string) => {
    const blocks = formData.blocks.map((block: any) => block.id === blockId
      ? {
          ...block,
          visible: true,
          x: block.x ?? posicoesPadrao[blockId]?.x ?? 10,
          y: block.y ?? posicoesPadrao[blockId]?.y ?? 10,
        }
      : block);
    setFormData({ ...formData, blocks });
    setSelectedBlockId(blockId);
  };

  const handleUpdateBlockProp = (blockId: string, key: string, value: any) => {
    setFormData({
      ...formData,
      blocks: formData.blocks.map((block: any) => block.id === blockId ? { ...block, [key]: value } : block),
    });
  };

  const handleRemoveBlock = (blockId: string) => {
    setFormData({
      ...formData,
      blocks: formData.blocks.map((block: any) => block.id === blockId ? { ...block, visible: false } : block),
    });
    if (selectedBlockId === blockId) setSelectedBlockId(null);
  };

  const handleAddTextBlock = () => {
    const newBlock = {
      id: `texto-livre-${Date.now()}`,
      type: 'text',
      label: 'Texto Livre',
      page: activePage,
      x: 12,
      y: 12,
      width: 420,
      fontSize: 22,
      fontFamily: 'serif',
      fontWeight: '700',
      textAlign: 'center',
      color: formData.corTexto || '#1e293b',
      content: 'Novo texto',
      visible: true,
    };
    setFormData({ ...formData, blocks: [...formData.blocks, newBlock] });
    setSelectedBlockId(newBlock.id);
  };

  const handleAddConfiguredSignature = (source: 'diretoriaGeral' | 'secretaria', label: string) => {
    const newBlock = {
      id: `assinatura-${source}-${Date.now()}`,
      type: 'signatureImage',
      label,
      page: activePage,
      x: activePage === 'verso' ? (source === 'secretaria' ? 25 : 64.5) : 40,
      y: activePage === 'verso' ? 84.4 : 72,
      width: 210,
      signatureSource: source,
      signatureImageUrl: '',
      signatureBlend: true,
      visible: true,
    };
    setFormData({ ...formData, blocks: [...formData.blocks, newBlock] });
    setSelectedBlockId(newBlock.id);
  };

  const handleFinalSave = () => {
    if (!formData.nome.trim()) {
      alert('Por favor, digite o nome do modelo.');
      return;
    }
    onSave(buildFinalDiplomaData(formData));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedVar(text);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  return (
    <div className="bg-white rounded-[2.5rem] p-4 lg:p-8 border border-slate-200 shadow-sm animate-fadeIn flex flex-col min-h-[calc(100vh-10rem)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 pb-6 border-b border-slate-100 gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onCancel} className="p-3 bg-slate-50 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-colors shrink-0"><ArrowLeft size={20} /></button>
          <div>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2"><LayoutTemplate size={24} className="text-purple-600" />Editar Modelo de Certificado</h3>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Personalize o layout de forma 100% interativa e flexível (Canva-style)</p>
          </div>
        </div>
        <button onClick={handleFinalSave} className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 w-full sm:w-auto justify-center"><Save size={16} /> Salvar Modelo</button>
      </div>

      <div className="flex flex-col xl:flex-row gap-8 flex-1">
        <DiplomaEditorSidebar
          formData={formData}
          activeTab={activeTab}
          selectedBlock={selectedBlock}
          inactiveBlocks={inactiveBlocks}
          copiedVar={copiedVar}
          isUploading={isUploading}
          signatureSourceOptions={signatureSourceOptions}
          setFormData={setFormData}
          setActiveTab={setActiveTab}
          onChange={handleChange}
          onUploadBackground={handleUploadBg}
          onUploadBlockImage={handleUploadBlockImage}
          onUploadSignature={handleUploadSignature}
          onAddTextBlock={handleAddTextBlock}
          onAddConfiguredSignature={handleAddConfiguredSignature}
          onAddBlock={handleAddBlock}
          onUpdateBlock={handleUpdateBlockProp}
          onRemoveBlock={handleRemoveBlock}
          onCopy={copyToClipboard}
        />
        <DiplomaEditorPreview
          formData={formData}
          activeTab={activeTab}
          previewMode={previewMode}
          selectedBlockId={selectedBlockId}
          zoomLevel={zoomLevel}
          setFormData={setFormData}
          setPreviewMode={setPreviewMode}
          setSelectedBlockId={setSelectedBlockId}
          onZoomOut={() => setZoomLevel(prev => Math.max(20, prev - 5))}
          onZoomIn={() => setZoomLevel(prev => Math.min(150, prev + 5))}
        />
      </div>
    </div>
  );
};

export default DiplomaEditor;
