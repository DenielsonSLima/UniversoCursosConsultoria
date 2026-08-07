import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Archive, ChevronLeft, ChevronRight, LoaderCircle, PackageSearch, RefreshCw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ToastNotification, { useToast } from '../components/ToastNotification';
import { PatrimonioCard } from './components/PatrimonioCard';
import { PatrimonioFormModal } from './components/PatrimonioFormModal';
import { PatrimonioTable } from './components/PatrimonioTable';
import { PatrimonioToolbar } from './components/PatrimonioToolbar';
import { usePatrimonioQueries } from './hooks/usePatrimonioQueries';
import { usePatrimonioRealtime } from './hooks/usePatrimonioRealtime';
import { patrimonioQueryKeys } from './patrimonio.queryKeys';
import { patrimonioService } from './patrimonio.service';
import type { CreatePatrimonioInput, PatrimonioListFilters, PatrimonioViewMode } from './patrimonio.types';

const PAGE_SIZE = 30;

interface PatrimonioPageProps {
  poloId?: string | null;
}

const PatrimonioPage: React.FC<PatrimonioPageProps> = ({ poloId }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tipoProduto, setTipoProduto] = useState('');
  const [offset, setOffset] = useState(0);
  const [viewMode, setViewMode] = useState<PatrimonioViewMode>('cards');
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setOffset(0);
  }, [poloId]);

  const filters = useMemo<PatrimonioListFilters>(() => ({
    poloId: poloId || null,
    search: debouncedSearch,
    tipoProduto,
    limit: PAGE_SIZE,
    offset,
  }), [debouncedSearch, offset, poloId, tipoProduto]);

  const { listQuery } = usePatrimonioQueries(filters);
  usePatrimonioRealtime(poloId);

  const createMutation = useMutation({
    mutationFn: (input: CreatePatrimonioInput) => patrimonioService.create(input),
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: patrimonioQueryKeys.listRoot });
      setIsFormOpen(false);
      toast.success('Patrimônio cadastrado', `${item.descricao || 'O bem'} foi registrado com o total canônico do sistema.`);
    },
    onError: (error: Error) => {
      toast.error('Não foi possível cadastrar o patrimônio', error.message || 'Revise os dados e tente novamente.');
    },
  });

  const result = listQuery.data;
  const items = result?.items || [];
  const pageLimit = result?.limit || PAGE_SIZE;
  const pageOffset = result?.offset ?? offset;
  const total = result?.total || 0;
  const rangeStart = items.length > 0 ? pageOffset + 1 : 0;
  const rangeEnd = pageOffset + items.length;
  const canGoBack = pageOffset > 0;
  const canGoForward = pageOffset + pageLimit < total;
  const isInitialLoading = listQuery.isPending && !result;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setOffset(0);
  };

  const handleTipoProdutoChange = (value: string) => {
    setTipoProduto(value);
    setOffset(0);
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
        {poloId && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-right">
            <p className="text-[9px] font-black uppercase tracking-wider text-blue-600">Registros encontrados</p>
            <p className="text-lg font-black text-[#001a33]">{listQuery.isPending ? '—' : total}</p>
          </div>
        )}
      </header>

      <PatrimonioToolbar
        search={search}
        tipoProduto={tipoProduto}
        viewMode={viewMode}
        isDisabled={!poloId}
        onSearchChange={handleSearchChange}
        onTipoProdutoChange={handleTipoProdutoChange}
        onViewModeChange={setViewMode}
        onCreate={() => setIsFormOpen(true)}
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
          <p className="mx-auto mt-1 max-w-md text-xs font-medium leading-relaxed text-rose-700">{listQuery.error instanceof Error ? listQuery.error.message : 'Tente novamente em instantes.'}</p>
          <button type="button" onClick={() => { void listQuery.refetch(); }} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-rose-700 shadow-sm ring-1 ring-rose-100 transition-colors hover:bg-rose-100"><RefreshCw size={14} />Tentar novamente</button>
        </section>
      ) : items.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
          <Archive size={32} className="mx-auto mb-3 text-slate-400" />
          <h3 className="text-sm font-black text-[#001a33]">Nenhum patrimônio encontrado</h3>
          <p className="mx-auto mt-1 max-w-md text-xs font-medium leading-relaxed text-slate-500">{search || tipoProduto ? 'Ajuste os filtros ou cadastre um novo bem para este polo.' : 'Comece registrando os bens, equipamentos e ativos deste polo.'}</p>
          <button type="button" onClick={() => setIsFormOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#001a33] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white transition-colors hover:bg-[#073b73]"><Archive size={14} />Cadastrar patrimônio</button>
        </section>
      ) : (
        <>
          {viewMode === 'cards' ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <div key={item.id}>
                  <PatrimonioCard item={item} />
                </div>
              ))}
            </div>
          ) : (
            <PatrimonioTable items={items} />
          )}

          <footer className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium text-slate-500">
              {listQuery.isFetching ? 'Atualizando registros...' : `Exibindo ${rangeStart}–${rangeEnd} de ${total} registros`}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setOffset((current) => Math.max(0, current - pageLimit))} disabled={!canGoBack || listQuery.isFetching} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"><ChevronLeft size={14} />Anterior</button>
              <button type="button" onClick={() => setOffset((current) => current + pageLimit)} disabled={!canGoForward || listQuery.isFetching} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45">Próxima<ChevronRight size={14} /></button>
            </div>
          </footer>
        </>
      )}

      {isFormOpen && poloId && (
        <PatrimonioFormModal
          poloId={poloId}
          isPending={createMutation.isPending}
          onClose={() => setIsFormOpen(false)}
          onSubmit={(input) => createMutation.mutate(input)}
        />
      )}
    </div>
  );
};

export default PatrimonioPage;
