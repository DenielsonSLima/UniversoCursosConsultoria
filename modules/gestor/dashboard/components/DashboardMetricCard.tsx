import type React from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';

interface DashboardMetricCardProps {
  label: string;
  value: React.ReactNode;
  helper: string;
  icon: LucideIcon;
  tone: string;
  loading?: boolean;
  onClick?: () => void;
}

const DashboardMetricCard: React.FC<DashboardMetricCardProps> = ({
  label,
  value,
  helper,
  icon: Icon,
  tone,
  loading = false,
  onClick,
}) => {
  const Element = onClick ? 'button' : 'div';

  return (
    <Element
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`group flex min-h-28 w-full items-center gap-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 text-left shadow-sm transition-all ${
        onClick ? 'hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md' : ''
      }`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
        <Icon size={19} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</span>
        {loading ? (
          <span className="mt-2 block h-7 w-16 animate-pulse rounded-lg bg-slate-100" />
        ) : (
          <span className="mt-0.5 block text-[28px] font-bold leading-none tracking-tight text-[#001a33]">{value}</span>
        )}
        <span className="mt-1.5 block truncate text-[11px] font-medium text-slate-500">{helper}</span>
      </span>
      {onClick && (
        <ChevronRight
          size={16}
          className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600"
        />
      )}
    </Element>
  );
};

export default DashboardMetricCard;
