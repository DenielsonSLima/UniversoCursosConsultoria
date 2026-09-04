import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  MoreHorizontal,
  ReceiptText,
  Settings2,
  XCircle,
} from 'lucide-react';
import type { Turma } from '../../../../gestao.types';
import FinanceiroAlunoCarneAction, {
  type FinanceiroAlunoCarneFeedback,
} from './FinanceiroAlunoCarneAction';
import FinanceiroCicloManualStatus, {
  getFinanceiroSituationLabel as situationLabel,
  MatriculaAcademicaBadge,
} from './FinanceiroCicloManualStatus';
import type { MatriculaTecnicaFinanceiroRow } from './matricula-tecnica-financeiro.types';

interface FinanceiroAlunosTableProps {
  turma: Pick<Turma, 'id' | 'poloId'>;
  rows: MatriculaTecnicaFinanceiroRow[];
  eligibleSelected: string[];
  pending: boolean;
  actionMenuId: string | null;
  onActionMenuChange: (matriculaId: string | null) => void;
  onSelectionChange: (row: MatriculaTecnicaFinanceiroRow, checked: boolean) => void;
  onOpenStatement: (matriculaId: string) => void;
  onOpenOverride: (matriculaId: string) => void;
  onOpenManualCycle: (matriculaId: string) => void;
  onActivateNow: (row: MatriculaTecnicaFinanceiroRow) => void;
  onSchedule: (row: MatriculaTecnicaFinanceiroRow) => void;
  onResumeCycle: (row: MatriculaTecnicaFinanceiroRow) => void;
  onCarnetFeedback: FinanceiroAlunoCarneFeedback;
}

const formatMoney = (value: string | null | undefined) => {
  if (value == null || value.trim() === '') return '—';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(parsed);
};

const formatDateTime = (value: string | null) => value
  ? new Date(value).toLocaleString('pt-BR')
  : 'Não informado';

export const formatStudentDocument = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      '$1.$2.$3/$4-$5',
    );
  }
  return value.trim() || 'não informado';
};

const statusBadge = (row: MatriculaTecnicaFinanceiroRow) => {
  if (row.financeiro.status === 'NAO_CONFIGURADO') {
    return <span className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500"><AlertTriangle size={12} /> Não configurado</span>;
  }
  if (row.financeiro.status === 'PENDENTE') {
    return <span className="flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-700"><Clock3 size={12} /> Pendente</span>;
  }
  if (row.financeiro.status === 'AGENDADA') {
    return <span className="flex items-center gap-1 rounded bg-blue-100 px-2 py-1 text-[10px] font-bold uppercase text-blue-700"><CalendarClock size={12} /> Agendada</span>;
  }
  if (row.financeiro.status === 'ATIVADA') {
    return <span className="flex items-center gap-1 rounded bg-cyan-100 px-2 py-1 text-[10px] font-bold uppercase text-cyan-700"><CheckCircle2 size={12} /> Ativada</span>;
  }
  return (
    <div>
      <span className="flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700"><CheckCircle2 size={12} /> Gerada</span>
      {row.situacaoFinanceira === 'INADIMPLENTE' ? <p className="mt-1 text-[8px] font-black uppercase text-red-600">Inadimplente</p> : null}
    </div>
  );
};

