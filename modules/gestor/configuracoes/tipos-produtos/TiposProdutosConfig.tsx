import React, { useMemo, useRef, useState } from 'react';
import {
  ArchiveX,
  Edit3,
  LoaderCircle,
  PackageOpen,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import {
  type PatrimonioProductType,
  patrimonioProductTypeQueryKeys,
  patrimonioProductTypesService,
} from '../../patrimonio/patrimonio-product-types.service';
import { createPatrimonioRequestId } from '../../patrimonio/patrimonio.service';
import {
  ProductTypeConfirmDialog,
  type ProductTypeConfirmAction,
} from './components/ProductTypeConfirmDialog';
import {
  ProductTypeFormDialog,
  type ProductTypeFormValues,
} from './components/ProductTypeFormDialog';

interface TiposProdutosConfigProps {
  poloId?: string | null;
}

interface ConfirmState {
  action: ProductTypeConfirmAction;
  item: PatrimonioProductType;
}

interface SaveMutationInput {
  item?: PatrimonioProductType | null;
  values: ProductTypeFormValues;
}

const DIACRITICS_REGEX = /[\u0300-\u036f]/g;

const normalizeSearchText = (value?: string | null) => (value || '')
  .normalize('NFD')
  .replace(DIACRITICS_REGEX, '')
  .toLocaleLowerCase('pt-BR')
  .trim();

const isActive = (item: PatrimonioProductType) => normalizeSearchText(item.status) === 'ativo';

const formatUpdatedAt = (value?: string | null) => {
  if (!value) return 'Atualização não informada';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Atualização não informada';
  return `Atualizado em ${parsed.toLocaleDateString('pt-BR')} às ${parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

const getErrorMessage = (error: unknown) => (
  error instanceof Error && error.message
    ? error.message
    : 'Tente novamente em instantes.'
);

interface ProductTypeActionsProps {
  item: PatrimonioProductType;
  isBusy: boolean;
  onEdit: (item: PatrimonioProductType, trigger: React.ElementRef<'button'>) => void;
  onConfirm: (action: ProductTypeConfirmAction, item: PatrimonioProductType, trigger: React.ElementRef<'button'>) => void;
}

function ProductTypeActions({
  item,
  isBusy,
  onEdit,
  onConfirm,
}: ProductTypeActionsProps) {
  const active = isActive(item);
  const deleteUnavailableMessage = item.usageCount > 0
    ? `Em uso por ${item.usageCount} patrimônio${item.usageCount === 1 ? '' : 's'}. Inative para preservar o histórico.`
    : 'Este tipo não pode ser excluído.';

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5" aria-label={`Ações de ${item.nome}`}>
      <button
        type="button"
        onClick={(event) => onEdit(item, event.currentTarget)}
        disabled={isBusy}
        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
        aria-label={`Editar ${item.nome}`}
        title="Editar tipo"
      >
        <Edit3 size={16} />
      </button>
      <button
        type="button"
        onClick={(event) => onConfirm(active ? 'deactivate' : 'activate', item, event.currentTarget)}
        disabled={isBusy}
        className={`rounded-lg p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${active ? 'text-slate-400 hover:bg-amber-50 hover:text-amber-700' : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-700'}`}
        aria-label={`${active ? 'Inativar' : 'Ativar'} ${item.nome}`}
        title={active ? 'Inativar tipo' : 'Ativar tipo'}
      >
        {active ? <PowerOff size={16} /> : <Power size={16} />}
      </button>
      <button
        type="button"
        onClick={(event) => onConfirm('remove', item, event.currentTarget)}
        disabled={isBusy || !item.canDelete}
        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-35"
        aria-label={`Excluir ${item.nome}`}
        aria-describedby={!item.canDelete ? `delete-help-${item.id}` : undefined}
        title={item.canDelete ? 'Excluir tipo' : deleteUnavailableMessage}
      >
        <Trash2 size={16} />
      </button>
      {!item.canDelete ? <span id={`delete-help-${item.id}`} className="sr-only">{deleteUnavailableMessage}</span> : null}
    </div>
  );
}

const TiposProdutosConfig: React.FC<TiposProdutosConfigProps> = ({ poloId }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const returnFocusRef = useRef<React.ElementRef<'button'> | null>(null);
  const newButtonRef = useRef<React.ElementRef<'button'> | null>(null);
  const createReplayRef = useRef<{ signature: string | null; requestId: string }>({
    signature: null,
    requestId: createPatrimonioRequestId(),
  });
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState<PatrimonioProductType | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const catalogQuery = useQuery({
    queryKey: patrimonioProductTypeQueryKeys.list(poloId || null, true),
    queryFn: () => patrimonioProductTypesService.list(poloId as string, true),
    enabled: Boolean(poloId),
    staleTime: 20_000,
  });

  const invalidateCatalog = async () => {
    await queryClient.invalidateQueries({ queryKey: patrimonioProductTypeQueryKeys.root });
  };

  const closeOverlay = () => {
    setIsFormOpen(false);
    setEditingItem(null);
    setConfirmState(null);
    window.requestAnimationFrame(() => {
      const returnTarget = returnFocusRef.current?.isConnected
        ? returnFocusRef.current
        : newButtonRef.current;
      returnTarget?.focus();
    });
  };

  const saveMutation = useMutation({
    mutationFn: ({ item, values }: SaveMutationInput) => {
      if (item) {
        return patrimonioProductTypesService.update({
          id: item.id,
          poloId: poloId as string,
          nome: values.nome,
          descricao: values.descricao,
          status: item.status,
          expectedUpdatedAt: item.updatedAt,
        });
      }

      const signature = JSON.stringify([values.nome.trim(), values.descricao.trim()]);
      if (createReplayRef.current.signature === null) {
        createReplayRef.current.signature = signature;
      } else if (createReplayRef.current.signature !== signature) {
        createReplayRef.current = {
          signature,
          requestId: createPatrimonioRequestId(),
        };
      }

      return patrimonioProductTypesService.create({
        requestId: createReplayRef.current.requestId,
        poloId: poloId as string,
        nome: values.nome,
        descricao: values.descricao,
      });
    },
    onSuccess: async (savedItem) => {
      await invalidateCatalog();
      closeOverlay();
      toast.success(
        editingItem ? 'Tipo atualizado' : 'Tipo cadastrado',
        `${savedItem.nome} está disponível no catálogo de patrimônio.`,
      );
    },
    onError: async (error) => {
      await invalidateCatalog();
      if (editingItem) closeOverlay();
      toast.error('Não foi possível salvar o tipo', getErrorMessage(error));
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ action, item }: ConfirmState) => patrimonioProductTypesService.update({
      id: item.id,
      poloId: poloId as string,
      nome: item.nome,
      descricao: item.descricao,
      status: (action === 'activate' ? 'ativo' : 'inativo') as PatrimonioProductType['status'],
      expectedUpdatedAt: item.updatedAt,
    }),
    onSuccess: async (savedItem) => {
      await invalidateCatalog();
      closeOverlay();
      toast.success(
        isActive(savedItem) ? 'Tipo ativado' : 'Tipo inativado',
        isActive(savedItem)
          ? `${savedItem.nome} voltou a aparecer nos novos cadastros.`
          : `${savedItem.nome} foi retirado dos novos cadastros sem alterar o histórico.`,
      );
    },
    onError: async (error) => {
      await invalidateCatalog();
      closeOverlay();
      toast.error('Não foi possível alterar o status', getErrorMessage(error));
    },
  });

  const removeMutation = useMutation({
    mutationFn: (item: PatrimonioProductType) => patrimonioProductTypesService.remove({
      id: item.id,
      poloId: poloId as string,
      expectedUpdatedAt: item.updatedAt,
    }),
    onSuccess: async () => {
      const removedName = confirmState?.item.nome || 'O tipo';
      await invalidateCatalog();
      closeOverlay();
      toast.success('Tipo excluído', `${removedName} foi removido do catálogo.`);
    },
    onError: async (error) => {
      await invalidateCatalog();
      closeOverlay();
      toast.error('Não foi possível excluir o tipo', getErrorMessage(error));
    },
  });

  const items = catalogQuery.data || [];
  const normalizedSearch = normalizeSearchText(search);
  const filteredItems = useMemo(() => {
    if (!normalizedSearch) return items;
    return items.filter((item) => normalizeSearchText(
      `${item.nome} ${item.descricao || ''} ${item.status}`,
    ).includes(normalizedSearch));
  }, [items, normalizedSearch]);
  const activeCount = items.reduce((total, item) => total + (isActive(item) ? 1 : 0), 0);
  const inactiveCount = items.length - activeCount;
  const isMutating = saveMutation.isPending || statusMutation.isPending || removeMutation.isPending;

  const openNewForm = (trigger: React.ElementRef<'button'>) => {
    returnFocusRef.current = trigger;
    createReplayRef.current = {
      signature: null,
      requestId: createPatrimonioRequestId(),
    };
    setEditingItem(null);
    setIsFormOpen(true);
  };

  const openEditForm = (item: PatrimonioProductType, trigger: React.ElementRef<'button'>) => {
    returnFocusRef.current = trigger;
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const openConfirmation = (
    action: ProductTypeConfirmAction,
    item: PatrimonioProductType,
    trigger: React.ElementRef<'button'>,
  ) => {
    if (action === 'remove' && !item.canDelete) return;
    returnFocusRef.current = trigger;
    setConfirmState({ action, item });
  };

  const confirmAction = () => {
    if (!confirmState || isMutating) return;
    if (confirmState.action === 'remove') {
      removeMutation.mutate(confirmState.item);
      return;
    }
    statusMutation.mutate(confirmState);
  };

  if (!poloId) {
    return (
      <section className="rounded-2xl border border-amber-100 bg-amber-50 px-6 py-12 text-center">
        <ArchiveX size={30} className="mx-auto text-amber-600" />
        <h2 className="mt-3 text-lg font-black text-amber-950">Polo matriz não identificado</h2>
        <p className="mx-auto mt-1 max-w-lg text-sm font-medium leading-relaxed text-amber-700">
          Selecione a matriz no topo do Portal de Gestão para administrar os tipos de produtos.
        </p>
      </section>
    );
  }

  return (
    <div className="animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
            <PackageOpen size={24} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700">Catálogo de patrimônio</p>
            <h2 className="mt-0.5 text-2xl font-black tracking-tight text-[#001a33]">Tipos de produtos</h2>
            <p className="mt-1 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
              Organize as opções usadas no cadastro de bens. Tipos inativos continuam preservados no histórico.
            </p>
          </div>
        </div>
        <button
          ref={newButtonRef}
          type="button"
          onClick={(event) => openNewForm(event.currentTarget)}
          disabled={isMutating}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wide text-white shadow-md shadow-blue-950/15 transition-colors hover:bg-[#073b73] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          <Plus size={16} />
          Novo tipo
        </button>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Resumo dos tipos de produtos">
        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total cadastrado</p>
          <p className="mt-1 text-xl font-black text-[#001a33]">{catalogQuery.isPending ? '—' : items.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Ativos</p>
          <p className="mt-1 text-xl font-black text-emerald-800">{catalogQuery.isPending ? '—' : activeCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Inativos</p>
          <p className="mt-1 text-xl font-black text-slate-700">{catalogQuery.isPending ? '—' : inactiveCount}</p>
        </div>
      </section>

      <div className="relative mt-6 max-w-xl">
        <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome, descrição ou status..."
          aria-label="Buscar tipos de produtos"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold text-slate-700 outline-none transition-colors placeholder:font-medium placeholder:text-slate-400 focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-100"
        />
      </div>

      {catalogQuery.isPending ? (
        <div role="status" className="mt-6 flex min-h-64 flex-col items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-slate-500">
          <LoaderCircle size={28} className="animate-spin text-cyan-700" />
          <p className="mt-3 text-xs font-black uppercase tracking-wide">Carregando catálogo...</p>
        </div>
      ) : catalogQuery.isError ? (
        <div role="alert" className="mt-6 rounded-2xl border border-rose-100 bg-rose-50 px-6 py-10 text-center">
          <ArchiveX size={28} className="mx-auto text-rose-600" />
          <h3 className="mt-3 text-sm font-black text-rose-950">Não foi possível carregar os tipos</h3>
          <p className="mx-auto mt-1 max-w-lg text-xs font-medium leading-relaxed text-rose-700">{getErrorMessage(catalogQuery.error)}</p>
          <button
            type="button"
            onClick={() => { void catalogQuery.refetch(); }}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wide text-rose-700 shadow-sm ring-1 ring-rose-100 transition-colors hover:bg-rose-100"
          >
            <RefreshCw size={14} />
            Tentar novamente
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-12 text-center">
          <PackageOpen size={30} className="mx-auto text-slate-400" />
          <h3 className="mt-3 text-sm font-black text-[#001a33]">
            {items.length === 0 ? 'Nenhum tipo cadastrado' : 'Nenhum resultado encontrado'}
          </h3>
          <p className="mx-auto mt-1 max-w-md text-xs font-medium leading-relaxed text-slate-500">
            {items.length === 0
              ? 'Cadastre o primeiro tipo para organizar os novos patrimônios.'
              : 'Tente buscar por outro nome, descrição ou status.'}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-3 md:hidden">
            {filteredItems.map((item) => (
              <article key={item.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${isActive(item) ? 'border-slate-100' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-black text-[#001a33]">{item.nome}</h3>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{item.descricao || 'Sem descrição.'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${isActive(item) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {isActive(item) ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
                  <div className="min-w-0 text-[10px] font-semibold text-slate-400">
                    <p>{item.usageCount} patrimônio{item.usageCount === 1 ? '' : 's'}</p>
                    <p className="mt-0.5 truncate" title={formatUpdatedAt(item.updatedAt)}>{formatUpdatedAt(item.updatedAt)}</p>
                  </div>
                  <ProductTypeActions item={item} isBusy={isMutating} onEdit={openEditForm} onConfirm={openConfirmation} />
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-4">Tipo de produto</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4 text-right">Uso</th>
                  <th className="px-5 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-cyan-50/35">
                    <td className="px-5 py-4">
                      <p className="max-w-lg text-sm font-black text-[#001a33]">{item.nome}</p>
                      <p className="mt-0.5 max-w-lg text-xs font-medium text-slate-500">{item.descricao || 'Sem descrição.'}</p>
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">{formatUpdatedAt(item.updatedAt)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${isActive(item) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${isActive(item) ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {isActive(item) ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right text-xs font-black text-slate-600">
                      {item.usageCount} patrimônio{item.usageCount === 1 ? '' : 's'}
                    </td>
                    <td className="px-5 py-4">
                      <ProductTypeActions item={item} isBusy={isMutating} onEdit={openEditForm} onConfirm={openConfirmation} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {isFormOpen ? (
        <ProductTypeFormDialog
          item={editingItem}
          isPending={saveMutation.isPending}
          onClose={closeOverlay}
          onSubmit={(values) => saveMutation.mutate({ item: editingItem, values })}
        />
      ) : null}

      {confirmState ? (
        <ProductTypeConfirmDialog
          action={confirmState.action}
          itemName={confirmState.item.nome}
          usageCount={confirmState.item.usageCount}
          isPending={statusMutation.isPending || removeMutation.isPending}
          onClose={closeOverlay}
          onConfirm={confirmAction}
        />
      ) : null}
    </div>
  );
};

export default TiposProdutosConfig;
