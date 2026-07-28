import React from 'react';
import { formatCaixaCurrency } from '../caixa.formatters';

export const CaixaMetricCard: React.FC<{
  label: string;
  value: number;
  helper: React.ReactNode;
  icon: React.ReactNode;
  tone: 'navy' | 'green' | 'rose' | 'blue';
}> = ({ label, value, helper, icon, tone }) => {
  const toneClasses = {
    navy: 'border-slate-800 bg-slate-900 text-white',
    green: 'border-emerald-100 bg-white text-emerald-700',
    rose: 'border-rose-100 bg-white text-rose-600',
    blue: 'border-blue-100 bg-white text-blue-700',
  };
  const mutedClasses = tone === 'navy' ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`min-h-[116px] rounded-2xl border p-4 shadow-sm ${toneClasses[tone]}`}>
      <div className={`flex items-center gap-2 text-[11px] font-semibold ${mutedClasses}`}>
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-3 text-[22px] font-extrabold leading-none tracking-tight">
        {formatCaixaCurrency(value)}
      </p>
      <div className={`mt-3 text-[11px] leading-4 ${mutedClasses}`}>{helper}</div>
    </div>
  );
};

export const CaixaBreakdownList: React.FC<{
  items: Array<{
    codigo: string;
    rotulo: string;
    valor: number;
    quantidade: number;
    percentual: number;
  }>;
  emptyLabel: string;
  tone: 'green' | 'rose';
}> = ({ items, emptyLabel, tone }) => {
  const visibleItems = items.filter((item) => item.valor !== 0 || item.quantidade !== 0);
  const list = visibleItems.length > 0 ? visibleItems : items.slice(0, 4);
  const barClass = tone === 'green' ? 'bg-emerald-500' : 'bg-rose-500';
  const amountClass = tone === 'green' ? 'text-emerald-700' : 'text-rose-600';

  if (list.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">{emptyLabel}</p>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {list.map((item) => (
        <div key={item.codigo} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{item.rotulo}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {item.quantidade} {item.quantidade === 1 ? 'movimento' : 'movimentos'} · {item.percentual}%
              </p>
            </div>
            <p className={`shrink-0 text-sm font-bold ${amountClass}`}>
              {formatCaixaCurrency(item.valor)}
            </p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${barClass}`}
              style={{ width: `${item.percentual}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
