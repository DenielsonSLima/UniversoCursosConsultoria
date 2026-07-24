import { useMemo } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  FolderKanban,
  Loader2,
} from 'lucide-react';
import type { SecretariaFinanceiraRecebivel } from '../secretariaFinanceira.service';
import {
  formatCurrency,
  formatDate,
  groupReceivables,
} from '../secretaria-financeira.utils';

type DebtWorkspaceProps = {
  rows: SecretariaFinanceiraRecebivel[];
  loading?: boolean;
  error?: string | null;
  onReceive: (item: SecretariaFinanceiraRecebivel) => void;
};

const ReceivableCard = ({
  item,
  onReceive,
}: {
  item: SecretariaFinanceiraRecebivel;
  onReceive: DebtWorkspaceProps['onReceive'];
}) => (
  <div className="grid gap-4 border-t border-slate-100 px-4 py-4 md:grid-cols-[minmax(0,1fr)_160px_110px] md:items-center">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${
          item.status === 'VENCIDO' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
        }`}>
          {item.status}
        </span>
        {item.tipoLancamento ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-slate-600">
            {item.tipoLancamento}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm font-black leading-snug text-[#001a33]">{item.descricao}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        {item.matricula}{item.parcelaNumero ? ` · Parcela ${item.parcelaNumero}` : ''}
      </p>
    </div>
    <div>
      <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        <CalendarDays size={13} /> Vencimento
      </p>
      <p className="mt-1 text-sm font-black text-slate-700">{formatDate(item.dataVencimento)}</p>
      <p className="mt-1 text-base font-black text-[#001a33]">{formatCurrency(item.valor)}</p>
    </div>
    <button
      type="button"
      onClick={() => onReceive(item)}
      className="rounded-xl bg-[#001a33] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-cyan-700"
    >
      Receber
    </button>
  </div>
);

const DebtWorkspace = ({
  rows,
  loading,
  error,
  onReceive,
}: DebtWorkspaceProps) => {
  const groups = useMemo(() => groupReceivables(rows), [rows]);
  const total = rows.reduce((sum, item) => sum + item.valor, 0);

  if (loading) {
    return <div className="grid min-h-56 place-items-center"><Loader2 className="animate-spin text-cyan-700" /></div>;
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-rose-50 p-6 text-center">
        <p className="font-black text-rose-700">Não foi possível carregar o financeiro</p>
        <p className="mt-1 text-xs font-semibold text-rose-600">{error}</p>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center">
        <CheckCircle2 className="text-emerald-500" size={34} />
        <p className="font-black text-slate-700">Nenhum valor em aberto</p>
        <p className="text-sm text-slate-400">Não há cobranças pendentes ou vencidas neste recorte.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl bg-[#001a33] px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">Conferência agrupada</p>
          <p className="mt-1 text-sm font-bold">{groups.length} curso(s) · {rows.length} cobrança(s)</p>
        </div>
        <div className="sm:text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Total em aberto</p>
          <strong className="text-xl font-black">{formatCurrency(total)}</strong>
        </div>
      </div>

      {groups.map((course) => (
        <section key={course.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-100 text-cyan-800">
                <FolderKanban size={19} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black uppercase tracking-tight text-[#001a33]">{course.cursoNome}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {course.modalidade} · {course.turmaNome}
                </p>
              </div>
            </div>
            <div className="sm:text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {course.students.length} aluno(s)
              </p>
              <p className="text-sm font-black text-cyan-800">{formatCurrency(course.total)}</p>
            </div>
          </header>

          <div className="divide-y divide-slate-200">
            {course.students.map((student) => (
              <article key={student.key}>
                <div className="flex flex-col gap-2 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-[#001a33]">{student.alunoNome}</p>
                    <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                      CPF: {student.alunoCpf || 'não informado'} · {student.matricula}
                    </p>
                  </div>
                  <p className="text-xs font-black text-slate-700">
                    {student.rows.length} cobrança(s) · {formatCurrency(student.total)}
                  </p>
                </div>
                {student.rows.map((item) => (
                  <ReceivableCard key={item.id} item={item} onReceive={onReceive} />
                ))}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default DebtWorkspace;
