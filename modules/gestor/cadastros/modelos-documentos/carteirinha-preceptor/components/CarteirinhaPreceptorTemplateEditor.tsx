import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import CrachaCard from '../../cracha/components/CrachaCard';
import CrachaEditor from '../../cracha/components/CrachaEditor';
import {
  createPreceptorCrachaModel,
  hasPreceptorCrachaLayout,
  serializePreceptorCrachaModel,
} from '../../cracha/components/cracha-editor.model';
import { crachaService } from '../../cracha/cracha.service';
import { DocumentTemplatePageState } from '../../components/DocumentTemplateLoadingState';
import { documentTemplateQueryKeys } from '../../document-template.query-keys';
import { useCarteirinhaPreceptorTemplate } from '../hooks/useCarteirinhaPreceptorTemplate';
import type { ConteudoModeloCarteirinhaPreceptor } from '../types/carteirinha-preceptor.types';

/**
 * O preceptor usa a mesma superfície de edição CR80 do crachá de estágio.
 * A persistência continua no template seguro/versionado de preceptor.
 */
export const CarteirinhaPreceptorTemplateEditor = () => {
  const { templateQuery, saveMutation } = useCarteirinhaPreceptorTemplate();
  const [isEditing, setIsEditing] = useState(false);
  const stageTemplateQuery = useQuery({
    queryKey: documentTemplateQueryKeys.detail('cracha'),
    queryFn: () => crachaService.getTemplate(),
    staleTime: 10 * 60 * 1_000,
    gcTime: 30 * 60 * 1_000,
    retry: 1,
    enabled: Boolean(templateQuery.data),
  });

  const needsStageTemplate = Boolean(
    templateQuery.data && !hasPreceptorCrachaLayout(templateQuery.data.conteudo),
  );

  const model = useMemo(() => {
    if (!templateQuery.data) return null;
    return createPreceptorCrachaModel(
      templateQuery.data.conteudo,
      stageTemplateQuery.data,
    );
  }, [stageTemplateQuery.data, templateQuery.data]);

  const handleSave = async (editedModel: Record<string, unknown>) => {
    const saved = await saveMutation.mutateAsync(
      serializePreceptorCrachaModel(editedModel) as ConteudoModeloCarteirinhaPreceptor,
    );
    if (!saved) throw new Error('O serviço não confirmou a gravação do modelo.');
    setIsEditing(false);
  };

  if (templateQuery.isError) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded-[2rem] border border-rose-100 bg-white p-8 shadow-sm">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto text-rose-600" size={30} />
          <h3 className="mt-4 text-base font-black uppercase text-[#001a33]">Modelo indisponível</h3>
          <p className="mt-2 text-sm font-medium text-slate-500">Não foi possível carregar o modelo canônico do Crachá de Preceptor.</p>
          <button type="button" onClick={() => void templateQuery.refetch()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wider text-white">
            <RefreshCw size={15} /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (templateQuery.isPending || !templateQuery.data || !model || (needsStageTemplate && stageTemplateQuery.isPending)) {
    return <DocumentTemplatePageState title="modelo do Crachá de Preceptor" />;
  }

  if (needsStageTemplate && stageTemplateQuery.isError) {
    return (
      <DocumentTemplatePageState
        title="modelo visual de crachá"
        isError
        onRetry={() => void stageTemplateQuery.refetch()}
      />
    );
  }

  if (isEditing) {
    return (
      <CrachaEditor
        modelo={model}
        variant="preceptor"
        title="Crachá de Preceptor"
        onSave={handleSave}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="animate-fadeIn mx-auto max-w-7xl">
      <section className="mb-6 flex flex-col justify-between gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-700 text-white shadow-lg shadow-cyan-950/15">
            <BadgeCheck size={23} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Crachá de Preceptor</h3>
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-cyan-800">Somente professor</span>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${templateQuery.data.status === 'ATIVO' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {templateQuery.data.status === 'ATIVO' ? 'Ativo' : 'Rascunho'}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-500">Revisão {templateQuery.data.revisao || 0} · mesmo editor, fundo e composição do Crachá de Estágio.</p>
          </div>
        </div>
      </section>

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-cyan-950">
        <ShieldCheck className="mt-0.5 shrink-0" size={19} />
        <p className="text-sm font-semibold leading-relaxed">Os campos dinâmicos usam exclusivamente nome, foto, área, registro e polo do professor. A elegibilidade, validade e QR opaco permanecem validados no servidor no instante da emissão.</p>
      </div>

      {saveMutation.isError ? (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={19} />
          <p className="text-sm font-semibold">{saveMutation.error instanceof Error ? saveMutation.error.message : 'Não foi possível salvar a nova versão.'}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <CrachaCard
          modelo={{ ...model, status: templateQuery.data.status === 'ATIVO' ? 'ativo' : 'inativo' }}
          onEdit={() => setIsEditing(true)}
        />
      </div>
    </div>
  );
};
