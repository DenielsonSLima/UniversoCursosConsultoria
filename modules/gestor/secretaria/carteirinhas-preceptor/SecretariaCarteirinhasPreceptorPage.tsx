import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import CanonicalDocumentPreviewModal from '../shared/CanonicalDocumentPreviewModal';
import { getSecretariaErrorMessage } from '../shared/secretaria-error';
import { isCarteirinhaPreceptorRenderPayloadReady } from './components/CarteirinhaPreceptorDocumentRenderer';
import CarteirinhasPreceptorEmissionWorkspace from './components/CarteirinhasPreceptorEmissionWorkspace';
import { useCarteirinhasPreceptorWorkspace } from './hooks/useCarteirinhasPreceptorWorkspace';
import { usePrepararEmissaoCarteirinhaPreceptor } from './hooks/usePrepararEmissaoCarteirinhaPreceptor';
import type {
  CarteirinhaPreceptorEmissionMode,
  CarteirinhaPreceptorPreparationResult,
  CarteirinhaPreceptorTarget,
} from './types/carteirinhas-preceptor.types';

interface SecretariaCarteirinhasPreceptorPageProps {
  poloId?: string | null;
}

const getActivePoloId = (poloId?: string | null) => {
  if (poloId && poloId !== 'todos') return poloId;
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem('current_polo_id')
    || window.sessionStorage.getItem('active_polo_id');
};

const createIdempotencyKey = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
};

