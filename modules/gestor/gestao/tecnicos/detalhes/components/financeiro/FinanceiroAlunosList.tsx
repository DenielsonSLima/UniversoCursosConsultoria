import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MoreHorizontal,
  ReceiptText,
  Search,
  Settings2,
  XCircle,
} from 'lucide-react';
import ToastNotification, { useToast } from '../../../../../parceiros/components/shared/ToastNotification';
import FinancialReportExportButton from '../../../../../financeiro/components/FinancialReportPreview';
import type { Turma } from '../../../../gestao.types';
import TechnicalDataError from '../TechnicalDataError';
import AlunoFinanceiroExtrato from './extrato/AlunoFinanceiroExtrato';
import FinanceiroAlunoOverrideDialog from './FinanceiroAlunoOverrideDialog';
import type {
  MatriculaTecnicaAtivacaoModo,
  MatriculaTecnicaFinanceiroRow,
  MatriculaTecnicaFinanceiroWorkspace,
  MatriculaTecnicaRegra,
} from './matricula-tecnica-financeiro.types';
import {
  createFinanceiroRequestId,
  useAtivarFinanceiroMatriculaTecnica,
  useAtivarFinanceiroMatriculasTecnicasLote,
} from './hooks/useMatriculaTecnicaFinanceiro';
import { useAccessibleDialog } from './hooks/useAccessibleDialog';
import {
  isFinanceiroDateRejected,
  isRegraFinanceiraConflict,
} from './matricula-tecnica-financeiro.service';

