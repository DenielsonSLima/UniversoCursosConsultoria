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
import FinanceiroAtivacaoLegacyDialog, {
  type FinanceiroAtivacaoLegacyAction,
} from './FinanceiroAtivacaoLegacyDialog';
import FinanceiroCicloManualDialog from './FinanceiroCicloManualDialog';
import FinanceiroCicloManualStatus, {
  getFinanceiroSituationLabel as situationLabel,
  MatriculaAcademicaBadge,
} from './FinanceiroCicloManualStatus';
import type {
  MatriculaTecnicaAtivacaoModo,
  MatriculaTecnicaFinanceiroRow,
  MatriculaTecnicaFinanceiroWorkspace,
  MatriculaTecnicaRegra,
} from './matricula-tecnica-financeiro.types';
import type { CicloFinanceiroTecnicoManualPreview } from './matricula-tecnica-ciclo-manual.types';
import {
  createFinanceiroRequestId,
  useAtivarFinanceiroMatriculaTecnica,
  useAtivarFinanceiroMatriculasTecnicasLote,
} from './hooks/useMatriculaTecnicaFinanceiro';
import {
  useGerarCicloFinanceiroTecnicoManual,
  useRetomarEmissaoCicloFinanceiroTecnicoManual,
} from './hooks/useMatriculaTecnicaCicloManual';
import {
  isFinanceiroDateRejected,
  isRegraFinanceiraConflict,
} from './matricula-tecnica-financeiro.service';
import {
  getCicloFinanceiroTecnicoManualRecoveryGuidance,
  isCicloFinanceiroTecnicoManualIssuanceError,
  requireMatriculaTecnicaCicloManual,
} from './matricula-tecnica-ciclo-manual.service';

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
  const [pendingAction, setPendingAction] = useState<FinanceiroAtivacaoLegacyAction | null>(null);
  const [ativarEm, setAtivarEm] = useState('');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [overrideMatriculaId, setOverrideMatriculaId] = useState<string | null>(null);
  const [manualCycleMatriculaId, setManualCycleMatriculaId] = useState<string | null>(null);
  const requestIds = useRef(new Map<string, string>());
  const individualMutation = useAtivarFinanceiroMatriculaTecnica();
  const batchMutation = useAtivarFinanceiroMatriculasTecnicasLote();
  const manualCycleMutation = useGerarCicloFinanceiroTecnicoManual();
  const resumeCycleMutation = useRetomarEmissaoCicloFinanceiroTecnicoManual();
  const pending = individualMutation.isPending
    || batchMutation.isPending
    || manualCycleMutation.isPending
    || resumeCycleMutation.isPending;

  const closeActionDialog = () => {
    setPendingAction(null);
    setAtivarEm('');
  };
  const filteredAlunos = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase('pt-BR');
    if (!search) return alunos;
    return alunos.filter((row) => row.alunoNome.toLocaleLowerCase('pt-BR').includes(search)
      || row.matriculaExibicao.toLocaleLowerCase('pt-BR').includes(search));
  }, [alunos, searchTerm]);
  const manualContractError = useMemo(() => {
    try {
      alunos.forEach((row) => requireMatriculaTecnicaCicloManual(row.cicloManual));
      return null;
    } catch (error) {
      return error instanceof Error ? error : new Error('Estado manual inválido.');
    }
  }, [alunos]);
  if (!isLoading && !isError && manualContractError) {
    return (
      <TechnicalDataError
        title="Ciclos financeiros não carregados"
        message={`${manualContractError.message} A lista foi bloqueada para impedir uma geração permissiva.`}
        retrying={isFetching}
        onRetry={onRetry}
      />
    );
  }
  const pendingRows = alunos.filter((row) => (
    row.financeiro.status === 'PENDENTE'
    && !(row.cicloManual.habilitado && row.cicloManual.modo === 'MANUAL')
  ));
  const pendingIds = new Set(pendingRows.map((row) => row.matriculaId));
  const eligibleSelected = selectedPending.filter((id) => pendingIds.has(id));
  const currentOverrideRow = overrideMatriculaId
    ? alunos.find((row) => row.matriculaId === overrideMatriculaId) || null
    : null;
  const currentManualCycleRow = manualCycleMatriculaId
    ? alunos.find((row) => row.matriculaId === manualCycleMatriculaId) || null
    : null;

  const exportRows = filteredAlunos.map((row) => ({
    id: row.matriculaId,
    cells: [
      <div key="aluno"><p className="font-black text-[#001a33]">{row.alunoNome}</p><p className="mt-0.5 text-[8px] font-bold uppercase text-slate-400">{situationLabel(row)}</p></div>,
      <span key="matricula" className="font-mono text-[9px]">{row.matriculaExibicao}</span>,
      <div key="valores"><p className="font-black text-emerald-700">Mat. {formatMoney(row.valorMatriculaEfetivo)}</p><p className="mt-0.5 font-bold text-slate-500">Mens. {formatMoney(row.valorMensalidadeEfetivo)}</p></div>,
      <span key="progresso" className="font-black text-[#001a33]">{row.parcelasPagas}/{row.totalParcelas}</span>,
      <span key="status" className="font-black uppercase text-slate-600">Matrícula {row.statusAcademico} · Cobrança {situationLabel(row)}</span>,
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

  const generateManualCycle = async (
    row: MatriculaTecnicaFinanceiroRow,
    preview: CicloFinanceiroTecnicoManualPreview,
    primeiroVencimento: string | null,
  ) => {
    const key = [
      'ciclo-manual',
      row.matriculaId,
      preview.cicloNumero,
      primeiroVencimento || 'turma',
      preview.regraEfetivaFingerprint,
      preview.politicaFingerprint,
      preview.cronogramaFingerprint,
    ].join(':');
    const requestId = getRequestId(key);
    try {
      const result = await manualCycleMutation.mutateAsync({
        turmaId: turma.id,
        matriculaId: row.matriculaId,
        cicloNumero: preview.cicloNumero,
        primeiroVencimento,
        requestId,
        expectedRegraFingerprint: preview.regraEfetivaFingerprint,
        expectedPoliticaFingerprint: preview.politicaFingerprint,
        expectedCronogramaFingerprint: preview.cronogramaFingerprint,
      });
      requestIds.current.delete(key);
      setManualCycleMatriculaId(null);
      toast.success(
        `${result.ciclo.numero}º ciclo gerado e emitido`,
        `${result.ciclo.quantidadeItens} cobranças e ${result.ciclo.emitidosBanese} títulos BolePix Banese já estão disponíveis em Financeiro.`,
      );
    } catch (error) {
      if (isCicloFinanceiroTecnicoManualIssuanceError(error) && error.progress) {
        setManualCycleMatriculaId(null);
        toast.warning(
          'Emissão interrompida',
          `${error.message} ${error.progress.emitidosBanese}/${error.progress.quantidadeItens} títulos emitidos. ${getCicloFinanceiroTecnicoManualRecoveryGuidance(error)}`,
        );
        return;
      }
      if (isRegraFinanceiraConflict(error)) {
        setManualCycleMatriculaId(null);
        onRetry();
        toast.warning('Prévia desatualizada', 'A regra ou o cronograma mudou. Abra novamente e confirme a nova prévia.');
        return;
      }
      if (isFinanceiroDateRejected(error)) {
        toast.warning(
          'Vencimento não aceito',
          preview.cicloNumero === 2
            ? 'Informe uma data individual futura válida para o 2º ciclo e confirme novamente.'
            : 'Revise a data individual ou use as datas configuradas na turma.',
        );
        return;
      }
      toast.error(
        'Ciclo não emitido',
        `${error instanceof Error ? error.message : 'O servidor não confirmou a operação.'} A mesma solicitação pode ser repetida sem duplicar cobranças.`,
      );
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
          <table className="w-full min-w-[1100px] text-left">
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
                const manualMode = row.cicloManual.habilitado && row.cicloManual.modo === 'MANUAL';
                const canActivate = !manualMode
                  && row.financeiro.status === 'PENDENTE'
                  && Boolean(row.regraEfetiva);
                const protectedExisting = manualMode
                  && row.cicloManual.estado === 'PROTEGIDO_EXISTENTE';
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
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        <MatriculaAcademicaBadge status={row.statusAcademico} />
                        {manualMode ? <p className="text-[9px] font-black uppercase text-slate-600">Cobrança: {situationLabel(row)}</p> : statusBadge(row)}
                        {!manualMode && row.financeiro.status === 'AGENDADA' ? <p className="text-[8px] font-bold text-blue-600">{formatDateTime(row.financeiro.ativarEm)}</p> : null}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="relative flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                        {manualMode ? (
                          <FinanceiroCicloManualStatus
                            cicloManual={row.cicloManual}
                            disabled={pending}
                            onGenerate={() => setManualCycleMatriculaId(row.matriculaId)}
                            onResume={() => resumeCycleMutation.mutate({
                              turmaId: turma.id,
                              matriculaId: row.matriculaId,
                              cicloNumero: row.cicloManual.cicloGerado!.numero,
                            }, {
                              onSuccess: (result) => toast.success('Emissão retomada', `${result.ciclo.emitidosBanese}/${result.ciclo.quantidadeItens} títulos BolePix emitidos e disponíveis em Financeiro.`),
                              onError: (error) => toast.error('Emissão não concluída', `${error instanceof Error ? error.message : 'O banco não confirmou todos os títulos.'} O progresso foi preservado. ${getCicloFinanceiroTecnicoManualRecoveryGuidance(error)}`),
                            })}
                          />
                        ) : null}
                        <button type="button" onClick={() => setSelectedMatriculaId(row.matriculaId)} title="Extrato Financeiro" className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-blue-600 transition-colors hover:bg-blue-100"><FileText size={16} /></button>
                        {!protectedExisting ? <button type="button" onClick={() => setOverrideMatriculaId(row.matriculaId)} title="Configuração individual" className="rounded-lg border border-violet-100 bg-violet-50 p-2 text-violet-600 transition-colors hover:bg-violet-100"><Settings2 size={16} /></button> : null}
                        {!manualMode ? <button type="button" onClick={() => setActionMenuId((current) => current === row.matriculaId ? null : row.matriculaId)} title="Mais opções" className="rounded-lg border border-transparent p-2 text-slate-400 transition-colors hover:border-slate-200 hover:bg-slate-100 hover:text-slate-600"><MoreHorizontal size={16} /></button> : null}
                        {!manualMode && actionMenuId === row.matriculaId ? (
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
        <FinanceiroAtivacaoLegacyDialog
          action={pendingAction}
          alunos={alunos}
          ativarEm={ativarEm}
          pending={pending}
          onAtivarEmChange={setAtivarEm}
          onClose={closeActionDialog}
          onConfirm={() => {
            void activate(
              pendingAction.matriculaIds,
              pendingAction.modo,
              pendingAction.modo === 'AGENDADA' ? new Date(ativarEm).toISOString() : undefined,
            );
          }}
        />
      ) : null}

      {currentManualCycleRow ? (
        <FinanceiroCicloManualDialog
          key={currentManualCycleRow.matriculaId}
          row={currentManualCycleRow}
          pending={manualCycleMutation.isPending}
          onClose={() => setManualCycleMatriculaId(null)}
          onConfirm={(preview, primeiroVencimento) => (
            generateManualCycle(currentManualCycleRow, preview, primeiroVencimento)
          )}
        />
      ) : null}

      {currentOverrideRow ? <FinanceiroAlunoOverrideDialog row={currentOverrideRow} regraTurma={regra} turmaId={turma.id} onClose={() => setOverrideMatriculaId(null)} /> : null}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </>
  );
};

export default FinanceiroAlunosList;
