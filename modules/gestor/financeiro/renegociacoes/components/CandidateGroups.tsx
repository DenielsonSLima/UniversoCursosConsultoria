import React, { useMemo } from 'react';
import { CalendarClock, ChevronRight, CircleAlert, GraduationCap, ReceiptText } from 'lucide-react';
import { formatCents, formatRenegociacaoDate } from '../renegociacoes.model';
import type { RenegociacaoCandidateGroup, RenegociacaoCandidatePage } from '../renegociacoes.types';
import { EmptyPanel, ErrorPanel, LoadingPanel, Pagination } from './RenegociacaoPanels';

interface CandidateGroupsProps {
  data?: RenegociacaoCandidatePage;
  loading: boolean;
  error: unknown;
  search: string;
  onRetry: () => void;
  onStart: (group: RenegociacaoCandidateGroup) => void;
  onPage: (page: number) => void;
}

const CandidateGroups: React.FC<CandidateGroupsProps> = ({
  data,
  loading,
  error,
  search,
  onRetry,
  onStart,
  onPage,
}) => {
  const students = useMemo(() => {
    const result = new Map<string, { name: string; groups: RenegociacaoCandidateGroup[] }>();
    for (const group of data?.groups || []) {
      const entry = result.get(group.alunoId) || { name: group.alunoNome, groups: [] };
      entry.groups.push(group);
      result.set(group.alunoId, entry);
    }
    return [...result.entries()];
  }, [data?.groups]);

  if (loading) return <LoadingPanel label="Buscando parcelas elegíveis..." />;
  if (error) return <ErrorPanel error={error} onRetry={onRetry} />;
  if (!students.length)
    return (
      <EmptyPanel
        title="Nenhuma parcela para negociar"
        description={
          search
            ? 'Nenhum aluno corresponde à busca atual.'
            : 'Não há parcelas abertas elegíveis neste polo neste momento.'
        }
      />
    );

  return (
    <div className="space-y-4">
      {students.map(([studentId, student]) => (
        <section
          key={studentId}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          aria-labelledby={`student-${studentId}`}
        >
          <header className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#001a33] text-xs font-black text-white">
              {student.name
                .split(' ')
                .slice(0, 2)
                .map((part) => part[0])
                .join('')
                .toUpperCase()}
            </span>
            <div className="min-w-0">
              <h4 id={`student-${studentId}`} className="truncate text-sm font-black text-[#001a33]">
                {student.name}
              </h4>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {student.groups.length} {student.groups.length === 1 ? 'matrícula' : 'matrículas'}
              </p>
            </div>
          </header>
          <div className="divide-y divide-slate-100">
            {student.groups.map((group) => (
              <article
                key={group.matriculaId}
                className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <GraduationCap size={16} className="text-blue-600" />
                    <p className="truncate text-sm font-black text-slate-800">{group.turmaNome}</p>
                    {group.matriculaCodigo ? (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                        Matrícula {group.matriculaCodigo}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Metric icon={<ReceiptText size={13} />} label="Elegíveis" value={String(group.eligibleCount)} />
                    <Metric
                      icon={<CircleAlert size={13} />}
                      label="Em atraso"
                      value={String(group.overdueCount)}
                      tone="rose"
                    />
                    <Metric icon={<CalendarClock size={13} />} label="A vencer" value={String(group.futureCount)} />
                    <Metric label="Saldo atual" value={formatCents(group.grossDebtCents)} strong />
                  </div>
                  <p className="mt-2 text-[10px] font-medium text-slate-400">
                    Vencimento mais antigo: {formatRenegociacaoDate(group.oldestDueDate)}
                    {group.blockedCount ? ` • ${group.blockedCount} bloqueada(s)` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onStart(group)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-black uppercase tracking-wide text-white shadow-sm hover:bg-blue-800 lg:w-auto"
                >
                  Selecionar parcelas <ChevronRight size={16} />
                </button>
              </article>
            ))}
          </div>
        </section>
      ))}
      {data ? (
        <Pagination page={data.page} pageSize={data.pageSize} total={data.totalGroups} onChange={onPage} />
      ) : null}
    </div>
  );
};

const Metric: React.FC<{ icon?: React.ReactNode; label: string; value: string; strong?: boolean; tone?: 'rose' }> = ({
  icon,
  label,
  value,
  strong,
  tone,
}) => (
  <div
    className={`rounded-xl border px-3 py-2 ${tone === 'rose' ? 'border-rose-100 bg-rose-50' : 'border-slate-100 bg-slate-50'}`}
  >
    <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-slate-400">
      {icon}
      {label}
    </span>
    <span
      className={`mt-0.5 block truncate text-xs ${strong ? 'font-black text-[#001a33]' : 'font-bold text-slate-700'}`}
    >
      {value}
    </span>
  </div>
);

export default CandidateGroups;
