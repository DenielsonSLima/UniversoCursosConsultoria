import React, { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import type { ResponsavelLegal } from './responsaveis.contract';
import {
  createResponsaveisLegaisScope,
  responsaveisLegaisQueryKeys,
} from './responsaveis.query-keys';
import { responsaveisLegaisService } from './responsaveis.service';
import {
  MISSING_RESPONSAVEIS_SCOPE,
} from './responsaveis-tab.helpers';
import type { ResponsaveisTabProps } from './responsaveis-tab.types';
import { useResponsaveisTabActions } from './hooks/useResponsaveisTabActions';
import ResponsavelDetailsPanel from './components/ResponsavelDetailsPanel';
import ResponsaveisList from './components/ResponsaveisList';
import ResponsaveisToolbar from './components/ResponsaveisToolbar';

const ResponsaveisTab: React.FC<ResponsaveisTabProps> = ({ poloId, includeGlobal, toast }) => {
  const queryScope = useMemo(
    () => createResponsaveisLegaisScope(poloId, includeGlobal),
    [includeGlobal, poloId],
  );
  const queryKeyScope = queryScope || MISSING_RESPONSAVEIS_SCOPE;
  const scopeIdentity = queryScope
    ? `${queryScope.poloId}:${queryScope.includeGlobal ? 'global' : 'local'}`
    : 'escopo-ausente';

  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('todos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);

  const listQuery = useInfiniteQuery({
    queryKey: responsaveisLegaisQueryKeys.list(queryKeyScope, busca, status),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      if (!queryScope) throw new Error('Selecione um polo válido para carregar responsáveis.');
      return responsaveisLegaisService.listar({
        scope: queryScope,
        busca,
        status,
        limite: 50,
        cursor: pageParam as string | null,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    staleTime: 30_000,
    retry: false,
    enabled: Boolean(queryScope),
  });

  const detailQuery = useQuery({
    queryKey: responsaveisLegaisQueryKeys.detail(queryKeyScope, selectedId || 'sem-selecao'),
    queryFn: () => {
      if (!queryScope || !selectedId) {
        throw new Error('O escopo do responsável não está disponível.');
      }
      return responsaveisLegaisService.obter(selectedId, queryScope);
    },
    enabled: Boolean(queryScope && selectedId),
    retry: false,
  });

  const alunosQuery = useQuery({
    queryKey: responsaveisLegaisQueryKeys.alunosParaVinculo(queryKeyScope),
    queryFn: () => {
      if (!queryScope) throw new Error('O escopo para listar alunos não está disponível.');
      return responsaveisLegaisService.listarAlunosParaVinculo(queryScope);
    },
    enabled: Boolean(queryScope && selectedId && showLinkForm),
    staleTime: 60_000,
    retry: false,
  });

  const items = useMemo(() => {
    const uniqueItems = new Map<string, ResponsavelLegal>();
    for (const page of listQuery.data?.pages || []) {
      for (const item of page.items) uniqueItems.set(item.id, item);
    }
    return [...uniqueItems.values()];
  }, [listQuery.data?.pages]);

  const listAccess = listQuery.data?.pages[0] || null;
  const selected = detailQuery.data || null;
  const alunosOrdenados = alunosQuery.data || [];
  const hasVerificationFields = Boolean(selected?.cpf?.trim() && selected?.email?.trim());
  // A capacidade vem pronta da RPC; o frontend apenas a representa e a mutação
  // continua sendo revalidada pelo serviço no escopo explícito selecionado.
  const canRegisterVerification = selected?.canVerify === true;

  const actions = useResponsaveisTabActions({
    queryScope,
    scopeIdentity,
    selectedId,
    setSelectedId,
    showLinkForm,
    setShowLinkForm,
    selected,
    canRegisterVerification,
    hasVerificationFields,
    toast,
  });

  if (!queryScope) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <div className="flex items-start gap-3 text-amber-900">
          <ShieldAlert className="mt-0.5 shrink-0" size={20} />
          <div>
            <h2 className="text-sm font-black">Selecione um polo para consultar responsáveis</h2>
            <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800">
              Nenhuma consulta ou alteração é enviada sem um polo explícito para o serviço autorizado.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <ResponsaveisToolbar
        hasListAccess={Boolean(listAccess)}
        canManageGlobal={listAccess?.canManageGlobal === true}
        canCreate={listAccess?.canCreate === true}
        busca={busca}
        onBuscaChange={setBusca}
        status={status}
        onStatusChange={setStatus}
        onRefresh={() => void listQuery.refetch()}
        creation={actions.creation}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
        <ResponsaveisList
          items={items}
          selectedId={selectedId}
          isPending={listQuery.isPending}
          isError={listQuery.isError}
          hasNextPage={listQuery.hasNextPage === true}
          isFetchingNextPage={listQuery.isFetchingNextPage}
          onSelect={actions.selectResponsavel}
          onRetry={() => void listQuery.refetch()}
          onLoadMore={() => void listQuery.fetchNextPage()}
        />

        <ResponsavelDetailsPanel
          selectedId={selectedId}
          selected={selected}
          scope={queryScope}
          detailPending={detailQuery.isPending}
          detailError={detailQuery.isError}
          onRetryDetail={() => void detailQuery.refetch()}
          alunos={alunosOrdenados}
          alunosPending={alunosQuery.isPending}
          alunosError={alunosQuery.isError}
          onRetryAlunos={() => void alunosQuery.refetch()}
          canRegisterVerification={canRegisterVerification}
          hasVerificationFields={hasVerificationFields}
          actions={actions}
          toast={toast}
        />
      </div>
    </section>
  );
};

export default ResponsaveisTab;
