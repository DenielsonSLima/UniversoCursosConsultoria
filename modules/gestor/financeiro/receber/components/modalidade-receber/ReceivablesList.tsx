import React from 'react';
import { ChevronDown, ChevronRight, Loader2, Users } from 'lucide-react';
import type {
  ContasReceber,
  ReceivablesGroupSummary,
} from '../../../financeiro.service';
import {
  ReceivableCard,
  ReceivableRow,
  type ReceivableActionsContext,
} from './ReceivableItemPresentation';
import type {
  GroupItemsState,
  GroupMode,
  ViewMode,
} from './modalidade-receber.types';
import { formatEnrollment } from './modalidade-receber.enrollment';
import { formatNextPendingDueDate } from './modalidade-receber.utils';

interface ReceivablesListProps {
  viewMode: ViewMode;
  groupMode: GroupMode;
  isLoading: boolean;
  isPageFetching: boolean;
  totalItems: number;
  totalReceivables: number;
  page: number;
  pageSize: number;
  totalPages: number;
  groupItemsPageSize: number;
  receivables: ContasReceber[];
  groups: ReceivablesGroupSummary[];
  groupItemsByKey: Map<string, GroupItemsState>;
  expandedGroups: Set<string>;
  groupPages: Record<string, number>;
  actions: ReceivableActionsContext;
  onToggleGroup: (groupKey: string) => void;
  onChangeGroupPage: (groupKey: string, nextPage: number) => void;
  onChangePage: (nextPage: number) => void;
}

const GroupPageControls: React.FC<{
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
}> = ({ page, totalPages, onPrevious, onNext, className = '' }) => {
  if (totalPages <= 1) return null;
  return (
    <div className={`flex items-center justify-end gap-2 text-[10px] font-black uppercase text-slate-500 ${className}`}>
      <button type="button" disabled={page <= 1} onClick={onPrevious} className="rounded-lg border px-2.5 py-1.5 disabled:opacity-40">Anterior</button>
      <span>{page} / {totalPages}</span>
      <button type="button" disabled={page >= totalPages} onClick={onNext} className="rounded-lg border px-2.5 py-1.5 disabled:opacity-40">Próxima</button>
    </div>
  );
};

