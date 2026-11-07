import React, { lazy, Suspense, useMemo, useState } from 'react';
import { AlertCircle, Building2, CheckCheck, ClipboardList, FileText, Layers, ShieldCheck } from 'lucide-react';
import FinancialUnderlineTabs from '../financeiro/components/FinancialUnderlineTabs';
import { useNfseWorkspace } from './hooks/useNfseQueries';
import { useNfseRealtime } from './hooks/useNfseRealtime';
import { NfseUnavailableError } from './services/nfse.errors';
import { getNfseCurrentMonth, isNfseScopeValid } from './types/nfse.scope';
import type { NfseScope, NfseTab } from './types/nfse.types';
import { NfseTabContext } from './components/NfseTabContext';
import NfseDataState from './components/NfseDataState';
import { formatNfseMoney } from './components/nfse.presentation';
import './nfse.css';

const PrepararNfseTab = lazy(() => import('./preparar/PrepararNfseTab'));
const PendentesNfseTab = lazy(() => import('./pendentes/PendentesNfseTab'));
const EmitidasNfseTab = lazy(() => import('./emitidas/EmitidasNfseTab'));
const ErrosNfseTab = lazy(() => import('./erros/ErrosNfseTab'));
const ModelosNfseTab = lazy(() => import('./modelos/ModelosNfseTab'));

export interface EmissorNfsePageProps {
  poloId?: string | null;
  poloName?: string;
  isMatriz: boolean;
  contextKey?: string;
}

const tabs = [
  { id: 'preparar' as const, label: 'Preparar emissão', icon: <ClipboardList size={15} /> },
  { id: 'pendentes' as const, label: 'Pendentes', icon: <Layers size={15} /> },
  { id: 'emitidas' as const, label: 'Emitidas', icon: <CheckCheck size={15} /> },
  { id: 'erros' as const, label: 'Erros', icon: <AlertCircle size={15} /> },
  { id: 'modelos' as const, label: 'Modelos', icon: <FileText size={15} /> },
];

const NfseWorkspace: React.FC<EmissorNfsePageProps> = ({ poloId, poloName, isMatriz, contextKey }) => {
  const [tab, setTab] = useState<NfseTab>('preparar');
  const [month, setMonth] = useState(getNfseCurrentMonth);
  const scope = useMemo<NfseScope | null>(() => {
    const candidate = { poloId: poloId || '', contextKey: contextKey || '', environment: 'HOMOLOGACAO' as const, month };
    return isNfseScopeValid(candidate) ? candidate : null;
  }, [poloId, contextKey, month]);
  const query = useNfseWorkspace(scope);
  useNfseRealtime(scope);
  const workspace = query.error ? undefined : query.data;
  const unavailable = !scope || query.error instanceof NfseUnavailableError;
  const canRead = Boolean(scope && workspace && !query.error);
  const context = { scope, workspace, unavailable, canRead, loading: Boolean(scope && query.isPending), onPrepared: () => setTab('pendentes') };
  const summary = workspace?.summary;
  const selectedPolo = Boolean(poloId && poloId !== 'todos');

  return (
    <div className="nfse-workspace">
      <header className="nfse-header">
        <div><h1>Emissor NFS-e</h1><p>{poloName || (selectedPolo ? 'Polo selecionado' : 'Selecione um polo para acompanhar as notas')}{isMatriz && selectedPolo ? ' · Matriz' : ''}</p></div>
        <div className="grid max-w-full grid-cols-[minmax(0,170px)_auto] items-center gap-3">
          <label className="nfse-field nfse-field-month"><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Mês dos recebimentos" /></label>
          <span className="nfse-environment"><ShieldCheck size={14} />Homologação</span>
        </div>
      </header>
      {!selectedPolo ? <div className="nfse-notice"><Building2 size={18} /><div><strong>Selecione um polo</strong><p>Use o seletor de unidade no cabeçalho para preparar e acompanhar as notas do estabelecimento.</p></div></div>
        : !scope ? <div className="nfse-notice"><AlertCircle size={18} /><div><strong>{!month ? 'Escolha o mês dos recebimentos' : 'Contexto de acesso indisponível'}</strong><p>{!month ? 'Informe um mês válido para consultar os recebimentos e as notas deste polo.' : 'Selecione novamente a unidade no cabeçalho antes de consultar os registros fiscais.'}</p></div></div>
        : workspace?.readiness.status === 'BLOCKED' ? <div className="nfse-notice"><AlertCircle size={18} /><div><strong>Este estabelecimento precisa de configuração</strong><p>{workspace.readiness.message}</p></div></div>
        : query.error && !unavailable ? <NfseDataState error={query.error} onRetry={() => void query.refetch()} /> : null}
      <div className="nfse-summary" aria-label="Resumo fiscal do período">
        <div className="nfse-metric"><span>Recebido no mês</span><strong>{formatNfseMoney(summary?.receivedAmount)}</strong></div>
        <div className="nfse-metric"><span>Pendentes</span><strong>{summary?.pendingCount ?? '—'}</strong></div>
        <div className="nfse-metric"><span>Emitidas</span><strong>{summary?.issuedCount ?? '—'}</strong></div>
        <div className="nfse-metric"><span>Com erro</span><strong>{summary?.errorCount ?? '—'}</strong></div>
      </div>
      <FinancialUnderlineTabs items={tabs} value={tab} onChange={setTab} ariaLabel="Abas do Emissor NFS-e" idPrefix="nfse" compact />
      <div role="tabpanel" id={`nfse-${tab}-panel`} aria-labelledby={`nfse-${tab}-tab`} tabIndex={0} className="nfse-tab-panel">
        <NfseTabContext.Provider key={`${poloId}:${contextKey}:${month}`} value={context}>
          <Suspense fallback={<NfseDataState loading />}>
            {tab === 'preparar' && <PrepararNfseTab />}
            {tab === 'pendentes' && <PendentesNfseTab />}
            {tab === 'emitidas' && <EmitidasNfseTab />}
            {tab === 'erros' && <ErrosNfseTab />}
            {tab === 'modelos' && <ModelosNfseTab />}
          </Suspense>
        </NfseTabContext.Provider>
      </div>
    </div>
  );
};

const EmissorNfsePage: React.FC<EmissorNfsePageProps> = (props) => {
  return <NfseWorkspace key={`${props.poloId || 'sem-polo'}:${props.contextKey || 'sem-contexto'}`} {...props} />;
};

export default EmissorNfsePage;
