import React from 'react';
import { Calendar, DollarSign, GripVertical, RefreshCw } from 'lucide-react';
import { CronogramaItem } from './financeiro-config.service';
import { formatCurrencyBRL } from './financeiro-config.utils';

interface FinanceiroCronogramaItemProps {
  index: number;
  item: CronogramaItem;
  onDragEnd: () => void;
  onDragEnter: (index: number) => void;
  onDragStart: (index: number) => void;
  onUpdateDate: (itemId: string, newDate: string) => void;
}

const FinanceiroCronogramaItem: React.FC<FinanceiroCronogramaItemProps> = ({
  index,
  item,
  onDragEnd,
  onDragEnter,
  onDragStart,
  onUpdateDate,
}) => {
  let colorClass: string;
  let icon: React.ReactNode;

  switch (item.tipo) {
    case 'MATRICULA':
      colorClass = 'bg-emerald-50 border-emerald-200 text-emerald-700';
      icon = <DollarSign size={14} />;
      break;
    case 'REMATRICULA':
      colorClass = 'bg-amber-50 border-amber-200 text-amber-700';
      icon = <RefreshCw size={14} />;
      break;
    case 'PARCELA':
    default:
      colorClass = 'bg-white border-slate-200 text-slate-600 hover:border-blue-300';
      icon = <Calendar size={14} />;
      break;
  }

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border mb-2 cursor-move transition-all shadow-sm ${colorClass} active:scale-[0.98] active:shadow-lg gap-2`}
    >
      <div className="flex items-center gap-3">
        <div className="cursor-grab text-slate-400 hover:text-slate-600">
          <GripVertical size={18} />
        </div>
        <span className="font-bold text-[10px] uppercase bg-white/50 px-2 py-1 rounded border border-black/5 shrink-0">
          Mês {index + 1}
        </span>
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-bold text-sm">{item.label}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto">
        <input
          type="date"
          value={item.dataVencimento || ''}
          onChange={(event) => onUpdateDate(item.id, event.target.value)}
          className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-500 text-slate-700 shadow-sm"
        />
        <div className="font-mono font-bold text-sm opacity-80 min-w-[90px] text-right">
          {formatCurrencyBRL(item.valor)}
        </div>
      </div>
    </div>
  );
};

export default FinanceiroCronogramaItem;