export const ReceivablesList: React.FC<ReceivablesListProps> = ({
  viewMode,
  groupMode,
  isLoading,
  isPageFetching,
  totalItems,
  totalReceivables,
  page,
  pageSize,
  totalPages,
  groupItemsPageSize,
  receivables,
  groups,
  groupItemsByKey,
  expandedGroups,
  groupPages,
  actions,
  onToggleGroup,
  onChangeGroupPage,
  onChangePage,
}) => (
  <>
    <div className="relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white">
      {isPageFetching && !isLoading ? (
        <div className="absolute right-5 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[10px] font-black uppercase text-emerald-700 shadow-sm">
          <Loader2 className="animate-spin" size={12} /> Atualizando
        </div>
      ) : null}
      {isLoading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-sm font-bold text-slate-500">
          <Loader2 className="animate-spin text-emerald-600" /> Carregando recebíveis...
        </div>
      ) : viewMode === 'cards' ? (
        <div className="space-y-5 bg-slate-50/60 p-4">
          {totalItems === 0 ? (
            <div className="py-16 text-center text-xs font-bold text-slate-400">Nenhuma cobrança encontrada.</div>
          ) : groupMode === 'none' ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {receivables.map((item) => <ReceivableCard key={item.id} item={item} actions={actions} />)}
            </div>
          ) : groups.map((group) => {
            const isExpanded = expandedGroups.has(group.key);
            const detail = groupItemsByKey.get(group.key);
            const detailPage = groupPages[group.key] || 1;
            const detailTotalPages = Math.max(1, Math.ceil(group.itemCount / groupItemsPageSize));
            return (
              <section key={group.key} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4">
                <button
                  type="button"
                  onClick={() => onToggleGroup(group.key)}
                  className="flex w-full items-center justify-between gap-4 text-left"
                >
                  <span className="flex min-w-0 items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-600">
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <Users size={14} /> <span className="truncate">{group.label}</span>
                  </span>
                  <span className="whitespace-nowrap text-[10px] font-bold text-slate-400">{group.itemCount} cobrança(s)</span>
                </button>
                {isExpanded ? (
                  <>
                    {detail?.isLoading ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-xs font-bold text-slate-400">
                        <Loader2 className="animate-spin" size={16} /> Carregando cobranças...
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {(detail?.rows || []).map((item) => <ReceivableCard key={item.id} item={item} actions={actions} />)}
                      </div>
                    )}
                    <GroupPageControls
                      page={detailPage}
                      totalPages={detailTotalPages}
                      onPrevious={() => onChangeGroupPage(group.key, detailPage - 1)}
                      onNext={() => onChangeGroupPage(group.key, detailPage + 1)}
                      className="border-t border-slate-100 pt-3"
                    />
                  </>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] table-fixed text-left">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[26%]" />
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[11%]" />
              <col className="w-[13%]" />
            </colgroup>
            <thead className="bg-slate-50">
              <tr>
                {['Aluno / lançamento', 'Curso / turma', 'Recebimento', 'Datas', 'Valor', 'Ações'].map((label) => (
                  <th key={label} className="px-5 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</th>
                ))}
              </tr>
            </thead>
            {totalItems === 0 ? (
              <tbody><tr><td colSpan={6} className="py-16 text-center text-xs font-bold text-slate-400">Nenhuma cobrança encontrada.</td></tr></tbody>
            ) : groupMode === 'none' ? (
              <tbody className="divide-y divide-slate-100">
                {receivables.map((item, index) => <ReceivableRow key={item.id} item={item} index={index} actions={actions} />)}
              </tbody>
            ) : groups.map((group) => {
              const isExpanded = expandedGroups.has(group.key);
              const detail = groupItemsByKey.get(group.key);
              const detailPage = groupPages[group.key] || 1;
              const detailTotalPages = Math.max(1, Math.ceil(group.itemCount / groupItemsPageSize));
              const first = group.first;
              return (
                <tbody key={group.key} className="divide-y divide-slate-100">
                  <tr className="bg-slate-50/80 transition-colors hover:bg-blue-50/70">
                    <td colSpan={6} className="p-0">
                      <button
                        type="button"
                        onClick={() => onToggleGroup(group.key)}
                        className="grid w-full grid-cols-[minmax(260px,1.5fr)_minmax(180px,0.9fr)_minmax(180px,0.9fr)_minmax(140px,0.7fr)] items-center gap-4 px-5 py-4 text-left"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl ${
                            isExpanded ? 'bg-[#001a33] text-white' : 'bg-white text-slate-500'
                          }`}>
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black text-[#001a33]">{group.label}</span>
                            <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {groupMode === 'student'
                                ? `CPF: ${first?.clienteCpfCnpj || 'não informado'} · Matrícula: ${first ? formatEnrollment(first) : 'sem matrícula'}`
                                : groupMode === 'polo'
                                  ? `${first?.poloCnpj || 'CNPJ não informado'} · ${first?.poloCidade || 'Cidade não informada'} / ${first?.poloUf || 'UF'}`
                                  : first?.cursoNome || 'Curso não informado'}
                            </span>
                          </span>
                        </span>
                        <span className="text-xs font-bold text-slate-600">
                          <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Parcelas</span>
                          {group.itemCount} cobrança(s)
                        </span>
                        <span className="text-xs font-bold text-slate-600">
                          <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Situação</span>
                          {group.pendingCount} pend. · {group.receivedCount} rec. · {group.canceledCount} canc.
                        </span>
                        <span className="text-right text-xs font-bold text-slate-600">
                          <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Próximo vencimento</span>
                          <span className="text-[10px] text-slate-400">
                            {formatNextPendingDueDate(group.pendingCount, group.nextDue)}
                          </span>
                        </span>
                      </button>
                    </td>
                  </tr>
                  {isExpanded && detail?.isLoading ? (
                    <tr><td colSpan={6} className="py-8 text-center text-xs font-bold text-slate-400"><Loader2 className="mr-2 inline animate-spin" size={14} />Carregando cobranças...</td></tr>
                  ) : null}
                  {isExpanded ? (detail?.rows || []).map((item, index) => (
                    <ReceivableRow
                      key={item.id}
                      item={item}
                      index={index}
                      compactStudent={groupMode === 'student'}
                      actions={actions}
                    />
                  )) : null}
                  {isExpanded && detailTotalPages > 1 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-3">
                        <GroupPageControls
                          page={detailPage}
                          totalPages={detailTotalPages}
                          onPrevious={() => onChangeGroupPage(group.key, detailPage - 1)}
                          onNext={() => onChangeGroupPage(group.key, detailPage + 1)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>

    {!isLoading && totalItems > 0 ? (
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-xs font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {groupMode === 'none'
            ? `Mostrando ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalItems)} de ${totalItems} cobrança(s)`
            : `Mostrando ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalItems)} de ${totalItems} grupo(s), ${totalReceivables} cobrança(s)`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChangePage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-xl border border-slate-200 px-3 py-2 font-black uppercase disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="rounded-xl bg-slate-50 px-3 py-2 font-black text-[#001a33]">{page} / {totalPages}</span>
          <button
            type="button"
            onClick={() => onChangePage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded-xl border border-slate-200 px-3 py-2 font-black uppercase disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    ) : null}
  </>
);
