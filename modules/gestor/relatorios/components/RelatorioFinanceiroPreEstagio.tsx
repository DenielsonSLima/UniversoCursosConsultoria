import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import {
  relatoriosService,
  RelatorioFinanceiroPreEstagioSituacao,
  RelatorioTurmaOption,
} from '../relatorios.service';
import {
  A4ReportShell,
  EmptyReportState,
  FilterField,
  FilterSelect,
  formatCurrency,
  ReportFilterPanel,
  ReportKpiCard,
  ReportMetaCard,
  SummaryCard,
} from './RelatorioShared';

interface RelatorioFinanceiroPreEstagioProps {
  company: any;
  polo: any;
}

const reportQueryKey = (turmaId: string) => ['relatorios', 'financeiro-pre-estagio', turmaId] as const;

const situacaoLabel: Record<RelatorioFinanceiroPreEstagioSituacao, string> = {
  QUITADO: 'Sem parcelas em aberto',
  PENDENTE: 'Pendência financeira',
  CADASTRO_INCOMPLETO: 'Cobranças não geradas',
};

const situacaoClass: Record<RelatorioFinanceiroPreEstagioSituacao, string> = {
  QUITADO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDENTE: 'bg-red-50 text-red-700 border-red-200',
  CADASTRO_INCOMPLETO: 'bg-amber-50 text-amber-700 border-amber-200',
};

