import React, { useEffect, useState } from 'react';
import { ArrowLeft, LayoutTemplate, Save } from 'lucide-react';
import { supabase } from '../../../../../../lib/supabase';
import ToastNotification, { useToast } from '../../../../components/ToastNotification';
import { usePoloInstitutionalData } from '../../../../../shared/polo-institutional/use-polo-institutional-data';
import CarteirinhaEditorPreviewPanel from './CarteirinhaEditorPreviewPanel';
import CarteirinhaEditorSidebar from './CarteirinhaEditorSidebar';
import type {
  CarteirinhaEditorFormData,
  CarteirinhaEditorTab,
  CarteirinhaPreviewMode,
  CarteirinhaUploadField,
} from './carteirinha-editor.types';

interface CarteirinhaEditorProps {
  modelo: any;
  onSave: (modelo: any) => void;
  onCancel: () => void;
}

const createInitialFormData = (modelo: any): CarteirinhaEditorFormData => {
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
    posicoes: base.posicoes || null,
  };
};

const CarteirinhaEditor: React.FC<CarteirinhaEditorProps> = ({ modelo, onSave, onCancel }) => {
  const { toasts, removeToast, toast } = useToast();
  const [formData, setFormData] = useState(() => createInitialFormData(modelo));
  const [activeTab, setActiveTab] = useState<CarteirinhaEditorTab>('config');
  const [previewMode, setPreviewMode] = useState<CarteirinhaPreviewMode>('ambos');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isUploading, setIsUploading] = useState(false);
  const activePoloId = sessionStorage.getItem('current_polo_id') || sessionStorage.getItem('active_polo_id');
  const { data: institutionalData } = usePoloInstitutionalData(activePoloId);
  const previewAluno = institutionalData ? {
    nome: 'ANA CLARA DOS SANTOS E SILVA',
    cpf: '123.456.789-00',
    rg: '12.345.678-9',
    nascimento: '15/08/2005',
    matricula: '2026100123',
    curso: formData.tipoCurso === 'Cursos Livres' ? 'Design Gráfico para Web' : 'Técnico em Informática',
    instituicao: institutionalData.poloNome || 'Universo Cursos e Consultoria',
    validade: '31/03/2027',
    tipoDocumento: 'RG',
    validationCode: 'CIE-AB12-CD34-EF56',
    poloRazaoSocial: institutionalData.razaoSocial,
    poloCnpj: institutionalData.cnpj,
    poloTelefone: institutionalData.telefone,
  } : undefined;

  useEffect(() => {
    if (activeTab === 'frente') setPreviewMode('frente');
    else if (activeTab === 'verso' && formData.hasVerso) setPreviewMode('verso');
    else setPreviewMode(formData.hasVerso ? 'ambos' : 'frente');
  }, [activeTab, formData.hasVerso]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = event.target;
    if (type === 'checkbox') {
      const checked = (event.target as HTMLInputElement).checked;
      setFormData({ ...formData, [name]: checked });
    } else {
      setFormData({ ...formData, [name]: name === 'startNumber' ? Number.parseInt(value, 10) || 0 : value });
    }
  };

  const handleUploadFile = async (event: React.ChangeEvent<HTMLInputElement>, fieldName: CarteirinhaUploadField) => {
    const file = event.target.files?.[0];
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
      const { data, error } = await supabase.storage.from('documentos').upload(filePath, file, {
        cacheControl: '31536000',
        contentType: file.type || undefined,
        upsert: true,
      });
      if (error) throw error;

      const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(data.path);
      setFormData((current) => ({ ...current, [fieldName]: urlData.publicUrl }));
      toast.success('Upload Concluído', 'Imagem enviada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao fazer upload:', error);
      toast.error('Erro no Upload', error.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <div className="flex min-h-[calc(100vh-10rem)] flex-col rounded-[2.5rem] border border-slate-200 bg-white p-4 shadow-sm animate-fadeIn lg:p-8">
        <div className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <button onClick={onCancel} className="shrink-0 rounded-xl bg-slate-50 p-3 text-slate-400 transition-colors hover:bg-pink-50 hover:text-pink-600"><ArrowLeft size={20} /></button>
            <div><h3 className="flex items-center gap-2 text-xl font-black uppercase tracking-tight text-[#001a33]"><LayoutTemplate size={24} className="text-pink-600" />{modelo ? 'Editar Modelo de Carteirinha' : 'Novo Modelo de Carteirinha'}</h3><p className="mt-1 text-sm font-bold uppercase tracking-widest text-slate-500">Personalize o layout e as cores da CIE</p></div>
          </div>
          <button onClick={() => onSave(formData)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-6 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-900/20 transition-colors hover:bg-blue-900 sm:w-auto"><Save size={16} />{modelo ? 'Salvar Alterações' : 'Criar Modelo'}</button>
        </div>
        <div className="flex flex-1 flex-col gap-8 xl:flex-row">
          <CarteirinhaEditorSidebar activeTab={activeTab} formData={formData} handleChange={handleChange} handleUploadFile={handleUploadFile} institutionalData={institutionalData} isUploading={isUploading} setActiveTab={setActiveTab} setFormData={setFormData} />
          <CarteirinhaEditorPreviewPanel formData={formData} onZoomIn={() => setZoomLevel((current) => Math.min(200, current + 10))} onZoomOut={() => setZoomLevel((current) => Math.max(50, current - 10))} previewAluno={previewAluno} previewMode={previewMode} setFormData={setFormData} setPreviewMode={setPreviewMode} zoomLevel={zoomLevel} />
        </div>
      </div>
    </>
  );
};

export default CarteirinhaEditor;
