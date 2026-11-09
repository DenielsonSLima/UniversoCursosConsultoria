// File: modules/gestor/financeiro/despesas/components/DespesaGroupedView.tsx
// Agrupa por mês, fornecedor ou categoria com totais canônicos.

import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, Tag, Building2 } from 'lucide-react';
import { DespesaGroupSummary, DespesaLancamento } from '../despesas.service';
import { ContaBancaria } from '../../financeiro.service';
import DespesaTable from './DespesaTable';
import DespesaCard from './DespesaCard';
import type { DespesaAgrupamento } from '../despesas.queryKeys';
import { buildDespesaGroups } from './despesa-grouping.model';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

interface DespesaGroupedViewProps {
  items: DespesaLancamento[];
  summaries: DespesaGroupSummary[];
  viewMode: 'tabela' | 'cards';
  groupBy?: DespesaAgrupamento;
  contas: ContaBancaria[];
  onPagar?: (item: DespesaLancamento) => void;
  onEditar?: (item: DespesaLancamento) => void;
  onCancelar?: (item: DespesaLancamento) => void;
  onExcluir?: (items: DespesaLancamento[]) => void;
  onImprimir?: (item: DespesaLancamento) => void;
  onAnexo?: (item: DespesaLancamento) => void;
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

const DespesaGroupedView: React.FC<DespesaGroupedViewProps> = ({
  items,
  summaries,
  viewMode,
  groupBy = 'categoria',
  contas,
  onPagar,
  onEditar,
  onCancelar,
  onExcluir,
  onImprimir,
  onAnexo,
  selectedIds,
  onSelectionChange,
}: DespesaGroupedViewProps) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = useMemo(() => buildDespesaGroups(items, summaries, groupBy), [items, summaries, groupBy]);
  const GroupIcon = groupBy === 'mes' ? CalendarDays : groupBy === 'fornecedor' ? Building2 : Tag;

  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Tag size={40} className="mx-auto mb-3 opacity-30" />
        <p className="font-bold text-sm">Nenhum lançamento encontrado</p>
      </div>
    );
  }

  return (
    <div className="financial-data-surface financial-record-list space-y-4">
      {groups.map((group) => {
        const isOpen = expanded.has(group.key);
        return (
          <div key={group.key} className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
            {/* Header do grupo */}
            <button
              type="button" aria-expanded={isOpen}
              onClick={() => toggleGroup(group.key)}
              className="financial-group-toggle w-full flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-auto">
                <div className="p-1.5 bg-rose-100 text-rose-600 rounded-lg">
                  <GroupIcon size={14} />
                </div>
                <div className="min-w-0 text-left">
                  <p className="break-words text-[13px] font-semibold text-[#001a33]">
                    {group.label}
                  </p>
                  <p className="mt-0.5 text-xs font-normal text-slate-500">
                    {group.count === undefined
                      ? 'Quantidade indisponível'
                      : `${group.count} lançamento${group.count !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-3 sm:gap-6">
                <div className="text-right">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total previsto</p>
                  <p className="font-black text-base text-[#001a33]">
                    {group.total === undefined ? '—' : formatCurrency(group.total)}
                  </p>
                </div>
                {group.pago !== undefined && group.pago > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Pago</p>
                    <p className="font-black text-base text-emerald-600">{formatCurrency(group.pago)}</p>
                  </div>
                )}
                <div className="text-slate-400 flex-shrink-0">
                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
              </div>
            </button>

            {/* Conteúdo expandido */}
            {isOpen && (
              <div className="p-4">
                {viewMode === 'tabela' ? (
                  <DespesaTable
                    items={group.items}
                    contas={contas}
                    onPagar={onPagar}
                    onEditar={onEditar}
                    onCancelar={onCancelar}
                    onExcluir={onExcluir}
                    onImprimir={onImprimir}
                    onAnexo={onAnexo}
                    selectedIds={selectedIds}
                    onSelectionChange={onSelectionChange}
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {group.items.map((item) => (
                      <DespesaCard
                        key={item.id}
                        item={item}
                        contas={contas}
                        onPagar={onPagar}
                        onEditar={onEditar}
                        onCancelar={onCancelar}
                        onExcluir={onExcluir}
                        onImprimir={onImprimir}
                        onAnexo={onAnexo}
                        selected={selectedIds?.has(item.id)}
                        onSelectionChange={(selectedItem, selected) => {
                          if (!onSelectionChange) return;
                          const next = new Set(selectedIds || []);
                          if (selected) next.add(selectedItem.id); else next.delete(selectedItem.id);
                          onSelectionChange(next);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DespesaGroupedView;
