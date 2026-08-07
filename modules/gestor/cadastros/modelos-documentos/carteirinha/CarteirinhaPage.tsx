import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import CarteirinhaCard from './components/CarteirinhaCard';
import CarteirinhaEditor from './components/CarteirinhaEditor';
import { carteirinhaService, type CarteirinhaTemplate } from './carteirinha.service';
import { assinaturasService } from '../../../configuracoes/assinaturas/assinaturas.service';
import ToastNotification, { useToast } from '../../../components/ToastNotification';
import { DocumentTemplatePageState } from '../components/DocumentTemplateLoadingState';
import { useDocumentBackgroundReadiness } from '../hooks/useDocumentBackgroundReadiness';
import { documentTemplateQueryKeys } from '../document-template.query-keys';

const INITIAL_MODELOS: CarteirinhaTemplate[] = [
  {
    id: '1',
    nome: 'Carteira de Identificação Estudantil (CIE) - Lei 12.933',
    tipoCurso: 'Cursos Técnicos',
    status: 'ativo',
    hasVerso: true,
    corPrimaria: '#0284c7', // Sky 600
    corSecundaria: '#e0f2fe',
    textoFrente: 'DOCUMENTO DO ESTUDANTE',
    textoVerso: 'Este documento é padronizado nacionalmente nos termos da Lei nº 12.933/2013 e garante o direito de meia-entrada em eventos artísticos-culturais e esportivos.\n\nUso pessoal e intransferível.\nVerifique a validade via QR Code.',
  }
];

const CarteirinhaPage: React.FC = () => {
  const queryClient = useQueryClient();
  const templateQuery = useQuery({
    queryKey: documentTemplateQueryKeys.detail('carteirinha'),
    queryFn: () => carteirinhaService.getTemplate(),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
  const [localTemplate, setLocalTemplate] = useState<CarteirinhaTemplate | null>(null);
  const [isDeletedLocally, setIsDeletedLocally] = useState(false);
  const [editingModelo, setEditingModelo] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);
  const { toasts, removeToast, toast } = useToast();

  useEffect(() => {
    assinaturasService.syncSignatures().catch(err => console.error('Erro ao sincronizar assinaturas:', err));
  }, []);

  const modelo = useMemo(() => {
    const template = localTemplate ?? templateQuery.data;
    if (!template) return null;
    return { ...INITIAL_MODELOS[0], ...template, id: template.id || INITIAL_MODELOS[0].id };
  }, [localTemplate, templateQuery.data]);
  const backgrounds = useDocumentBackgroundReadiness(
    modelo?.bgFrenteUrl,
    modelo?.hasVerso ? modelo.bgVersoUrl : null,
  );
  const modelos = isDeletedLocally || !modelo ? [] : [modelo];

  const handleEdit = (modelo: any) => {
    setEditingModelo(modelo);
    setIsCreating(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este modelo?')) {
      setIsDeletedLocally(true);
    }
  };

  const handleSave = async (savedModelo: any) => {
    try {
      const saved = await carteirinhaService.saveTemplate(savedModelo);
      if (!saved) {
        throw new Error('O serviço não confirmou a gravação do modelo.');
      }
      queryClient.setQueryData(documentTemplateQueryKeys.detail('carteirinha'), savedModelo);
      setLocalTemplate(savedModelo);
      setIsDeletedLocally(false);
      toast.success('Modelo Salvo', 'O modelo de carteirinha foi salvo com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar template:', err);
      toast.error('Erro ao salvar', 'Não foi possível salvar o modelo de carteirinha.');
    }
    setEditingModelo(null);
    setIsCreating(false);
  };

  const handleCancel = () => {
    setEditingModelo(null);
    setIsCreating(false);
  };

  if (templateQuery.isPending || backgrounds.status === 'loading') {
    return <DocumentTemplatePageState title="modelo de carteirinha" />;
  }

  if (templateQuery.isError || backgrounds.status === 'error') {
    return (
      <DocumentTemplatePageState
        title="modelo de carteirinha"
        isError
        onRetry={() => {
          if (templateQuery.isError) void templateQuery.refetch();
          else backgrounds.retry();
        }}
      />
    );
  }

  if (editingModelo || isCreating) {
    return (
      <CarteirinhaEditor 
        modelo={editingModelo} 
        onSave={handleSave} 
        onCancel={handleCancel} 
      />
    );
  }

  return (
    <div className="animate-fadeIn max-w-7xl mx-auto">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">CIE / Carteirinha</h3>
          <p className="text-slate-500 text-sm mt-1">Configuração da Identidade Estudantil CR80 baseada na Lei 12.933/2013.</p>
        </div>
      </div>

      {/* Info Notice about Lei da Meia Entrada */}
      <div className="bg-sky-50 border border-sky-100 p-4 rounded-2xl mb-8 flex items-start gap-4">
        <div className="p-2 bg-sky-100 text-sky-600 rounded-lg shrink-0 mt-0.5">
          <CreditCard size={20} />
        </div>
        <div>
          <h4 className="text-sm font-black text-sky-900 uppercase tracking-tight mb-1">Sobre a Emissão</h4>
          <p className="text-xs text-sky-800 leading-relaxed font-medium">
            Segundo a regulamentação, têm direito ao Documento do Estudante (CIE) com meia-entrada os matriculados na educação infantil, ensino fundamental, médio, <strong>técnico</strong> e <strong>superior</strong>. Estudantes de <span className="font-bold underline">Cursos Livres</span> não estão amparados, mas você pode criar um modelo de uso interno.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {modelos.map(modelo => (
          <CarteirinhaCard 
            key={modelo.id} 
            modelo={modelo} 
            onEdit={handleEdit} 
            onDelete={handleDelete} 
          />
        ))}
      </div>
    </div>
  );
};

export default CarteirinhaPage;
