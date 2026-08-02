import type { FC, ReactNode } from 'react';
import { ChevronDown, Layers3 } from 'lucide-react';

interface CurriculumModuleSectionProps {
  title: string;
  order: number;
  itemCount: number;
  detail?: string;
  defaultOpen?: boolean;
  itemLabel?: string;
  children: ReactNode;
}

const CurriculumModuleSection: FC<CurriculumModuleSectionProps> = ({
  title,
  order,
  itemCount,
  detail,
  defaultOpen = false,
  itemLabel = 'disciplina',
  children,
}: CurriculumModuleSectionProps) => {
  const displayTitle = title.replace(/^m[oó]dulo\s+[ivxlcdm\d]+\s*[-–—:]\s*/i, '').trim() || title;
  return (
  <details open={defaultOpen} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <summary className="flex cursor-pointer list-none items-center gap-3 bg-slate-50/80 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden sm:px-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
        <Layers3 size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-blue-600">
          {Number.isFinite(order) && order < Number.MAX_SAFE_INTEGER ? `Módulo ${String(order).padStart(2, '0')}` : 'Módulo'}
        </span>
        <h5 className="mt-0.5 break-words text-sm font-black uppercase text-[#001a33]">{displayTitle}</h5>
        {detail ? <span className="mt-1 block text-[10px] font-semibold text-slate-400">{detail}</span> : null}
      </span>
      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500 shadow-sm">
        {itemCount} {itemLabel}{itemCount === 1 ? '' : 's'}
      </span>
      <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
    </summary>
    <div className="border-t border-slate-100 p-3 sm:p-4">{children}</div>
  </details>
  );
};

export default CurriculumModuleSection;
