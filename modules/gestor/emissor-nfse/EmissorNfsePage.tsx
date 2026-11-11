import React, { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { AlertCircle, BriefcaseBusiness, Building2, CheckCheck, ClipboardList, FileText, FileX2, Layers } from 'lucide-react';
import FinancialUnderlineTabs from '../financeiro/components/FinancialUnderlineTabs';
import { useNfseWorkspace } from './hooks/useNfseQueries';
import { useNfseRealtime } from './hooks/useNfseRealtime';
import { NfseAccessError, NfseUnavailableError } from './services/nfse.errors';
import { getNfseCurrentMonth, isNfseScopeValid } from './types/nfse.scope';
import type { NfseScope, NfseTab } from './types/nfse.types';
import { NfseTabContext } from './components/NfseTabContext';
import NfseDataState from './components/NfseDataState';
import { formatNfseMoney } from './components/nfse.presentation';
import NfseMonthPicker from './preparar/NfseMonthPicker';
import { NfsePreparationDraftProvider } from './preparar/hooks/NfsePreparationDraft';
import './nfse.css';
import ToastNotification, { useToast } from '../components/ToastNotification';
import { useNfseQueue } from './fila/useNfseQueue';
import { useNfseQueueRealtime } from './fila/useNfseQueueRealtime';
import { useNfseEnvironment } from './hooks/useNfseEnvironment';
import NfseEnvironmentStatus from './components/NfseEnvironmentStatus';
import { useNfseNationalHealth } from './health/useNfseNationalHealth';

const PrepararNfseTab = lazy(() => import('./preparar/PrepararNfseTab'));
const PendentesNfseTab = lazy(() => import('./pendentes/PendentesNfseTab'));
const EmitidasNfseTab = lazy(() => import('./emitidas/EmitidasNfseTab'));
const CanceladasNfseTab = lazy(() => import('./canceladas/CanceladasNfseTab'));
const ErrosNfseTab = lazy(() => import('./erros/ErrosNfseTab'));
const ModelosNfseTab = lazy(() => import('./modelos/ModelosNfseTab'));
const ServicosParceirosNfseTab = lazy(() => import('./parceiros/ServicosParceirosNfseTab'));
type NfseWorkspaceTab = NfseTab | 'servicos';

export interface EmissorNfsePageProps {
  poloId?: string | null;
  poloName?: string;
  isMatriz: boolean;
  contextKey?: string;
}

const tabs = [
  { id: 'preparar' as const, label: 'Preparar emissão', icon: <ClipboardList size={15} /> },
  { id: 'servicos' as const, label: 'Serviços', icon: <BriefcaseBusiness size={15} /> },
  { id: 'pendentes' as const, label: 'Pendentes', icon: <Layers size={15} /> },
  { id: 'emitidas' as const, label: 'Emitidas', icon: <CheckCheck size={15} /> },
  { id: 'canceladas' as const, label: 'Canceladas', icon: <FileX2 size={15} /> },
  { id: 'erros' as const, label: 'Erros', icon: <AlertCircle size={15} /> },
  { id: 'modelos' as const, label: 'Modelos', icon: <FileText size={15} /> },
];

const NfseWorkspace: React.FC<EmissorNfsePageProps> = ({ poloId, poloName, isMatriz, contextKey }) => {
  const [tab, setTab] = useState<NfseWorkspaceTab>('preparar');
  const [environment] = useNfseEnvironment({ poloId, contextKey });
  const [month, setMonth] = useState(getNfseCurrentMonth);
  const monthInputRef = useRef<HTMLInputElement>(null);
  const scope = useMemo<NfseScope | null>(() => {
    const candidate = { poloId: poloId || '', contextKey: contextKey || '', environment, month };
    return isNfseScopeValid(candidate) ? candidate : null;
  }, [poloId, contextKey, month, environment]);
  const query = useNfseWorkspace(scope);
  const queue = useNfseQueue(scope);
  const health = useNfseNationalHealth(scope);
  const { toasts, removeToast, toast } = useToast();
  useNfseRealtime(scope);
  useNfseQueueRealtime(scope);
  const accessDenied = query.error instanceof NfseAccessError;
  const workspace = accessDenied ? undefined : query.data;
  const unavailable = !scope || query.error instanceof NfseUnavailableError;
  const canRead = Boolean(scope && workspace && !accessDenied);
  const context = { scope, workspace, unavailable, canRead, loading: Boolean(scope && query.isPending),
    canPrepareQueue: Boolean(!queue.error && queue.data), onPrepared: (message?: string) => {
    setTab('pendentes');
    toast.success('Preparação confirmada', message || 'Os documentos foram adicionados aos pendentes.');
  } };
  const summary = workspace?.summary;
  const selectedPolo = Boolean(poloId && poloId !== 'todos');


  return (
    <div className="nfse-workspace">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <header className="nfse-header">
        <div><h1>Emissor NFS-e</h1><p>{poloName || (selectedPolo ? 'Polo selecionado' : 'Selecione um polo para acompanhar as notas')}{isMatriz && selectedPolo ? ' · Matriz' : ''}</p></div>
        <div className="flex max-w-full flex-wrap items-center gap-3">
          <div className="nfse-field min-w-[185px]">
            <NfseMonthPicker id="nfse-workspace-month" value={month} onChange={setMonth} inputRef={monthInputRef} />
          </div>
          <NfseEnvironmentStatus environment={environment} enabled={Boolean(scope)}
            workspace={query} queue={queue} health={health} />
        </div>
      </header>
      {!selectedPolo ? <div className="nfse-notice"><Building2 size={18} /><div><strong>Selecione um polo</strong><p>Use o seletor de unidade no cabeçalho para preparar e acompanhar as notas do estabelecimento.</p></div></div>
        : !scope ? <div className="nfse-notice"><AlertCircle size={18} /><div><strong>{!month ? 'Escolha o mês dos recebimentos' : 'Contexto de acesso indisponível'}</strong><p>{!month ? 'Informe um mês válido para consultar os recebimentos e as notas deste polo.' : 'Selecione novamente a unidade no cabeçalho antes de consultar os registros fiscais.'}</p></div></div>
: query.error && !unavailable ? <NfseDataState error={query.error} onRetry={() => void query.refetch()} /> : null}
      <div className="nfse-summary" aria-label="Resumo fiscal do período">
        <div className="nfse-metric"><span>Recebido no mês</span><strong>{formatNfseMoney(summary?.receivedAmount)}</strong></div>
        <div className="nfse-metric"><span>Pendentes</span><strong>{!queue.error && queue.data ? queue.data.summary.preparedCount : summary?.pendingCount ?? '—'}</strong></div>
        <div className="nfse-metric"><span>Emitidas</span><strong>{summary?.issuedCount ?? '—'}</strong></div>
        <div className="nfse-metric"><span>Com erro</span><strong>{summary?.errorCount ?? '—'}</strong></div>
      </div>
      <FinancialUnderlineTabs items={tabs} value={tab} onChange={setTab} ariaLabel="Abas do Emissor NFS-e" idPrefix="nfse" compact />
      <div role="tabpanel" id={`nfse-${tab}-panel`} aria-labelledby={`nfse-${tab}-tab`} tabIndex={0} className="nfse-tab-panel">
        <NfseTabContext.Provider key={`${poloId}:${contextKey}:${environment}:${month}`} value={context}>
          <NfsePreparationDraftProvider>
          <Suspense fallback={<NfseDataState loading />}>
            {tab === 'preparar' && <PrepararNfseTab />}
            {tab === 'servicos' && <ServicosParceirosNfseTab />}
            {tab === 'pendentes' && <PendentesNfseTab />}
            {tab === 'emitidas' && <EmitidasNfseTab />}
            {tab === 'canceladas' && <CanceladasNfseTab />}
            {tab === 'erros' && <ErrosNfseTab />}
            {tab === 'modelos' && <ModelosNfseTab />}
          </Suspense>
          </NfsePreparationDraftProvider>
        </NfseTabContext.Provider>
      </div>
    </div>
  );
};

const EmissorNfsePage: React.FC<EmissorNfsePageProps> = (props) => {
  return <NfseWorkspace key={`${props.poloId || 'sem-polo'}:${props.contextKey || 'sem-contexto'}`} {...props} />;
};

export default EmissorNfsePage;

