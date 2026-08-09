import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import CanonicalDocumentPreviewModal from '../shared/CanonicalDocumentPreviewModal';
import { getSecretariaErrorMessage } from '../shared/secretaria-error';
import { isContratoAlunoRenderPayloadReady } from './components/ContratoAlunoDocumentRenderer';
import ContratosAlunoEmissionWorkspace from './components/ContratosAlunoEmissionWorkspace';
import { useContratosAlunoWorkspace } from './hooks/useContratosAlunoWorkspace';
import { usePrepararEmissaoContratoAluno } from './hooks/usePrepararEmissaoContratoAluno';
import type {
  ContratoAlunoEmissionMode,
  ContratoAlunoPreparationResult,
  ContratoAlunoTarget,
} from './types/contratos-aluno.types';

interface SecretariaContratosAlunoPageProps {
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

const SecretariaContratosAlunoPage: React.FC<SecretariaContratosAlunoPageProps> = ({ poloId }) => {
  const activePoloId = getActivePoloId(poloId);
  const workspaceQuery = useContratosAlunoWorkspace(activePoloId);
  const prepareMutation = usePrepararEmissaoContratoAluno();
  const { toasts, removeToast, toast } = useToast();
  const [mode, setMode] = useState<ContratoAlunoEmissionMode>('INDIVIDUAL');
  const [searchTerm, setSearchTerm] = useState('');
  const [batchModality, setBatchModality] = useState('');
  const [turmaId, setTurmaId] = useState('');
  const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState<string[]>([]);
  const [customMessage, setCustomMessage] = useState('');
  const [result, setResult] = useState<ContratoAlunoPreparationResult | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const requestRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

  const workspace = workspaceQuery.data;
  const selectableIds = useMemo(
    () => new Set((workspace?.targets || []).filter((target) => target.elegivel).map((target) => target.enrollmentId)),
    [workspace?.targets],
  );

  const changeMode = (nextMode: ContratoAlunoEmissionMode) => {
    setMode(nextMode);
    setSearchTerm('');
    setBatchModality('');
    setTurmaId('');
    setSelectedEnrollmentIds([]);
    setCustomMessage('');
    setResult(null);
    setPreviewIndex(null);
    requestRef.current = null;
  };

  const toggleTarget = (target: ContratoAlunoTarget) => {
    if (!target.elegivel) return;
    setResult(null);
    setPreviewIndex(null);
    setSelectedEnrollmentIds((current) => {
      if (mode === 'INDIVIDUAL') return current[0] === target.enrollmentId ? [] : [target.enrollmentId];
      return current.includes(target.enrollmentId)
        ? current.filter((id) => id !== target.enrollmentId)
        : [...current, target.enrollmentId];
    });
  };

  const replaceSelection = (enrollmentIds: string[]) => {
    setResult(null);
    setPreviewIndex(null);
    requestRef.current = null;
    setSelectedEnrollmentIds([...new Set(enrollmentIds.filter((id) => selectableIds.has(id)))]);
  };

  const prepare = async () => {
    if (!activePoloId) {
      toast.error('Polo não selecionado', 'Selecione um polo antes de preparar a emissão.');
      return;
    }
    const enrollmentIds = selectedEnrollmentIds.filter((id) => selectableIds.has(id));
    if (!enrollmentIds.length) {
      toast.info('Selecione uma matrícula', 'A seleção deve conter uma matrícula liberada pelo serviço.');
      return;
    }
    const fingerprint = JSON.stringify([mode, [...enrollmentIds].sort(), customMessage.trim()]);
    if (requestRef.current?.fingerprint !== fingerprint) {
      requestRef.current = { fingerprint, idempotencyKey: createIdempotencyKey() };
    }

    try {
      const prepared = await prepareMutation.mutateAsync({
        poloId: activePoloId,
        mode,
        enrollmentIds,
        customMessage: mode === 'PERSONALIZADO' ? customMessage.trim() : '',
        idempotencyKey: requestRef.current.idempotencyKey,
      });
      setResult(prepared);
      setPreviewIndex(prepared.documents.length ? 0 : null);
      toast.success('Emissão preparada', prepared.message || 'O retorno canônico do contrato já está disponível.');
    } catch (error) {
      toast.error('Não foi possível preparar o contrato', getSecretariaErrorMessage(error));
    }
  };

  if (!activePoloId) {
    return (
      <section className="flex min-h-[360px] flex-col items-center justify-center rounded-[2rem] border border-amber-100 bg-white p-8 text-center shadow-sm">
        <AlertTriangle className="text-amber-500" size={42} />
        <h3 className="mt-4 text-lg font-black text-[#001a33]">Selecione um polo para continuar</h3>
        <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-slate-500">A emissão de contrato sempre é autorizada e montada no escopo de uma unidade.</p>
      </section>
    );
  }

  if (workspaceQuery.isLoading) {
    return (
      <div className="flex min-h-[390px] flex-col items-center justify-center text-center">
        <Loader2 className="animate-spin text-blue-600" size={42} />
        <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Carregando contratos autorizados...</p>
      </div>
    );
  }

  if (workspaceQuery.isError || !workspace) {
    return (
      <section className="flex min-h-[360px] flex-col items-center justify-center rounded-[2rem] border border-rose-100 bg-white p-8 text-center shadow-sm">
        <AlertTriangle className="text-rose-500" size={42} />
        <h3 className="mt-4 text-lg font-black text-[#001a33]">Workspace de contratos indisponível</h3>
        <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-slate-500">{getSecretariaErrorMessage(workspaceQuery.error, 'Não foi possível carregar as matrículas permitidas para este polo.')}</p>
        <button type="button" onClick={() => { void workspaceQuery.refetch(); }} className="mt-5 rounded-xl bg-[#001a33] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white hover:bg-blue-800">
          Tentar novamente
        </button>
      </section>
    );
  }

  return (
    <>
      <ContratosAlunoEmissionWorkspace
        workspace={workspace}
        mode={mode}
        onModeChange={changeMode}
        searchTerm={searchTerm}
        onSearchTermChange={(value) => { setSearchTerm(value); }}
        batchModality={batchModality}
        onBatchModalityChange={(value) => { setBatchModality(value); }}
        turmaId={turmaId}
        onTurmaIdChange={(value) => { setTurmaId(value); }}
        selectedEnrollmentIds={selectedEnrollmentIds}
        onToggleTarget={toggleTarget}
        onReplaceSelection={replaceSelection}
        customMessage={customMessage}
        onCustomMessageChange={(value) => { setCustomMessage(value); setResult(null); }}
        onPrepare={() => { void prepare(); }}
        isPreparing={prepareMutation.isPending}
      />
      {result && previewIndex !== null && (
        <CanonicalDocumentPreviewModal
          items={result.documents}
          initialIndex={previewIndex}
          title="Prévia de contratos de aluno"
          accentClassName="bg-blue-600 hover:bg-blue-700"
          fileNamePrefix="contratos-aluno"
          onClose={() => setPreviewIndex(null)}
          isRenderable={isContratoAlunoRenderPayloadReady}
          createPdf={async (documents, options) => {
            const { createContratosAlunoPdf } = await import('./contratos-aluno.pdf');
            return createContratosAlunoPdf(documents, options);
          }}
        />
      )}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </>
  );
};

export default SecretariaContratosAlunoPage;
