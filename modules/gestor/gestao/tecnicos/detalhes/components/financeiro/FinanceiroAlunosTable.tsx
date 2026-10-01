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
  valuesVisible?: boolean;
  eligibleSelected: string[];
  pending: boolean;
  reviewingProesc?: boolean;
  actionMenuId: string | null;
  onActionMenuChange: (matriculaId: string | null) => void;
  onSelectionChange: (row: MatriculaTecnicaFinanceiroRow, checked: boolean) => void;
  onOpenStatement: (matriculaId: string) => void;
  onOpenOverride: (matriculaId: string) => void;
  onOpenManualCycle: (matriculaId: string) => void;
  onActivateNow: (row: MatriculaTecnicaFinanceiroRow) => void;
  onSchedule: (row: MatriculaTecnicaFinanceiroRow) => void;
  onResumeCycle: (row: MatriculaTecnicaFinanceiroRow) => void;
  onSettleEnrollment?: (row: MatriculaTecnicaFinanceiroRow) => void;
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

const MoneyValue = ({ value, valuesVisible }: {
  value: string | null | undefined;
  valuesVisible: boolean;
}) => valuesVisible ? formatMoney(value) : (
  <>
    <span aria-hidden="true">R$ •••••</span>
    <span className="sr-only">Valor oculto</span>
  </>
);

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
  valuesVisible = false,
  eligibleSelected,
  pending,
  reviewingProesc,
  actionMenuId,
  onActionMenuChange,
  onSelectionChange,
  onOpenStatement,
  onOpenOverride,
  onOpenManualCycle,
  onActivateNow,
  onSchedule,
  onResumeCycle,
  onSettleEnrollment,
  onCarnetFeedback,
}: FinanceiroAlunosTableProps) => (
  <div className="overflow-x-auto bg-slate-50/30">
    <table className="w-full min-w-[1120px] table-fixed text-left">
      <thead className="border-b border-slate-200 bg-slate-100/80">
        <tr>
          <th className="w-[25%] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Aluno</th>
          <th className="w-[12%] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Valores do plano</th>
          <th className="w-[13%] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Pagamento</th>
          <th className="w-[17%] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Situação</th>
          <th className="w-[33%] px-4 py-2.5 text-right text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Cobrança e acessos</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
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
              className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/65'} group cursor-pointer border-b border-slate-200/70 transition-colors hover:bg-blue-50/80 focus-within:bg-blue-50/80`}
              title="Abrir extrato financeiro do aluno"
            >
              <td className="px-4 py-3 align-top">
                <div className="flex items-start gap-2.5">
                  {canActivate ? (
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${row.alunoNome}`}
                      checked={eligibleSelected.includes(row.matriculaId)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => onSelectionChange(row, event.target.checked)}
                      className="mt-1 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  ) : null}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white bg-slate-200 text-[10px] font-black text-slate-500 shadow-sm">
                    {row.alunoNome.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-extrabold leading-4 text-[#001a33]">{row.alunoNome}</p>
                    <p className="mt-0.5 whitespace-nowrap text-[9px] font-semibold leading-4 text-slate-500">
                      CPF: {formatStudentDocument(row.alunoCpf)} · Matrícula: {row.matriculaExibicao}
                    </p>
                    {row.overrideAtivo ? <p className="mt-0.5 text-[8px] font-black uppercase tracking-wide text-violet-600">Regra individual</p> : null}
                    {row.cicloManual.continuidadeFinanceira?.cadeiaOrigemIds.map((originId, index, origins) => (
                      <button type="button" className="mt-1 block text-left text-[10px] font-semibold text-blue-700 underline underline-offset-2"
                        key={originId}
                        onClick={(event) => { event.stopPropagation(); onOpenStatement(originId); }}>
                        Consultar financeiro da matrícula de origem{origins.length > 1 ? ` ${index + 1}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              </td>
              <td className="px-3 py-3 align-top">
                <div className="space-y-1">
                  <p className="text-[8px] font-black uppercase tracking-wide text-slate-500">Matrícula</p>
                  <p className="text-[11px] font-extrabold tabular-nums text-emerald-700"><MoneyValue value={row.valorMatriculaEfetivo} valuesVisible={valuesVisible} /></p>
                  <p className="pt-0.5 text-[8px] font-black uppercase tracking-wide text-slate-500">Mensalidade</p>
                  <p className="text-[11px] font-bold tabular-nums text-slate-600"><MoneyValue value={row.valorMensalidadeEfetivo} valuesVisible={valuesVisible} /></p>
                </div>
              </td>
              <td className="px-3 py-3 align-top">
                <div className="pt-0.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[9px] font-bold text-slate-500">
                    <span>{row.parcelasPagas} de {row.totalParcelas} pagas</span>
                    <span className="tabular-nums">{row.progressoPercentual}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80" title={`${row.progressoPercentual}% pago`}>
                    <div
                      className={`h-full rounded-full ${row.situacaoFinanceira === 'INADIMPLENTE' ? 'bg-red-500' : 'bg-blue-500'}`}
                      style={{ width: `${row.progressoPercentual}%` }}
                    />
                  </div>
                </div>
              </td>
              <td className="px-3 py-3 align-top">
                <div className="space-y-1.5">
                  <MatriculaAcademicaBadge status={row.statusAcademico} />
                  {manualMode
                    ? <p className="max-w-52 text-[9px] font-bold leading-4 text-slate-600">Cobrança: {situationLabel(row)}</p>
                    : statusBadge(row)}
                  {!manualMode && row.financeiro.status === 'AGENDADA'
                    ? <p className="text-[8px] font-bold text-blue-600">{formatDateTime(row.financeiro.ativarEm)}</p>
                    : null}
                </div>
              </td>
              <td className="px-4 py-3 align-top text-right">
                <div
                  className="ml-auto max-w-[430px] space-y-2"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key !== 'Escape' || actionMenuId !== row.matriculaId) return;
                    event.preventDefault();
                    event.stopPropagation();
                    onActionMenuChange(null);
                    event.currentTarget.querySelector('[data-billing-toggle]')?.focus();
                  }}
                >
                  {manualMode || (row.cicloManual.matriculaLocal && onSettleEnrollment
                    && ['PENDENTE', 'VENCIDO'].includes(row.cicloManual.matriculaLocal.status)) ? (
                      <div className="rounded-xl border border-slate-200 bg-white/85 p-2 text-left shadow-sm">
                        <p className="mb-1 text-[8px] font-black uppercase tracking-[0.14em] text-slate-500">Próximo passo</p>
                        <div className="flex flex-wrap items-end justify-between gap-2">
                          {manualMode ? (
                            <FinanceiroCicloManualStatus
                              cicloManual={row.cicloManual}
                              statusAcademico={row.statusAcademico}
                              disabled={pending}
                              reviewingProesc={reviewingProesc && row.cicloManual.conferenciaProesc?.necessaria}
                              onGenerate={() => onOpenManualCycle(row.matriculaId)}
                              onResume={() => onResumeCycle(row)}
                            />
                          ) : null}
                          {row.cicloManual.matriculaLocal && onSettleEnrollment
                            && ['PENDENTE', 'VENCIDO'].includes(row.cicloManual.matriculaLocal.status) ? (
                              <button type="button" disabled={pending} onClick={() => onSettleEnrollment(row)}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[9px] font-black uppercase text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50">
                                Registrar recebimento da matrícula
                              </button>
                            ) : null}
                        </div>
                      </div>
                    ) : null}
                  <div className="flex flex-wrap items-center justify-end gap-1.5" role="group" aria-label={`Acessos financeiros de ${row.alunoNome}`}>
                    <span className="mr-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Acessos</span>
                    <FinanceiroAlunoCarneAction
                      row={row}
                      poloId={turma.poloId}
                      turmaId={turma.id}
                      disabled={pending}
                      onFeedback={onCarnetFeedback}
                    />
                    <button type="button" onClick={() => onOpenStatement(row.matriculaId)} title="Abrir extrato financeiro" aria-label={`Abrir extrato de ${row.alunoNome}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-2.5 text-[9px] font-black uppercase text-blue-700 transition-colors hover:bg-blue-100"><FileText size={14} /> Extrato</button>
                    {!protectedExisting && row.cicloManual.estado !== 'CICLOS_CONCLUIDOS' ? <button type="button" onClick={() => onOpenOverride(row.matriculaId)} title="Configuração individual" aria-label={`Configuração individual de ${row.alunoNome}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-100 bg-violet-50 px-2.5 text-[9px] font-black uppercase text-violet-700 transition-colors hover:bg-violet-100"><Settings2 size={14} /> Ajustes</button> : null}
                    {!manualMode ? <button
                        type="button"
                        data-billing-toggle
                        onClick={() => onActionMenuChange(actionMenuId === row.matriculaId ? null : row.matriculaId)}
                        title="Mais opções"
                        aria-label={`Mais opções para ${row.alunoNome}`}
                        aria-expanded={actionMenuId === row.matriculaId}
                        aria-controls={`financeiro-cobranca-${row.matriculaId}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[9px] font-black uppercase text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      >
                        <MoreHorizontal size={14} /> Cobrança
                      </button> : null}
                  </div>
                  {!manualMode && actionMenuId === row.matriculaId ? (
                    <div
                      id={`financeiro-cobranca-${row.matriculaId}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-left"
                      role="group"
                      aria-label={`Ações de cobrança de ${row.alunoNome}`}
                    >
                      {canActivate ? (
                        <>
                          <p className="px-2 pb-1 pt-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Ativação financeira</p>
                          <button type="button" disabled={pending} onClick={() => onActivateNow(row)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><ReceiptText size={14} /> Gerar agora</button>
                          <button type="button" disabled={pending} onClick={() => onSchedule(row)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] font-black uppercase text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><CalendarClock size={14} /> Agendar geração</button>
                        </>
                      ) : <p className="px-2.5 py-2 text-[10px] font-bold text-slate-500">Nenhuma ação pendente.</p>}
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