const RelatorioFinanceiroPreEstagio: React.FC<RelatorioFinanceiroPreEstagioProps> = ({ company, polo }) => {
  const queryClient = useQueryClient();
  const [turmaId, setTurmaId] = useState('');
  const poloId = polo?.id;

  const {
    data: turmas = [],
    isLoading: loadingTurmas,
    isError: turmasError,
  } = useQuery<RelatorioTurmaOption[]>({
    queryKey: ['relatorios', 'financeiro-pre-estagio', 'turmas', poloId || 'matriz'],
    queryFn: () => relatoriosService.getTurmasOptions('TECNICO', poloId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!turmas.length) {
      setTurmaId('');
      return;
    }
    if (!turmas.some((turma) => turma.id === turmaId)) {
      setTurmaId(turmas[0].id);
    }
  }, [turmas, turmaId]);

  const {
    data,
    isLoading: loadingReport,
    isFetching,
    isError: reportError,
  } = useQuery({
    queryKey: reportQueryKey(turmaId),
    queryFn: () => relatoriosService.getFinanceiroPreEstagioTurma(turmaId),
    enabled: Boolean(turmaId),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!turmaId) return;

    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: reportQueryKey(turmaId) });
    };
    const channel = supabase
      .channel(`relatorio-financeiro-pre-estagio-${turmaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contas_receber', filter: `turma_id=eq.${turmaId}` },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matriculas', filter: `turma_id=eq.${turmaId}` },
        refresh,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, turmaId]);

  const selectedTurma = turmas.find((turma) => turma.id === turmaId);
  const totals = useMemo(() => {
    const alunos = data?.alunos || [];
    return {
      alunosAtivos: alunos.length,
      alunosSemAberto: alunos.filter((aluno) => aluno.situacao === 'QUITADO').length,
      parcelasPagas: alunos.reduce((total, aluno) => total + aluno.parcelasPagas, 0),
      parcelasEmAberto: alunos.reduce((total, aluno) => total + aluno.parcelasEmAberto, 0),
      parcelasVencidas: alunos.reduce((total, aluno) => total + aluno.parcelasVencidas, 0),
      parcelasNaoGeradas: alunos.reduce((total, aluno) => total + aluno.parcelasNaoGeradas, 0),
      valorEmAberto: alunos.reduce((total, aluno) => total + aluno.valorEmAberto, 0),
    };
  }, [data]);

  const hasError = turmasError || reportError;
  const loading = loadingTurmas || (Boolean(turmaId) && loadingReport);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full w-full">
      <ReportFilterPanel
        title="Turma para conferência"
        summary={
          <>
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Resumo pré-estágio
              </h4>
              {isFetching && !loadingReport && (
                <span className="text-[8px] font-black text-blue-600 uppercase tracking-wider">Atualizando</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SummaryCard label="Alunos ativos" value={totals.alunosAtivos} tone="blue" />
              <SummaryCard label="Sem parcelas abertas" value={totals.alunosSemAberto} tone="emerald" />
              <SummaryCard label="Parcelas abertas" value={totals.parcelasEmAberto} tone="amber" />
              <SummaryCard label="Parcelas vencidas" value={totals.parcelasVencidas} tone="red" />
            </div>
            {totals.parcelasNaoGeradas > 0 && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[9px] font-bold leading-relaxed text-amber-800">
                Existem {totals.parcelasNaoGeradas} parcela(s) prevista(s) ainda sem cobrança gerada.
              </p>
            )}
          </>
        }
      >
        <FilterField label="Turma técnica">
          <FilterSelect value={turmaId} onChange={(event) => setTurmaId(event.target.value)}>
            {!turmas.length && <option value="">Nenhuma turma disponível</option>}
            {turmas.map((turma) => (
              <option key={turma.id} value={turma.id}>
                {turma.nome} {turma.codigo ? `(${turma.codigo})` : ''}
              </option>
            ))}
          </FilterSelect>
        </FilterField>
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
          <p className="text-[9px] font-black uppercase tracking-wider text-blue-700">Regra do relatório</p>
          <p className="mt-1 text-[10px] font-medium leading-relaxed text-blue-900">
            Conta somente mensalidades/parcelas do curso. A matrícula inicial não entra nos totais.
          </p>
        </div>
      </ReportFilterPanel>

      <A4ReportShell
        company={company}
        polo={polo}
        loading={loading}
        rightTitle="Conferência Pré-Estágio"
        rightType="Financeiro da Turma"
        title="Relatório Financeiro da Turma — Antes do Estágio"
        description="Relação dos alunos ativos da turma e a situação das parcelas do curso. A cobrança da matrícula inicial é excluída desta conferência."
        meta={
          <>
            <ReportMetaCard
              label="Turma selecionada"
              value={selectedTurma ? `${selectedTurma.nome}${selectedTurma.codigo ? ` (${selectedTurma.codigo})` : ''}` : 'Nenhuma'}
            />
            <ReportMetaCard label="Curso" value={data?.turma.cursoNome || '—'} />
            <ReportMetaCard
              label="Parcelas previstas"
              value={data?.turma.parcelasPrevistas ? `${data.turma.parcelasPrevistas} + matrícula fora` : 'Conforme cobranças'}
            />
          </>
        }
        kpis={
          <>
            <ReportKpiCard label="Alunos ativos" value={totals.alunosAtivos} tone="blue" />
            <ReportKpiCard label="Sem parcelas abertas" value={totals.alunosSemAberto} tone="emerald" />
            <ReportKpiCard label="Total em aberto" value={formatCurrency(totals.valorEmAberto)} tone="red" />
          </>
        }
      >
        {hasError ? (
          <EmptyReportState message="Não foi possível carregar a conferência financeira. Tente novamente." />
        ) : !turmaId ? (
          <EmptyReportState message="Nenhuma turma técnica disponível para esta unidade." />
        ) : !data?.alunos.length ? (
          <EmptyReportState message="Nenhum aluno ativo encontrado na turma selecionada." />
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-slate-300 bg-slate-50 text-[8px] font-black uppercase tracking-wider text-slate-500">
                <th className="px-2 py-2">Aluno</th>
                <th className="px-2 py-2">Matrícula</th>
                <th className="px-2 py-2 text-center">Pagas / previstas</th>
                <th className="px-2 py-2 text-center">Em aberto</th>
                <th className="px-2 py-2 text-center">Vencidas</th>
                <th className="px-2 py-2 text-right">Valor aberto</th>
                <th className="px-2 py-2">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.alunos.map((aluno) => (
                <tr key={aluno.matriculaId} className="text-[9px] text-slate-700">
                  <td className="px-2 py-2.5">
                    <p className="font-black text-[#001a33]">{aluno.alunoNome}</p>
                    <p className="mt-0.5 text-[7px] text-slate-400">{aluno.alunoCpf}</p>
                  </td>
                  <td className="px-2 py-2.5 font-mono text-[8px] text-slate-500">{aluno.matricula}</td>
                  <td className="px-2 py-2.5 text-center">
                    <span className="font-black text-emerald-700">{aluno.parcelasPagas}</span>
                    <span className="text-slate-400"> / {aluno.parcelasPrevistas || aluno.parcelasRegistradas}</span>
                  </td>
                  <td className="px-2 py-2.5 text-center font-black text-amber-700">{aluno.parcelasEmAberto}</td>
                  <td className="px-2 py-2.5 text-center font-black text-red-600">{aluno.parcelasVencidas}</td>
                  <td className="px-2 py-2.5 text-right font-black text-slate-700">{formatCurrency(aluno.valorEmAberto)}</td>
                  <td className="px-2 py-2.5">
                    <span className={`inline-flex rounded-lg border px-2 py-1 text-[7px] font-black uppercase ${situacaoClass[aluno.situacao]}`}>
                      {situacaoLabel[aluno.situacao]}
                    </span>
                    {aluno.parcelasNaoGeradas > 0 && (
                      <p className="mt-1 text-[7px] font-bold text-amber-700">
                        {aluno.parcelasNaoGeradas} não gerada(s)
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 text-[9px] font-black text-[#001a33]">
                <td className="px-2 py-2.5" colSpan={2}>Totais da turma</td>
                <td className="px-2 py-2.5 text-center text-emerald-700">{totals.parcelasPagas} pagas</td>
                <td className="px-2 py-2.5 text-center text-amber-700">{totals.parcelasEmAberto}</td>
                <td className="px-2 py-2.5 text-center text-red-600">{totals.parcelasVencidas}</td>
                <td className="px-2 py-2.5 text-right">{formatCurrency(totals.valorEmAberto)}</td>
                <td className="px-2 py-2.5" />
              </tr>
            </tfoot>
          </table>
        )}
      </A4ReportShell>
    </div>
  );
};

export default RelatorioFinanceiroPreEstagio;