const SecretariaCarteirinhasPreceptorPage: React.FC<SecretariaCarteirinhasPreceptorPageProps> = ({ poloId }) => {
  const activePoloId = getActivePoloId(poloId);
  const workspaceQuery = useCarteirinhasPreceptorWorkspace(activePoloId);
  const prepareMutation = usePrepararEmissaoCarteirinhaPreceptor();
  const { toasts, removeToast, toast } = useToast();
  const [mode, setMode] = useState<CarteirinhaPreceptorEmissionMode>('INDIVIDUAL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProfessorIds, setSelectedProfessorIds] = useState<string[]>([]);
  const [customMessage, setCustomMessage] = useState('');
  const [result, setResult] = useState<CarteirinhaPreceptorPreparationResult | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const requestRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

  const workspace = workspaceQuery.data;
  const selectableIds = useMemo(
    () => new Set((workspace?.targets || []).filter((target) => target.elegivel).map((target) => target.professorId)),
    [workspace?.targets],
  );

  const changeMode = (nextMode: CarteirinhaPreceptorEmissionMode) => {
    setMode(nextMode);
    setSelectedProfessorIds((current) => nextMode === 'INDIVIDUAL' ? current.slice(0, 1) : current);
    setResult(null);
    setPreviewIndex(null);
  };

  const toggleTarget = (target: CarteirinhaPreceptorTarget) => {
    if (!target.elegivel) return;
    setResult(null);
    setPreviewIndex(null);
    setSelectedProfessorIds((current) => {
      if (mode === 'INDIVIDUAL') return current[0] === target.professorId ? [] : [target.professorId];
      return current.includes(target.professorId)
        ? current.filter((id) => id !== target.professorId)
        : [...current, target.professorId];
    });
  };

  const selectVisible = (targets: CarteirinhaPreceptorTarget[]) => {
    if (mode === 'INDIVIDUAL') return;
    const visibleIds = targets.filter((target) => target.elegivel).map((target) => target.professorId);
    setResult(null);
    setPreviewIndex(null);
    setSelectedProfessorIds((current) => {
      const everyVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => current.includes(id));
      if (everyVisibleSelected) return current.filter((id) => !visibleIds.includes(id));
      return [...new Set([...current, ...visibleIds])];
    });
  };

  const prepare = async () => {
    if (!activePoloId) {
      toast.error('Polo não selecionado', 'Selecione um polo antes de preparar a emissão.');
      return;
    }
    const professorIds = selectedProfessorIds.filter((id) => selectableIds.has(id));
    if (!professorIds.length) {
      toast.info('Selecione um professor', 'A seleção deve conter um professor liberado pelo serviço.');
      return;
    }
    const fingerprint = JSON.stringify([mode, [...professorIds].sort(), customMessage.trim()]);
    if (requestRef.current?.fingerprint !== fingerprint) {
      requestRef.current = { fingerprint, idempotencyKey: createIdempotencyKey() };
    }

    try {
      const prepared = await prepareMutation.mutateAsync({
        poloId: activePoloId,
        mode,
        professorIds,
        customMessage: mode === 'PERSONALIZADO' ? customMessage.trim() : '',
        idempotencyKey: requestRef.current.idempotencyKey,
      });
      setResult(prepared);
      setPreviewIndex(null);
      toast.success('Emissão preparada', prepared.message || 'O retorno canônico da carteirinha já está disponível.');
    } catch (error) {
      toast.error('Não foi possível preparar a carteirinha', getSecretariaErrorMessage(error));
    }
  };

  if (!activePoloId) {
    return (
      <section className="flex min-h-[360px] flex-col items-center justify-center rounded-[2rem] border border-amber-100 bg-white p-8 text-center shadow-sm">
        <AlertTriangle className="text-amber-500" size={42} />
        <h3 className="mt-4 text-lg font-black text-[#001a33]">Selecione um polo para continuar</h3>
        <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-slate-500">A carteirinha de preceptor depende de um vínculo profissional ativo dentro de uma unidade.</p>
      </section>
    );
  }

  if (workspaceQuery.isLoading) {
    return (
      <div className="flex min-h-[390px] flex-col items-center justify-center text-center">
        <Loader2 className="animate-spin text-violet-700" size={42} />
        <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Carregando professores autorizados...</p>
      </div>
    );
  }

  if (workspaceQuery.isError || !workspace) {
    return (
      <section className="flex min-h-[360px] flex-col items-center justify-center rounded-[2rem] border border-rose-100 bg-white p-8 text-center shadow-sm">
        <AlertTriangle className="text-rose-500" size={42} />
        <h3 className="mt-4 text-lg font-black text-[#001a33]">Workspace de preceptores indisponível</h3>
        <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-slate-500">{getSecretariaErrorMessage(workspaceQuery.error, 'Não foi possível carregar os professores permitidos para este polo.')}</p>
        <button type="button" onClick={() => { void workspaceQuery.refetch(); }} className="mt-5 rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white hover:bg-violet-800">
          Tentar novamente
        </button>
      </section>
    );
  }

  return (
    <>
      <CarteirinhasPreceptorEmissionWorkspace
        workspace={workspace}
        mode={mode}
        onModeChange={changeMode}
        searchTerm={searchTerm}
        onSearchTermChange={(value) => { setSearchTerm(value); }}
        selectedProfessorIds={selectedProfessorIds}
        onToggleTarget={toggleTarget}
        onSelectVisible={selectVisible}
        customMessage={customMessage}
        onCustomMessageChange={(value) => { setCustomMessage(value); setResult(null); }}
        onPrepare={() => { void prepare(); }}
        isPreparing={prepareMutation.isPending}
        result={result}
        onPreview={(emissionId) => {
          const index = result?.documents.findIndex((document) => document.emissionId === emissionId) ?? -1;
          if (index >= 0) setPreviewIndex(index);
        }}
      />
      {result && previewIndex !== null && (
        <CanonicalDocumentPreviewModal
          items={result.documents}
          initialIndex={previewIndex}
          title="Prévia de carteirinhas de preceptor"
          accentClassName="bg-violet-700 hover:bg-violet-800"
          fileNamePrefix="carteirinhas-preceptor"
          onClose={() => setPreviewIndex(null)}
          isRenderable={isCarteirinhaPreceptorRenderPayloadReady}
          createPdf={async (documents, options) => {
            const { createCarteirinhasPreceptorPdf } = await import('./carteirinhas-preceptor.pdf');
            return createCarteirinhasPreceptorPdf(documents, options);
          }}
        />
      )}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </>
  );
};

export default SecretariaCarteirinhasPreceptorPage;
