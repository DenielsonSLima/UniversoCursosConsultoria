import React, { useEffect, useMemo, useState } from 'react';
import { relatoriosService, RelatorioFinanceiroMensalItem, RelatorioFinanceiroStatus, RelatorioModalidade, RelatorioTipoLancamento, RelatorioTurmaOption } from '../relatorios.service';
import {
  A4ReportShell,
  EmptyReportState,
  FilterField,
  FilterInput,
  FilterSelect,
  formatCompetencia,
  formatCurrency,
  formatDate,
  MODALIDADE_LABELS,
  ReportFilterPanel,
  ReportKpiCard,
  ReportMetaCard,
  STATUS_LABELS,
  SummaryCard,
} from './RelatorioShared';

interface RelatorioFinanceiroTurmaMensalProps {
  company: any;
  polo: any;
}

const currentCompetencia = () => new Date().toISOString().slice(0, 7);

const tipoLabels: Record<string, string> = {
  todos: 'Todos',
  MATRICULA: 'Matrícula',
  PARCELA: 'Mensalidade / Parcela',
  REMATRICULA: 'Rematrícula',
  AVULSO: 'Avulso',
};

const RelatorioFinanceiroTurmaMensal: React.FC<RelatorioFinanceiroTurmaMensalProps> = ({ company, polo }) => {
  const [items, setItems] = useState<RelatorioFinanceiroMensalItem[]>([]);
  const [turmas, setTurmas] = useState<RelatorioTurmaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [competencia, setCompetencia] = useState(currentCompetencia());
  const [modalidade, setModalidade] = useState<RelatorioModalidade>('todos');
  const [turmaId, setTurmaId] = useState('todos');
  const [status, setStatus] = useState<RelatorioFinanceiroStatus>('todos');
  const [tipoLancamento, setTipoLancamento] = useState<RelatorioTipoLancamento>('todos');

  const poloId = polo?.id;

  useEffect(() => {
    let mounted = true;
    relatoriosService.getTurmasOptions(modalidade, poloId)
      .then((rows) => {
        if (!mounted) return;
        setTurmas(rows);
        if (turmaId !== 'todos' && !rows.some(row => row.id === turmaId)) setTurmaId('todos');
      })
      .catch((err) => console.error('Erro ao carregar turmas do relatório:', err));
    return () => { mounted = false; };
  }, [modalidade, poloId, turmaId]);

  useEffect(() => {
    fetchData();
  }, [competencia, modalidade, turmaId, status, tipoLancamento, poloId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const rows = await relatoriosService.getFinanceiroTurmaMensal({
        competencia,
        modalidade,
        turmaId,
        poloId,
        status,
        tipoLancamento,
      });
      setItems(rows);
    } catch (error) {
      console.error('Erro ao carregar relatório financeiro por turma:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const totals = useMemo(() => {
    const previsto = items.reduce((sum, item) => sum + item.valor, 0);
    const recebido = items.reduce((sum, item) => sum + item.valorPago, 0);
    const vencido = items.filter(item => item.status === 'VENCIDO').reduce((sum, item) => sum + item.valor, 0);
    const aberto = items.filter(item => !['PAGO', 'CANCELADO'].includes(item.status)).reduce((sum, item) => sum + item.valor, 0);
    const pagos = items.filter(item => item.status === 'PAGO').length;
    const atrasados = items.filter(item => item.status === 'VENCIDO').length;
    const inadimplencia = previsto > 0 ? (vencido / previsto) * 100 : 0;
    return { previsto, recebido, vencido, aberto, pagos, atrasados, inadimplencia };
  }, [items]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full w-full">
      <ReportFilterPanel
        summary={
          <>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo da competência</h4>
            <div className="grid grid-cols-2 gap-2">
              <SummaryCard label="Previsto" value={formatCurrency(totals.previsto)} tone="blue" />
              <SummaryCard label="Recebido" value={formatCurrency(totals.recebido)} tone="emerald" />
              <SummaryCard label="Vencido" value={formatCurrency(totals.vencido)} tone="red" />
              <SummaryCard label="Atrasados" value={totals.atrasados} tone="amber" />
            </div>
          </>
        }
      >
        <FilterField label="Competência">
          <FilterInput type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
        </FilterField>
        <FilterField label="Modalidade">
          <FilterSelect value={modalidade} onChange={(e) => setModalidade(e.target.value as RelatorioModalidade)}>
            {Object.entries(MODALIDADE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </FilterSelect>
        </FilterField>
        <FilterField label="Turma">
          <FilterSelect value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
            <option value="todos">Todas as turmas</option>
            {turmas.map((turma) => <option key={turma.id} value={turma.id}>{turma.nome} {turma.codigo ? `(${turma.codigo})` : ''}</option>)}
          </FilterSelect>
        </FilterField>
        <FilterField label="Tipo de cobrança">
          <FilterSelect value={tipoLancamento} onChange={(e) => setTipoLancamento(e.target.value as RelatorioTipoLancamento)}>
            {Object.entries(tipoLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </FilterSelect>
        </FilterField>
        <FilterField label="Status financeiro">
          <FilterSelect value={status} onChange={(e) => setStatus(e.target.value as RelatorioFinanceiroStatus)}>
            {['todos', 'PAGO', 'PENDENTE', 'VENCIDO', 'CANCELADO'].map((key) => <option key={key} value={key}>{STATUS_LABELS[key]}</option>)}
          </FilterSelect>
        </FilterField>
      </ReportFilterPanel>

      <A4ReportShell
        company={company}
        polo={polo}
        loading={loading}
        rightTitle="Cobrança por Competência"
        rightType="Financeiro por Turma"
        title="Relatório Financeiro por Turma e Mês"
        description="Controle analítico de matrícula, mensalidades e parcelas por aluno, permitindo identificar pagamentos, pendências e atrasos da competência selecionada."
        meta={
          <>
            <ReportMetaCard label="Competência" value={formatCompetencia(competencia)} />
            <ReportMetaCard label="Modalidade" value={MODALIDADE_LABELS[modalidade]} />
            <ReportMetaCard label="Unidade / Polo" value={polo?.nome || 'Matriz'} />
          </>
        }
        kpis={
          <>
            <ReportKpiCard label="Previsto" value={formatCurrency(totals.previsto)} tone="blue" />
            <ReportKpiCard label="Recebido" value={formatCurrency(totals.recebido)} tone="emerald" />
            <ReportKpiCard label="Inadimplência" value={`${totals.inadimplencia.toFixed(1)}%`} tone="red" />
          </>
        }
      >
        {items.length === 0 ? <EmptyReportState /> : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-300 text-[9px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                <th className="py-2 px-2">Aluno</th>
                <th className="py-2 px-2">Turma</th>
                <th className="py-2 px-2">Cobrança</th>
                <th className="py-2 px-2">Venc.</th>
                <th className="py-2 px-2 text-right">Valor</th>
                <th className="py-2 px-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="text-[10px] text-slate-700">
                  <td className="py-2 px-2">
                    <p className="font-black text-[#001a33]">{item.alunoNome}</p>
                    <p className="text-[8px] text-slate-400">{item.alunoCpf}</p>
                  </td>
                  <td className="py-2 px-2">
                    <p className="font-bold">{item.turmaNome}</p>
                    <p className="text-[8px] text-slate-400">{item.cursoNome}</p>
                  </td>
                  <td className="py-2 px-2">
                    <p className="font-bold">{tipoLabels[item.tipoLancamento] || item.tipoLancamento}</p>
                    <p className="text-[8px] text-slate-400">{item.parcelaNumero != null ? `Parcela ${item.parcelaNumero}` : item.descricao}</p>
                  </td>
                  <td className="py-2 px-2">{formatDate(item.vencimento)}</td>
                  <td className="py-2 px-2 text-right font-black">{formatCurrency(item.valor)}</td>
                  <td className="py-2 px-2">
                    <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${item.status === 'PAGO' ? 'bg-emerald-50 text-emerald-700' : item.status === 'VENCIDO' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                    {item.diasAtraso > 0 && <p className="text-[8px] text-red-500 mt-1">{item.diasAtraso} dia(s)</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </A4ReportShell>
    </div>
  );
};

export default RelatorioFinanceiroTurmaMensal;
