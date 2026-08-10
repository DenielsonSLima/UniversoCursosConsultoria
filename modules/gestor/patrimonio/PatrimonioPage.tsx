import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Archive, ChevronLeft, ChevronRight, LoaderCircle, PackageSearch, RefreshCw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { caixaQueryKeys } from '../caixa/caixa.service';
import ToastNotification, { useToast } from '../components/ToastNotification';
import { getPatrimonioActionAvailability } from './patrimonio.actions';
import { PatrimonioCard } from './components/PatrimonioCard';
import { PatrimonioDeleteDialog } from './components/PatrimonioDeleteDialog';
import { PatrimonioFormModal } from './components/PatrimonioFormModal';
import { PatrimonioTable } from './components/PatrimonioTable';
import { PatrimonioToolbar } from './components/PatrimonioToolbar';
import { PatrimonioWriteOffModal } from './components/PatrimonioWriteOffModal';
import { usePatrimonioQueries } from './hooks/usePatrimonioQueries';
import { usePatrimonioRealtime } from './hooks/usePatrimonioRealtime';
import { patrimonioProductTypeQueryKeys } from './patrimonio-product-types.service';
import { getPatrimonioErrorMessage, isPatrimonioConflictError } from './patrimonio.errors';
import { patrimonioQueryKeys } from './patrimonio.queryKeys';
import { patrimonioService } from './patrimonio.service';
import type {
  CreatePatrimonioInput,
  PatrimonioItem,
  PatrimonioListFilters,
  PatrimonioListResult,
  PatrimonioPendingAction,
  PatrimonioStatusFilter,
  PatrimonioViewMode,
  RemovePatrimonioInput,
  UpdatePatrimonioInput,
  WriteOffPatrimonioInput,
} from './patrimonio.types';

const PAGE_SIZE = 32;

interface PatrimonioPageProps {
  poloId?: string | null;
  isGlobal?: boolean;
  canManageProductTypes?: boolean;
}

