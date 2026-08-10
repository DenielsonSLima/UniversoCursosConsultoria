import { getPatrimonioDisplayStatus } from '../patrimonio.actions';
import type { PatrimonioItem } from '../patrimonio.types';

interface PatrimonioStatusBadgeProps {
  item: PatrimonioItem;
}

const STATUS_CONFIG = {
  ativo: { label: 'Ativo', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  parcial: { label: 'Baixa parcial', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  baixado: { label: 'Baixado', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  excluido: { label: 'Excluído', className: 'border-slate-200 bg-slate-100 text-slate-500' },
} as const;

export function PatrimonioStatusBadge({ item }: PatrimonioStatusBadgeProps) {
  const config = STATUS_CONFIG[getPatrimonioDisplayStatus(item)];
  return (
    <span className={`inline-flex whitespace-nowrap rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${config.className}`}>
      {config.label}
    </span>
  );
}
