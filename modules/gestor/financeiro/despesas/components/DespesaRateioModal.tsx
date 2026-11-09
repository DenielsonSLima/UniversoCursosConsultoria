import React, { useEffect, useId, useRef, type ComponentRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, RefreshCw, X } from 'lucide-react';
import type { DespesaLancamento } from '../despesas.types';
import { despesasQueryKeys } from '../despesas.queryKeys';
import { listarRateiosDespesa } from '../despesas-rateios.service';
import { formatDespesaCurrency } from './despesaPresentation';

const statusLabel: Record<string, string> = {
  PAGO: 'Pago', PENDENTE: 'Pendente', VENCIDO: 'Vencido', CANCELADO: 'Cancelado',
};

export default function DespesaRateioModal({ item, onClose }: {
  item: DespesaLancamento; onClose: () => void;
}) {
  const ref = useRef<ComponentRef<'dialog'>>(null);
  const titleId = useId();
  const sourceId = item.despesaLancamentoId || item.id;
  const query = useQuery({
    queryKey: [...despesasQueryKeys.lancamentosRoot, 'rateios', sourceId, item.poloId || null],
    queryFn: () => listarRateiosDespesa(sourceId),
    retry: false, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    dialog?.querySelector('button')?.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  const rows = query.data || [];
  return createPortal(
    <dialog ref={ref} aria-labelledby={titleId} aria-modal="true"
      onKeyDown={(event: React.KeyboardEvent<ComponentRef<'dialog'>>) => {
        if (event.key !== 'Tab') return;
        const buttons = event.currentTarget.querySelectorAll('button');
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="financial-dialog m-auto w-[calc(100%_-_2rem)] max-w-xl max-h-[85dvh] overflow-y-auto rounded-xl border-0 bg-white p-0 text-[13px] text-slate-700 shadow-xl backdrop:bg-slate-950/50">
      <div className="p-4 sm:p-5">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-semibold text-[#001a33]">Detalhes do rateio</h3>
            <p className="mt-1 break-words text-slate-600">{item.descricao}</p>
          </div>
          <button type="button" autoFocus onClick={onClose} aria-label="Fechar detalhes do rateio"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            <X size={18} />
          </button>
        </header>
        <p className="my-3 text-xs leading-5 text-slate-500">
          A baixa fica na Matriz. Abaixo estão os polos e os valores da distribuição do custo disponíveis para seu acesso.
        </p>
        {query.isLoading ? (
          <p role="status" className="flex items-center justify-center gap-2 py-8">
            <RefreshCw size={16} className="animate-spin" />Carregando rateio…
          </p>
        ) : query.isError ? (
          <div role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">
            <p>Não foi possível carregar os detalhes do rateio.</p>
            <button type="button" onClick={() => void query.refetch()} className="mt-2 font-medium underline">Tentar novamente</button>
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-4">Nenhum polo do rateio está disponível para seu acesso.</p>
        ) : (
          <ul className="space-y-3" aria-label="Polos do rateio">
            {rows.map((row) => (
              <li key={row.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="flex min-w-0 items-start gap-2 font-medium text-[#001a33]">
                    <Building2 size={16} className="mt-0.5 shrink-0 text-indigo-600" /><span className="break-words">{row.poloNome}</span>
                  </p>
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs">{statusLabel[row.status] || row.status}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div><dt className="text-slate-500">Valor base</dt><dd className="mt-0.5">{formatDespesaCurrency(row.valorBase)}</dd></div>
                  <div><dt className="text-slate-500">Valor destinado ao polo</dt><dd className="mt-0.5 font-semibold text-[#001a33]">{formatDespesaCurrency(row.valorTotal)}</dd></div>
                  {row.jurosValor > 0 && <div><dt className="text-slate-500">Juros</dt><dd>{formatDespesaCurrency(row.jurosValor)}</dd></div>}
                  {row.multaValor > 0 && <div><dt className="text-slate-500">Multa</dt><dd>{formatDespesaCurrency(row.multaValor)}</dd></div>}
                  {row.descontoValor > 0 && <div><dt className="text-slate-500">Desconto</dt><dd>{formatDespesaCurrency(row.descontoValor)}</dd></div>}
                </dl>
              </li>
            ))}
          </ul>
        )}
        <footer className="mt-4 flex justify-end border-t border-slate-100 pt-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Fechar</button>
        </footer>
      </div>
    </dialog>, document.body,
  );
}