const PatrimonioPage: React.FC<PatrimonioPageProps> = ({
  poloId,
  isGlobal = false,
  canManageProductTypes = false,
}) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tipoProduto, setTipoProduto] = useState('');
  const [status, setStatus] = useState<PatrimonioStatusFilter>('ativos');
  const [offset, setOffset] = useState(0);
  const [viewMode, setViewMode] = useState<PatrimonioViewMode>('cards');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PatrimonioItem | null>(null);
  const [writeOffItem, setWriteOffItem] = useState<PatrimonioItem | null>(null);
  const [removeItem, setRemoveItem] = useState<PatrimonioItem | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setOffset(0);
    setTipoProduto('');
    setStatus('ativos');
    setIsFormOpen(false);
    setEditingItem(null);
    setWriteOffItem(null);
    setRemoveItem(null);
  }, [poloId]);

  useEffect(() => {
    if (!isGlobal && status === 'excluidos') {
      setStatus('ativos');
      setOffset(0);
    }
  }, [isGlobal, status]);

  const filters = useMemo<PatrimonioListFilters>(() => ({
    poloId: poloId || null,
    search: debouncedSearch,
    tipoProduto,
    status,
    limit: PAGE_SIZE,
    offset,
  }), [debouncedSearch, offset, poloId, status, tipoProduto]);

  const { listQuery, productTypesQuery } = usePatrimonioQueries(filters);
  usePatrimonioRealtime(poloId);

  const result = listQuery.data;
  const productTypes = productTypesQuery.data || [];
  const items = result?.items || [];
  const pageLimit = result?.limit || PAGE_SIZE;
  const pageOffset = result?.offset ?? offset;
  const total = result?.total || 0;
  const rangeStart = items.length > 0 ? pageOffset + 1 : 0;
  const rangeEnd = pageOffset + items.length;
  const canGoBack = pageOffset > 0;
  const canGoForward = pageOffset + pageLimit < total;
  const isInitialLoading = listQuery.isPending && !result;

  const invalidateAfterMutation = useCallback(async (activePoloId: string, itemId?: string) => {
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: patrimonioQueryKeys.listRoot }),
      queryClient.invalidateQueries({ queryKey: caixaQueryKeys.patrimonioResumosForPolo(activePoloId) }),
      queryClient.invalidateQueries({ queryKey: caixaQueryKeys.patrimonioResumosForPolo('todos') }),
    ];
    if (itemId) invalidations.push(queryClient.invalidateQueries({ queryKey: patrimonioQueryKeys.detail(itemId) }));
    await Promise.all(invalidations);
  }, [queryClient]);

  const refreshConflictedItem = useCallback(async (
    itemId: string,
    setItem: React.Dispatch<React.SetStateAction<PatrimonioItem | null>>,
  ) => {
    const currentListKey = patrimonioQueryKeys.list(filters);
    await queryClient.refetchQueries({ queryKey: currentListKey, exact: true, type: 'active' });
    const refreshedResult = queryClient.getQueryData<PatrimonioListResult>(currentListKey);
    const latestItem = refreshedResult?.items.find((item) => item.id === itemId);

    if (!latestItem) {
      setItem(null);
      return false;
    }

    setItem(latestItem);
    return true;
  }, [filters, queryClient]);

  const handleItemError = useCallback(async (
    error: unknown,
    itemId: string,
    setItem: React.Dispatch<React.SetStateAction<PatrimonioItem | null>>,
    fallback: string,
  ) => {
    if (isPatrimonioConflictError(error)) {
      const remainsInCurrentList = await refreshConflictedItem(itemId, setItem);
      toast.error(
        'O patrimônio foi atualizado em outro acesso',
        remainsInCurrentList
          ? 'Os dados atuais foram recarregados. Revise e confirme novamente.'
          : 'O registro saiu desta página ou filtro. Localize-o novamente antes de continuar.',
      );
      return;
    }
    toast.error(fallback, getPatrimonioErrorMessage(error, 'Tente novamente em instantes.'));
  }, [refreshConflictedItem, toast]);

  const moveToPreviousPageWhenEmpty = useCallback((willLeaveCurrentFilter: boolean) => {
    if (willLeaveCurrentFilter && items.length === 1 && offset > 0) {
      setOffset((current) => Math.max(0, current - pageLimit));
    }
  }, [items.length, offset, pageLimit]);

  const createMutation = useMutation({
    mutationFn: (input: CreatePatrimonioInput) => patrimonioService.create(input),
    onSuccess: async (item) => {
      await invalidateAfterMutation(item.poloId || poloId || 'todos', item.id);
      setIsFormOpen(false);
      toast.success('Patrimônio cadastrado', `${item.descricao || 'O bem'} foi registrado com o total canônico do sistema.`);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: patrimonioProductTypeQueryKeys.root });
      toast.error('Não foi possível cadastrar o patrimônio', getPatrimonioErrorMessage(error, 'Revise os dados e tente novamente.'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdatePatrimonioInput) => patrimonioService.update(input),
    onSuccess: async (item) => {
      await invalidateAfterMutation(item.poloId, item.id);
      setEditingItem(null);
      toast.success('Patrimônio atualizado', `${item.descricao} foi atualizado e o histórico da alteração foi preservado.`);
    },
    onError: async (error, input) => {
      await handleItemError(error, input.patrimonioId, setEditingItem, 'Não foi possível editar o patrimônio');
    },
  });

  const writeOffMutation = useMutation({
    mutationFn: (input: WriteOffPatrimonioInput) => patrimonioService.writeOff(input),
    onSuccess: async (item) => {
      const leavesFilter = status === 'ativos' && item.status === 'baixado';
      moveToPreviousPageWhenEmpty(leavesFilter);
      await invalidateAfterMutation(item.poloId, item.id);
      setWriteOffItem(null);
      toast.success('Perda registrada', item.status === 'baixado' ? `${item.descricao} foi baixado integralmente.` : `${item.descricao} teve uma baixa parcial registrada.`);
    },
    onError: async (error, input) => {
      await handleItemError(error, input.patrimonioId, setWriteOffItem, 'Não foi possível registrar a perda');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (input: RemovePatrimonioInput) => patrimonioService.remove(input),
    onSuccess: async (item) => {
      moveToPreviousPageWhenEmpty(status !== 'todos' && status !== 'excluidos');
      await invalidateAfterMutation(item.poloId, item.id);
      setRemoveItem(null);
      toast.success('Cadastro excluído', `${item.descricao} foi removido das posições ativas e preservado para auditoria.`);
    },
    onError: async (error, input) => {
      await handleItemError(error, input.patrimonioId, setRemoveItem, 'Não foi possível excluir o patrimônio');
    },
  });

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setOffset(0);
  };

  const handleTipoProdutoChange = (value: string) => {
    setTipoProduto(value);
    setOffset(0);
  };

  const handleStatusChange = (value: PatrimonioStatusFilter) => {
    if (value === 'excluidos' && !isGlobal) return;
    setStatus(value);
    setOffset(0);
  };

  const getActions = useCallback((item: PatrimonioItem) => (
    getPatrimonioActionAvailability(item, isGlobal)
  ), [isGlobal]);

  const getPendingAction = useCallback((item: PatrimonioItem): PatrimonioPendingAction | undefined => {
    if (updateMutation.isPending && updateMutation.variables?.patrimonioId === item.id) return 'edit';
    if (writeOffMutation.isPending && writeOffMutation.variables?.patrimonioId === item.id) return 'writeOff';
    if (removeMutation.isPending && removeMutation.variables?.patrimonioId === item.id) return 'remove';
    return undefined;
  }, [removeMutation.isPending, removeMutation.variables, updateMutation.isPending, updateMutation.variables, writeOffMutation.isPending, writeOffMutation.variables]);

  const openEdit = (item: PatrimonioItem) => {
    const availability = getActions(item);
    if (!availability.edit.enabled) return;
    updateMutation.reset();
    setEditingItem(item);
  };

  const openWriteOff = (item: PatrimonioItem) => {
    const availability = getActions(item);
    if (!availability.writeOff.enabled) return;
    writeOffMutation.reset();
    setWriteOffItem(item);
  };

  const openRemove = (item: PatrimonioItem) => {
    const availability = getActions(item);
    if (!availability.remove.enabled) return;
    removeMutation.reset();
    setRemoveItem(item);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <header className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Archive size={23} /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Gestão por polo</p>
            <h2 className="mt-0.5 text-2xl font-black tracking-tight text-[#001a33]">Patrimônio</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Bens, equipamentos e ativos registrados para o polo selecionado.</p>
          </div>
        </div>
        {poloId ? (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-right">
            <p className="text-[9px] font-black uppercase tracking-wider text-blue-600">Registros encontrados</p>
            <p className="text-lg font-black text-[#001a33]">{listQuery.isPending ? '—' : total}</p>
          </div>
        ) : null}
      </header>

      <PatrimonioToolbar
        search={search}
        tipoProduto={tipoProduto}
        status={status}
        productTypes={productTypes}
        areProductTypesLoading={productTypesQuery.isPending}
        viewMode={viewMode}
        canViewDeleted={isGlobal}
        isDisabled={!poloId}
        onSearchChange={handleSearchChange}
        onTipoProdutoChange={handleTipoProdutoChange}
        onStatusChange={handleStatusChange}
        onViewModeChange={setViewMode}
        onCreate={() => { createMutation.reset(); setIsFormOpen(true); }}
      />

      {!poloId ? (
        <section className="rounded-2xl border border-amber-100 bg-amber-50 px-6 py-12 text-center">
          <PackageSearch size={30} className="mx-auto mb-3 text-amber-600" />
          <h3 className="text-sm font-black text-amber-900">Selecione um polo</h3>
          <p className="mx-auto mt-1 max-w-md text-xs font-medium leading-relaxed text-amber-700">O patrimônio é isolado por polo. Escolha um polo no seletor do Gestor para consultar ou cadastrar os bens.</p>
        </section>
      ) : isInitialLoading ? (
        <section className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-100 bg-white">
          <div className="flex flex-col items-center gap-3 text-slate-500"><LoaderCircle size={28} className="animate-spin text-blue-600" /><span className="text-xs font-bold">Carregando patrimônio...</span></div>
        </section>
      ) : listQuery.isError ? (
        <section className="rounded-2xl border border-rose-100 bg-rose-50 px-6 py-10 text-center">
          <AlertCircle size={28} className="mx-auto mb-3 text-rose-600" />
          <h3 className="text-sm font-black text-rose-900">Não foi possível carregar o patrimônio</h3>
          <p className="mx-auto mt-1 max-w-md text-xs font-medium leading-relaxed text-rose-700">{getPatrimonioErrorMessage(listQuery.error, 'Tente novamente em instantes.')}</p>
          <button type="button" onClick={() => { void listQuery.refetch(); }} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-rose-700 shadow-sm ring-1 ring-rose-100 transition-colors hover:bg-rose-100"><RefreshCw size={14} />Tentar novamente</button>
        </section>
      ) : items.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
          <Archive size={32} className="mx-auto mb-3 text-slate-400" />
          <h3 className="text-sm font-black text-[#001a33]">Nenhum patrimônio encontrado</h3>
          <p className="mx-auto mt-1 max-w-md text-xs font-medium leading-relaxed text-slate-500">{search || tipoProduto || status !== 'ativos' ? 'Ajuste os filtros ou consulte outra situação patrimonial.' : 'Comece registrando os bens, equipamentos e ativos deste polo.'}</p>
          <button type="button" onClick={() => { createMutation.reset(); setIsFormOpen(true); }} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#001a33] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white transition-colors hover:bg-[#073b73]"><Archive size={14} />Cadastrar patrimônio</button>
        </section>
      ) : (
        <>
          {viewMode === 'cards' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {items.map((item) => (
                <div key={item.id} className="h-full">
                  <PatrimonioCard
                    item={item}
                    actions={getActions(item)}
                    pendingAction={getPendingAction(item)}
                    onEdit={openEdit}
                    onWriteOff={openWriteOff}
                    onRemove={openRemove}
                  />
                </div>
              ))}
            </div>
          ) : (
            <PatrimonioTable
              items={items}
              getActions={getActions}
              getPendingAction={getPendingAction}
              onEdit={openEdit}
              onWriteOff={openWriteOff}
              onRemove={openRemove}
            />
          )}

          <footer className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium text-slate-500">{listQuery.isFetching ? 'Atualizando registros...' : `Exibindo ${rangeStart}–${rangeEnd} de ${total} registros`}</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setOffset((current) => Math.max(0, current - pageLimit))} disabled={!canGoBack || listQuery.isFetching} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"><ChevronLeft size={14} />Anterior</button>
              <button type="button" onClick={() => setOffset((current) => current + pageLimit)} disabled={!canGoForward || listQuery.isFetching} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45">Próxima<ChevronRight size={14} /></button>
            </div>
          </footer>
        </>
      )}

      {isFormOpen && poloId ? (
        <PatrimonioFormModal
          mode="create"
          poloId={poloId}
          productTypes={productTypes}
          areProductTypesLoading={productTypesQuery.isPending}
          productTypesError={productTypesQuery.isError ? getPatrimonioErrorMessage(productTypesQuery.error, 'Não foi possível carregar os tipos de produto.') : undefined}
          canManageProductTypes={canManageProductTypes}
          isPending={createMutation.isPending}
          errorMessage={createMutation.isError ? getPatrimonioErrorMessage(createMutation.error, 'Não foi possível cadastrar o patrimônio.') : undefined}
          onClose={() => setIsFormOpen(false)}
          onSubmit={(input) => createMutation.mutate(input)}
        />
      ) : null}

      {editingItem ? (
        <PatrimonioFormModal
          mode="edit"
          item={editingItem}
          poloId={editingItem.poloId}
          productTypes={productTypes}
          areProductTypesLoading={productTypesQuery.isPending}
          productTypesError={productTypesQuery.isError ? getPatrimonioErrorMessage(productTypesQuery.error, 'Não foi possível carregar os tipos de produto.') : undefined}
          canManageProductTypes={canManageProductTypes}
          isPending={updateMutation.isPending}
          errorMessage={updateMutation.isError ? getPatrimonioErrorMessage(updateMutation.error, 'Não foi possível editar o patrimônio.') : undefined}
          onClose={() => setEditingItem(null)}
          onSubmit={(input) => updateMutation.mutate(input)}
        />
      ) : null}

      {writeOffItem ? (
        <PatrimonioWriteOffModal
          item={writeOffItem}
          isPending={writeOffMutation.isPending}
          errorMessage={writeOffMutation.isError ? getPatrimonioErrorMessage(writeOffMutation.error, 'Não foi possível registrar a perda.') : undefined}
          onClose={() => setWriteOffItem(null)}
          onSubmit={(input) => writeOffMutation.mutate(input)}
        />
      ) : null}

      {removeItem ? (
        <PatrimonioDeleteDialog
          item={removeItem}
          isPending={removeMutation.isPending}
          errorMessage={removeMutation.isError ? getPatrimonioErrorMessage(removeMutation.error, 'Não foi possível excluir o patrimônio.') : undefined}
          onClose={() => setRemoveItem(null)}
          onSubmit={(input) => removeMutation.mutate(input)}
        />
      ) : null}
    </div>
  );
};

export default PatrimonioPage;