const FinanceiroAlunosTable = ({
  turma,
  rows,
  eligibleSelected,
  pending,
  actionMenuId,
  onActionMenuChange,
  onSelectionChange,
  onOpenStatement,
  onOpenOverride,
  onOpenManualCycle,
  onActivateNow,
  onSchedule,
  onResumeCycle,
  onCarnetFeedback,
}: FinanceiroAlunosTableProps) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[1020px] text-left">
      <thead className="border-b border-slate-200 bg-slate-50">
        <tr>
          <th className="px-4 py-4 text-xs font-black uppercase tracking-wider text-slate-500 lg:px-6">Aluno</th>
          <th className="px-4 py-4 text-xs font-black uppercase tracking-wider text-slate-500 lg:px-6">Valores</th>
          <th className="px-4 py-4 text-xs font-black uppercase tracking-wider text-slate-500 lg:px-6">Progresso Pagto.</th>
          <th className="px-4 py-4 text-xs font-black uppercase tracking-wider text-slate-500 lg:px-6">Status</th>
          <th className="px-4 py-4 text-right text-xs font-black uppercase tracking-wider text-slate-500 lg:px-6">Ações</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-400">
              <XCircle size={32} className="mx-auto mb-2 text-slate-300 opacity-50" />
              <p className="font-bold">Nenhum aluno encontrado.</p>
            </td>
          </tr>
        ) : rows.map((row, index) => {
          const manualMode = row.cicloManual.habilitado && row.cicloManual.modo === 'MANUAL';
          const canActivate = !manualMode
            && row.financeiro.status === 'PENDENTE'
            && Boolean(row.regraEfetiva);
          const protectedExisting = manualMode
            && row.cicloManual.estado === 'PROTEGIDO_EXISTENTE';
          return (
            <tr
              key={row.matriculaId}
              data-student-band={index % 2 === 0 ? 'even' : 'odd'}
              onClick={() => onOpenStatement(row.matriculaId)}
              className={`${index % 2 === 0 ? 'bg-white' : 'bg-blue-50/45'} group cursor-pointer border-b border-slate-100 transition-colors hover:bg-blue-100/55`}
              title="Abrir extrato financeiro do aluno"
            >
              <td className="px-4 py-4 lg:px-6">
                <div className="flex items-center gap-3">
                  {canActivate ? (
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${row.alunoNome}`}
                      checked={eligibleSelected.includes(row.matriculaId)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => onSelectionChange(row, event.target.checked)}
                    />
                  ) : null}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-xs font-bold text-slate-500 shadow-sm">
                    {row.alunoNome.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#001a33]">{row.alunoNome}</p>
                    <p className="mt-0.5 whitespace-nowrap text-[9px] font-semibold text-slate-500">
                      CPF: {formatStudentDocument(row.alunoCpf)} · Matrícula: {row.matriculaExibicao}
                    </p>
                    {row.overrideAtivo ? <p className="mt-0.5 text-[8px] font-black uppercase text-violet-600">Regra individual</p> : null}
                  </div>
                </div>
              </td>
              <td className="px-4 py-4 lg:px-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-emerald-700">Mat. {formatMoney(row.valorMatriculaEfetivo)}</p>
                  <p className="text-[10px] font-bold uppercase text-slate-500">Mens. {formatMoney(row.valorMensalidadeEfetivo)}</p>
                </div>
              </td>
              <td className="px-4 py-4 lg:px-6">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 flex-1 overflow-hidden rounded-full bg-slate-200/80">
                    <div
                      className={`h-full rounded-full ${row.situacaoFinanceira === 'INADIMPLENTE' ? 'bg-red-500' : 'bg-blue-500'}`}
                      style={{ width: `${row.progressoPercentual}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">{row.parcelasPagas}/{row.totalParcelas}</span>
                </div>
              </td>
              <td className="px-4 py-4 lg:px-6">
                <div className="space-y-2">
                  <MatriculaAcademicaBadge status={row.statusAcademico} />
                  {manualMode
                    ? <p className="text-[9px] font-black uppercase text-slate-600">Cobrança: {situationLabel(row)}</p>
                    : statusBadge(row)}
                  {!manualMode && row.financeiro.status === 'AGENDADA'
                    ? <p className="text-[8px] font-bold text-blue-600">{formatDateTime(row.financeiro.ativarEm)}</p>
                    : null}
                </div>
              </td>
              <td className="px-4 py-4 text-right lg:px-6">
                <div className="relative flex flex-wrap items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                  {manualMode ? (
                    <FinanceiroCicloManualStatus
                      cicloManual={row.cicloManual}
                      disabled={pending}
                      onGenerate={() => onOpenManualCycle(row.matriculaId)}
                      onResume={() => onResumeCycle(row)}
                    />
                  ) : null}
                  <FinanceiroAlunoCarneAction
                    row={row}
                    poloId={turma.poloId}
                    turmaId={turma.id}
                    disabled={pending}
                    onFeedback={onCarnetFeedback}
                  />
                  <button type="button" onClick={() => onOpenStatement(row.matriculaId)} title="Extrato Financeiro" aria-label={`Abrir extrato de ${row.alunoNome}`} className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-blue-600 transition-colors hover:bg-blue-100"><FileText size={16} /></button>
                  {!protectedExisting ? <button type="button" onClick={() => onOpenOverride(row.matriculaId)} title="Configuração individual" aria-label={`Configuração financeira de ${row.alunoNome}`} className="rounded-lg border border-violet-100 bg-violet-50 p-2 text-violet-600 transition-colors hover:bg-violet-100"><Settings2 size={16} /></button> : null}
                  {!manualMode ? <button type="button" onClick={() => onActionMenuChange(actionMenuId === row.matriculaId ? null : row.matriculaId)} title="Mais opções" aria-label={`Mais opções para ${row.alunoNome}`} className="rounded-lg border border-transparent p-2 text-slate-400 transition-colors hover:border-slate-200 hover:bg-slate-100 hover:text-slate-600"><MoreHorizontal size={16} /></button> : null}
                  {!manualMode && actionMenuId === row.matriculaId ? (
                    <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-slate-100 bg-white p-2 text-left shadow-xl">
                      {canActivate ? (
                        <>
                          <button type="button" disabled={pending} onClick={() => onActivateNow(row)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-50"><ReceiptText size={14} /> Gerar agora</button>
                          <button type="button" disabled={pending} onClick={() => onSchedule(row)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-black uppercase text-blue-700 hover:bg-blue-50"><CalendarClock size={14} /> Agendar</button>
                        </>
                      ) : <p className="px-3 py-2 text-[10px] font-bold text-slate-400">Sem ação pendente.</p>}
                    </div>
                  ) : null}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default FinanceiroAlunosTable;
