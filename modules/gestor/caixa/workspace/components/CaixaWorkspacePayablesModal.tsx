import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ReceiptText, X } from 'lucide-react';
import { formatCaixaCompetencia } from '../../caixa.formatters.ts';
import { caixaWorkspacePayablesQueryOptions } from '../caixa-workspace-payables.queries.ts';
import type { CaixaWorkspacePayablesFilter } from '../caixa-workspace-payables.types.ts';
import { CaixaWorkspacePayablesPanel } from './CaixaWorkspacePayablesPanel.tsx';

const PAGE_SIZE = 20;

export interface CaixaWorkspacePayablesModalProps {
  open: boolean;
  onClose: () => void;
  empresaId: string;
  poloId: 'todos' | string;
  competencia: string;
  filtro: CaixaWorkspacePayablesFilter;
  title: string;
}

export const CaixaWorkspacePayablesModal = ({
  open,
  onClose,
  empresaId,
  poloId,
  competencia,
  filtro,
  title,
}: CaixaWorkspacePayablesModalProps) => {
  const contextKey = `${empresaId}:${poloId}:${competencia}:${filtro}`;
  const [navigation, setNavigation] = useState({
    contextKey,
    page: 1,
    snapshotId: null as string | null,
  });
  const page = navigation.contextKey === contextKey ? navigation.page : 1;
  const snapshotId = navigation.contextKey === contextKey ? navigation.snapshotId : null;
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<globalThis.HTMLButtonElement>(null);
  const queryClient = useQueryClient();

  const request = useMemo(() => ({
    empresaId,
    poloId,
    competencia,
    filtro,
    pagina: page,
    tamanhoPagina: PAGE_SIZE,
    snapshotId,
  }), [competencia, empresaId, filtro, page, poloId, snapshotId]);

  const payablesQuery = useQuery({
    ...caixaWorkspacePayablesQueryOptions(request),
    enabled: open,
  });

  const close = () => {
    setNavigation({ contextKey, page: 1, snapshotId: null });
    onClose();
  };

  useEffect(() => {
    if (!open) {
      setNavigation({ contextKey, page: 1, snapshotId: null });
      return undefined;
    }
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    return () => { previouslyFocused?.focus(); };
  }, [contextKey, open]);

  if (!open) return null;

  const movePage = (direction: -1 | 1) => {
    setNavigation({
      contextKey,
      page: page + direction,
      snapshotId: payablesQuery.data?.meta.snapshot_id ?? snapshotId,
    });
  };

  const snapshotConflict = Boolean(
    payablesQuery.error
    && typeof payablesQuery.error === 'object'
    && 'code' in payablesQuery.error
    && payablesQuery.error.code === '40001',
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div
        id="caixa-workspace-payables-dialog"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="caixa-payables-modal-title"
        aria-describedby="caixa-payables-modal-description"
        onKeyDown={handleKeyDown}
        className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[28px] border border-slate-200 bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-[28px]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-[#001a33] px-4 py-4 text-white sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 rounded-xl bg-white/10 p-2 text-blue-200">
              <ReceiptText aria-hidden="true" size={18} />
            </span>
            <div className="min-w-0">
              <h2 id="caixa-payables-modal-title" className="break-words text-base font-extrabold sm:text-lg">
                {title}
              </h2>
              <p id="caixa-payables-modal-description" className="mt-1 text-xs text-slate-300">
                {formatCaixaCompetencia(competencia)} · obrigações na posição canônica do corte
              </p>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">
                Rateios aparecem por obrigação econômica; os KPIs contam títulos físicos sem duplicação.
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Fechar detalhamento de obrigações a pagar"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <CaixaWorkspacePayablesPanel
            payload={payablesQuery.data}
            isLoading={payablesQuery.isPending}
            isError={payablesQuery.isError}
            isSnapshotConflict={snapshotConflict}
            isFetching={payablesQuery.isFetching}
            onRetry={() => {
              if (snapshotConflict) {
                const firstPageRequest = {
                  ...request,
                  pagina: 1,
                  snapshotId: null,
                };
                queryClient.removeQueries({
                  queryKey: caixaWorkspacePayablesQueryOptions(firstPageRequest).queryKey,
                  exact: true,
                });
                setNavigation({ contextKey, page: 1, snapshotId: null });
                return;
              }
              void payablesQuery.refetch();
            }}
            onPrevious={() => movePage(-1)}
            onNext={() => movePage(1)}
          />
        </div>
      </div>
    </div>
  );
};
