import {
  CalendarRange,
  Check,
  FileStack,
  GraduationCap,
  UserRound,
} from 'lucide-react';
import { formatBaneseCurrency, formatBaneseDate } from '../carnes-alunos.format';
import type { BaneseDocumentGroup, CarnesAlunosMode } from '../carnes-alunos.types';

interface BaneseDocumentGroupCardProps {
  key?: string;
  group: BaneseDocumentGroup;
  mode: CarnesAlunosMode;
  selected: boolean;
  disabled?: boolean;
  onToggle: (group: BaneseDocumentGroup) => void;
}

const BaneseDocumentGroupCard = ({
  group,
  mode,
  selected,
  disabled,
  onToggle,
}: BaneseDocumentGroupCardProps) => {
  const documentLabel = group.documentType === 'carnet'
    ? 'Carnê Banese'
    : `${group.installmentCount} boleto${group.installmentCount === 1 ? '' : 's'} A4`;
  const actionLabel = selected
    ? 'Remover da seleção'
    : mode === 'custom'
      ? 'Adicionar à seleção'
      : 'Selecionar matrícula';

  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
      selected ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-emerald-200'
    }`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-cyan-800">
              <FileStack size={12} /> {documentLabel}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-slate-600">
              {group.installmentCount} parcela{group.installmentCount === 1 ? '' : 's'}
            </span>
          </div>

          <div className="mt-3 flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#001a33] text-white">
              <UserRound size={17} />
            </span>
            <div className="min-w-0">
              <h4 className="truncate text-sm font-black uppercase tracking-tight text-[#001a33]">
                {group.studentName}
              </h4>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                CPF {group.maskedCpf} · Matrícula {group.enrollmentCode}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-2">
            <p className="flex min-w-0 items-center gap-2">
              <GraduationCap size={15} className="shrink-0 text-emerald-700" />
              <span className="truncate">{group.courseName} · {group.className}</span>
            </p>
            <p className="flex items-center gap-2">
              <CalendarRange size={15} className="shrink-0 text-emerald-700" />
              {formatBaneseDate(group.firstDueDate)} a {formatBaneseDate(group.lastDueDate)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4 lg:w-48 lg:flex-col lg:items-stretch lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <div className="lg:text-right">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total dos títulos</p>
            <p className="mt-1 text-lg font-black text-[#001a33]">{formatBaneseCurrency(group.totalAmount)}</p>
          </div>
          <button
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onToggle(group)}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                : 'bg-[#001a33] text-white hover:bg-emerald-700'
            }`}
          >
            {selected ? <Check size={15} /> : <FileStack size={15} />}
            {actionLabel}
          </button>
        </div>
      </div>
    </article>
  );
};

export default BaneseDocumentGroupCard;
