// File: modules/gestor/financeiro/despesas/components/DespesaGroupedView.tsx
// Agrupa despesas por categoria com totais

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Tag } from 'lucide-react';
import { DespesaLancamento } from '../despesas.service';
import DespesaTable from './DespesaTable';
import DespesaCard from './DespesaCard';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

interface DespesaGroupedViewProps {
  items: DespesaLancamento[];
  viewMode: 'tabela' | 'cards';
  onPagar?: (item: DespesaLancamento) => void;
  onExcluir?: (item: DespesaLancamento) => void;
  onImprimir?: (item: DespesaLancamento) => void;
}

const DespesaGroupedView: React.FC<DespesaGroupedViewProps> = ({
  items,
  viewMode,
  onPagar,
  onExcluir,
  onImprimir,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: DespesaLancamento[] }>();
    items.forEach((item) => {
      const key = item.categoriaFinanceiraId || '__sem_categoria__';
      const label = item.categoriaNome || 'Sem Categoria';
      if (!map.has(key)) {
        map.set(key, { label, items: [] });
      }
      map.get(key)!.items.push(item);
    });
    return Array.from(map.entries()).map(([key, { label, items: groupItems }]) => ({
      key,
      label,
      items: groupItems,
      total: groupItems.reduce((sum, i) => sum + i.valor, 0),
      pago: groupItems.filter((i) => i.status === 'PAGO').reduce((sum, i) => sum + (i.valorPago ?? i.valor), 0),
      count: groupItems.length,
    }));
  }, [items]);

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
    <div className="space-y-4">
      {groups.map((group) => {
        const isOpen = expanded.has(group.key);
        return (
          <div key={group.key} className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
            {/* Header do grupo */}
            <button
              onClick={() => toggleGroup(group.key)}
              className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-rose-100 text-rose-600 rounded-lg">
                  <Tag size={14} />
                </div>
                <div className="text-left">
                  <p className="font-black text-sm text-[#001a33] uppercase tracking-tight">
                    {group.label}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                    {group.count} lançamento{group.count !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total previsto</p>
                  <p className="font-black text-base text-[#001a33]">{formatCurrency(group.total)}</p>
                </div>
                {group.pago > 0 && (
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
                    onPagar={onPagar}
                    onExcluir={onExcluir}
                    onImprimir={onImprimir}
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.items.map((item) => (
                      <DespesaCard
                        key={item.id}
                        item={item}
                        onPagar={onPagar}
                        onExcluir={onExcluir}
                        onImprimir={onImprimir}
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