interface FinanceiroAlunosListProps {
  turma: Turma;
  regra: MatriculaTecnicaRegra;
  resumo: MatriculaTecnicaFinanceiroWorkspace['resumo'];
  alunos: MatriculaTecnicaFinanceiroRow[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
}

interface PendingAction {
  matriculaIds: string[];
  label: string;
  modo: MatriculaTecnicaAtivacaoModo;
}

const formatMoney = (value: string | null | undefined) => {
  if (value === null || value === undefined || value.trim() === '') return '—';
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

const situationLabel = (row: MatriculaTecnicaFinanceiroRow) => {
  if (row.financeiro.status === 'NAO_CONFIGURADO') return 'Não configurado';
  if (row.financeiro.status === 'PENDENTE') return 'Pendente';
  if (row.financeiro.status === 'AGENDADA') return 'Agendada';
  if (row.financeiro.status === 'ATIVADA') return 'Ativada';
  return row.situacaoFinanceira === 'INADIMPLENTE'
    ? 'Gerada · Inadimplente'
    : 'Gerada';
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

const FinanceiroAlunosList: React.FC<FinanceiroAlunosListProps> = ({
  turma,
  regra,
  resumo,
  alunos,
  isLoading,
  isError,
  isFetching,
  onRetry,
}) => {
  const { toasts, removeToast, toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMatriculaId, setSelectedMatriculaId] = useState<string | null>(null);
  const [selectedPending, setSelectedPending] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [ativarEm, setAtivarEm] = useState('');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [overrideMatriculaId, setOverrideMatriculaId] = useState<string | null>(null);
  const requestIds = useRef(new Map<string, string>());
  const individualMutation = useAtivarFinanceiroMatriculaTecnica();
  const batchMutation = useAtivarFinanceiroMatriculasTecnicasLote();
  const pending = individualMutation.isPending || batchMutation.isPending;

  const closeActionDialog = () => {
    setPendingAction(null);
    setAtivarEm('');
  };
  const { dialogRef, initialFocusRef } = useAccessibleDialog(
    Boolean(pendingAction),
    closeActionDialog,
    pending,
  );

  const filteredAlunos = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase('pt-BR');
    if (!search) return alunos;
    return alunos.filter((row) => row.alunoNome.toLocaleLowerCase('pt-BR').includes(search)
      || row.matriculaExibicao.toLocaleLowerCase('pt-BR').includes(search));
  }, [alunos, searchTerm]);
  const pendingRows = alunos.filter((row) => row.financeiro.status === 'PENDENTE');
  const pendingIds = new Set(pendingRows.map((row) => row.matriculaId));
  const eligibleSelected = selectedPending.filter((id) => pendingIds.has(id));
  const actionRows = pendingAction?.matriculaIds
    .map((id) => alunos.find((row) => row.matriculaId === id))
    .filter((row): row is MatriculaTecnicaFinanceiroRow => Boolean(row)) || [];
  const actionRule = actionRows.length === 1 ? actionRows[0].regraEfetiva : null;
  const currentOverrideRow = overrideMatriculaId
    ? alunos.find((row) => row.matriculaId === overrideMatriculaId) || null
    : null;

  const exportRows = filteredAlunos.map((row) => ({
    id: row.matriculaId,
    cells: [
      <div key="aluno"><p className="font-black text-[#001a33]">{row.alunoNome}</p><p className="mt-0.5 text-[8px] font-bold uppercase text-slate-400">{situationLabel(row)}</p></div>,
      <span key="matricula" className="font-mono text-[9px]">{row.matriculaExibicao}</span>,
      <div key="valores"><p className="font-black text-emerald-700">Mat. {formatMoney(row.valorMatriculaEfetivo)}</p><p className="mt-0.5 font-bold text-slate-500">Mens. {formatMoney(row.valorMensalidadeEfetivo)}</p></div>,
      <span key="progresso" className="font-black text-[#001a33]">{row.parcelasPagas}/{row.totalParcelas}</span>,
      <span key="status" className="font-black uppercase text-slate-600">{situationLabel(row)}</span>,
    ],
  }));

  const getRequestId = (key: string) => {
    const current = requestIds.current.get(key);
    if (current) return current;
    const requestId = createFinanceiroRequestId();
    requestIds.current.set(key, requestId);
    return requestId;
  };

  const activate = async (
    matriculaIds: string[],
    modo: MatriculaTecnicaAtivacaoModo,
    scheduledAt?: string,
  ) => {
    const rows = matriculaIds
      .map((id) => alunos.find((row) => row.matriculaId === id))
      .filter((row): row is MatriculaTecnicaFinanceiroRow => Boolean(
        row && row.financeiro.status === 'PENDENTE' && row.regraEfetiva,
      ))
      .sort((left, right) => left.matriculaId.localeCompare(right.matriculaId));
    if (rows.length === 0) {
      closeActionDialog();
      toast.info('Situação já atualizada', 'Nenhuma das matrículas selecionadas continua pendente.');
      return;
    }
    const identityKey = rows.map((row) => [
      row.matriculaId,
      row.override?.identidade.fingerprint || '',
      row.regraEfetiva?.identidade.efetivaFingerprint || '',
    ].join(':')).join(',');
    const key = `${modo}:${identityKey}:${scheduledAt || ''}:${regra.identidade.turmaFingerprint}`;
    const requestId = getRequestId(key);
    try {
      if (rows.length === 1) {
        const row = rows[0];
        await individualMutation.mutateAsync({
          turmaId: turma.id,
          matriculaId: row.matriculaId,
          modo,
          requestId,
          expectedTurmaRevisao: regra.identidade.turmaRevisao,
          expectedTurmaFingerprint: regra.identidade.turmaFingerprint,
          expectedOverrideRevisao: row.override?.identidade.revisao ?? 0,
          expectedOverrideFingerprint: row.override?.identidade.fingerprint ?? '',
          expectedEfetivaFingerprint: row.regraEfetiva?.identidade.efetivaFingerprint || '',
          ativarEm: scheduledAt || null,
        });
      } else {
        await batchMutation.mutateAsync({
          turmaId: turma.id,
          matriculaIds: rows.map((row) => row.matriculaId),
          modo,
          requestId,
          expectedTurmaRevisao: regra.identidade.turmaRevisao,
          expectedTurmaFingerprint: regra.identidade.turmaFingerprint,
          expectedRegras: rows.map((row) => ({
            matriculaId: row.matriculaId,
            overrideRevisao: row.override?.identidade.revisao ?? 0,
            overrideFingerprint: row.override?.identidade.fingerprint ?? '',
            efetivaFingerprint: row.regraEfetiva?.identidade.efetivaFingerprint || '',
          })),
          ativarEm: scheduledAt || null,
        });
      }
      requestIds.current.delete(key);
      setSelectedPending((current) => current.filter((id) => !rows.some((row) => row.matriculaId === id)));
      closeActionDialog();
      toast.success(
        modo === 'AGORA' ? 'Cobranças confirmadas' : 'Geração agendada',
        rows.length === 1
          ? 'O servidor atualizou a situação financeira do aluno.'
          : `O servidor processou o lote atômico de ${rows.length} matrículas.`,
      );
    } catch (error) {
      if (isRegraFinanceiraConflict(error)) {
        closeActionDialog();
        onRetry();
        toast.warning('Regra financeira alterada', 'Revise os novos valores da turma ou do aluno e confirme novamente.');
        return;
      }
      if (isFinanceiroDateRejected(error)) {
        toast.warning('Data não aceita pelo servidor', 'Informe uma data futura válida e confirme novamente.');
        return;
      }
      toast.error('Financeiro não atualizado', `${error instanceof Error ? error.message : 'O servidor não confirmou a operação.'} O retry reutilizará o mesmo identificador.`);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center rounded-[2rem] border border-slate-100 bg-white py-10 shadow-sm"><Loader2 className="animate-spin text-[#001a33]" size={24} /><span className="ml-2 text-sm font-bold text-slate-500">Carregando listagem financeira...</span></div>;
  }
  if (selectedMatriculaId) {
    return <AlunoFinanceiroExtrato matriculaId={selectedMatriculaId} onBack={() => setSelectedMatriculaId(null)} />;
  }
  if (isError) {
    return <TechnicalDataError title="Situação financeira dos alunos não carregada" message="A lista foi bloqueada para não confundir uma falha de consulta com ausência de cobrança." retrying={isFetching} onRetry={onRetry} />;
  }

  return (
    <>
      <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col items-center justify-between gap-4 border-b border-slate-100 p-6 md:flex-row">
          <div>
            <h3 className="text-lg font-bold text-[#001a33]">Situação Financeira dos Alunos</h3>
            <p className="mt-0.5 text-xs text-slate-500">Acompanhamento de mensalidades e conciliação.</p>
          </div>
          <div className="flex w-full flex-wrap gap-3 md:w-auto">
            {eligibleSelected.length > 0 ? (
              <>
                <button type="button" disabled={pending} onClick={() => setPendingAction({ matriculaIds: eligibleSelected, label: `${eligibleSelected.length} matrículas`, modo: 'AGORA' })} className="rounded-xl bg-emerald-600 px-3 py-2.5 text-[9px] font-black uppercase text-white disabled:opacity-40">Gerar lote ({eligibleSelected.length})</button>
                <button type="button" disabled={pending} onClick={() => setPendingAction({ matriculaIds: eligibleSelected, label: `${eligibleSelected.length} matrículas`, modo: 'AGENDADA' })} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-[9px] font-black uppercase text-blue-700 disabled:opacity-40">Agendar lote</button>
              </>
            ) : null}
            <div className="relative min-w-56 flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar aluno..." className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 outline-none transition-all focus:border-blue-500" />
            </div>
            <FinancialReportExportButton
              buttonLabel="Exportar"
              buttonClassName="border-0 bg-slate-100 text-slate-600 hover:bg-slate-200"
              title="Situação Financeira dos Alunos"
              subtitle="Acompanhamento das mensalidades e da conciliação financeira dos alunos vinculados à turma."
              rightTitle="Relatório Financeiro da Turma"
              rightType="Situação dos Alunos"
              recordLabel="aluno(s)"
              fileName={`situacao-financeira-${turma.codigo || turma.nome}`}
              poloId={turma.poloId}
              tone="blue"
              columns={[{ label: 'Aluno' }, { label: 'Matrícula' }, { label: 'Valores' }, { label: 'Pagas / total', align: 'center' }, { label: 'Status', align: 'center' }]}
              rows={exportRows}
              filters={[{ label: 'Turma', value: `${turma.nome}${turma.codigo ? ` (${turma.codigo})` : ''}` }, { label: 'Curso', value: turma.cursoNome }, { label: 'Unidade / Polo', value: turma.poloNome || 'Matriz' }]}
              summaryCards={[{ label: 'Plano lançado', value: formatMoney(resumo.total), tone: 'blue' }, { label: 'Recebido', value: formatMoney(resumo.recebido), tone: 'emerald' }, { label: 'Inadimplência', value: formatMoney(resumo.inadimplencia), tone: Number(resumo.inadimplencia) > 0 ? 'rose' : 'slate' }]}
              footerNote={searchTerm ? `Relatório filtrado pela busca: "${searchTerm}".` : 'Relação completa dos alunos exibidos na situação financeira da turma.'}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-500">Aluno</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-500">Matrícula</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-500">Valores</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-500">Progresso Pagto.</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-4 text-right text-xs font-black uppercase tracking-wider text-slate-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredAlunos.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400"><XCircle size={32} className="mx-auto mb-2 text-slate-300 opacity-50" /><p className="font-bold">Nenhum aluno matriculado na turma.</p></td></tr>
              ) : filteredAlunos.map((row) => {
                const canActivate = row.financeiro.status === 'PENDENTE' && Boolean(row.regraEfetiva);
                return (
                  <tr key={row.matriculaId} onClick={() => setSelectedMatriculaId(row.matriculaId)} className="group cursor-pointer transition-colors hover:bg-blue-50/30" title="Abrir extrato financeiro do aluno">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {canActivate ? <input type="checkbox" aria-label={`Selecionar ${row.alunoNome}`} checked={eligibleSelected.includes(row.matriculaId)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedPending((current) => event.target.checked ? [...new Set([...current, row.matriculaId])] : current.filter((id) => id !== row.matriculaId))} /> : null}
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-xs font-bold text-slate-500 shadow-sm">{row.alunoNome.charAt(0)}</div>
                        <div><span className="text-sm font-bold text-[#001a33]">{row.alunoNome}</span>{row.overrideAtivo ? <p className="mt-0.5 text-[8px] font-black uppercase text-violet-600">Regra individual</p> : null}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-slate-500">{row.matriculaExibicao}</td>
                    <td className="px-6 py-4"><div className="space-y-1"><p className="text-[10px] font-black uppercase text-emerald-700">Mat. {formatMoney(row.valorMatriculaEfetivo)}</p><p className="text-[10px] font-bold uppercase text-slate-500">Mens. {formatMoney(row.valorMensalidadeEfetivo)}</p></div></td>
                    <td className="px-6 py-4"><div className="flex items-center gap-2"><div className="h-2 w-24 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${row.situacaoFinanceira === 'INADIMPLENTE' ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${row.progressoPercentual}%` }} /></div><span className="text-[10px] font-bold text-slate-500">{row.parcelasPagas}/{row.totalParcelas}</span></div></td>
                    <td className="px-6 py-4">{statusBadge(row)}{row.financeiro.status === 'AGENDADA' ? <p className="mt-1 text-[8px] font-bold text-blue-600">{formatDateTime(row.financeiro.ativarEm)}</p> : null}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="relative flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => setSelectedMatriculaId(row.matriculaId)} title="Extrato Financeiro" className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-blue-600 transition-colors hover:bg-blue-100"><FileText size={16} /></button>
                        <button type="button" onClick={() => setOverrideMatriculaId(row.matriculaId)} title="Configuração individual" className="rounded-lg border border-violet-100 bg-violet-50 p-2 text-violet-600 transition-colors hover:bg-violet-100"><Settings2 size={16} /></button>
                        <button type="button" onClick={() => setActionMenuId((current) => current === row.matriculaId ? null : row.matriculaId)} title="Mais opções" className="rounded-lg border border-transparent p-2 text-slate-400 transition-colors hover:border-slate-200 hover:bg-slate-100 hover:text-slate-600"><MoreHorizontal size={16} /></button>
                        {actionMenuId === row.matriculaId ? (
                          <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-slate-100 bg-white p-2 text-left shadow-xl">
                            {canActivate ? <><button type="button" disabled={pending} onClick={() => { setActionMenuId(null); setPendingAction({ matriculaIds: [row.matriculaId], label: row.alunoNome, modo: 'AGORA' }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-50"><ReceiptText size={14} /> Gerar agora</button><button type="button" disabled={pending} onClick={() => { setActionMenuId(null); setPendingAction({ matriculaIds: [row.matriculaId], label: row.alunoNome, modo: 'AGENDADA' }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-black uppercase text-blue-700 hover:bg-blue-50"><CalendarClock size={14} /> Agendar</button></> : <p className="px-3 py-2 text-[10px] font-bold text-slate-400">Sem ação pendente.</p>}
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
      </section>

      {pendingAction ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="schedule-finance-title" tabIndex={-1} className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
            <h3 id="schedule-finance-title" className="text-lg font-black text-[#001a33]">{pendingAction.modo === 'AGORA' ? 'Confirmar geração inicial' : 'Agendar geração'}</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">{pendingAction.label}.</p>
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
              <strong className="block text-[10px] font-black uppercase">Regra efetiva confirmada pelo servidor</strong>
              {actionRule
                ? `${actionRows[0].overrideAtivo ? 'Regra individual. ' : 'Regra da turma. '}${actionRule.cobranca.matricula.habilitada ? `Matrícula inicial: ${formatMoney(actionRule.cobranca.matricula.valor)}.` : `Primeiro ciclo: ${actionRule.cobranca.mensalidade.quantidade} mensalidades de ${formatMoney(actionRule.cobranca.mensalidade.valor)}.`}`
                : 'Cada aluno do lote será validado com sua própria regra efetiva (turma mais eventuais configurações individuais).'}
            </div>
            {pendingAction.modo === 'AGENDADA' ? <label className="mt-5 block space-y-2"><span className="text-[10px] font-black uppercase text-slate-500">Executar em</span><input type="datetime-local" value={ativarEm} onChange={(event) => setAtivarEm(event.target.value)} className="w-full rounded-xl border border-slate-200 p-3 text-sm font-bold outline-none focus:border-blue-500" /></label> : null}
            <div className="mt-5 flex gap-3"><button ref={(node) => { initialFocusRef.current = node; }} type="button" disabled={pending} onClick={closeActionDialog} className="flex-1 rounded-xl border border-slate-200 py-3 text-[10px] font-black uppercase text-slate-500">Cancelar</button><button type="button" disabled={pending || (pendingAction.modo === 'AGENDADA' && !ativarEm)} onClick={() => { void activate(pendingAction.matriculaIds, pendingAction.modo, pendingAction.modo === 'AGENDADA' ? new Date(ativarEm).toISOString() : undefined); }} className="flex-1 rounded-xl bg-blue-600 py-3 text-[10px] font-black uppercase text-white disabled:opacity-50">{pending ? 'Processando...' : 'Confirmar'}</button></div>
          </div>
        </div>
      ) : null}

      {currentOverrideRow ? <FinanceiroAlunoOverrideDialog row={currentOverrideRow} regraTurma={regra} turmaId={turma.id} onClose={() => setOverrideMatriculaId(null)} /> : null}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </>
  );
};

export default FinanceiroAlunosList;
