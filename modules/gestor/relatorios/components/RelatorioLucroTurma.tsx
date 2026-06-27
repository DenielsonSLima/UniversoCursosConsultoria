// File: modules/gestor/relatorios/components/RelatorioLucroTurma.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { relatoriosService, RelatorioTurmaOption } from '../relatorios.service';
import {
  A4ReportShell,
  EmptyReportState,
  FilterField,
  FilterSelect,
  formatCurrency,
  formatDate,
  ReportFilterPanel,
  ReportKpiCard,
  ReportMetaCard,
  SummaryCard,
} from './RelatorioShared';

interface RelatorioLucroTurmaProps {
  company: any;
  polo: any;
}

const RelatorioLucroTurma: React.FC<RelatorioLucroTurmaProps> = ({ company, polo }) => {
  const [turmas, setTurmas] = useState<RelatorioTurmaOption[]>([]);
  const [selectedTurmaId, setSelectedTurmaId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [revenues, setRevenues] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);

  const poloId = polo?.id;

  // Carrega a lista de turmas
  useEffect(() => {
    let mounted = true;
    relatoriosService.getTurmasOptions('todos', poloId)
      .then((rows) => {
        if (!mounted) return;
        setTurmas(rows);
        if (rows.length > 0 && !selectedTurmaId) {
          setSelectedTurmaId(rows[0].id);
        }
      })
      .catch((err) => console.error('Erro ao carregar turmas:', err));
    return () => { mounted = false; };
  }, [poloId]);

  // Carrega os lançamentos financeiros da turma selecionada
  useEffect(() => {
    if (!selectedTurmaId) return;

    let mounted = true;
    setLoading(true);

    Promise.all([
      relatoriosService.getLucroTurmaRevenues(selectedTurmaId),
      relatoriosService.getLucroTurmaExpenses(selectedTurmaId),
    ])
      .then(([revs, exps]) => {
        if (!mounted) return;
        setRevenues(revs);
        setExpenses(exps);
      })
      .catch((err) => console.error('Erro ao buscar dados do lucro da turma:', err))
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [selectedTurmaId]);

  const selectedTurma = useMemo(() => {
    return turmas.find(t => t.id === selectedTurmaId);
  }, [turmas, selectedTurmaId]);

  // Cálculos financeiros
  const totals = useMemo(() => {
    const totalRevenues = revenues.reduce((sum, r) => sum + r.valorPago, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.valorPago, 0);
    const netProfit = totalRevenues - totalExpenses;
    const profitMargin = totalRevenues > 0 ? (netProfit / totalRevenues) * 100 : 0;

    // Previsões adicionais
    const pendingRevenues = revenues.filter(r => r.status !== 'PAGO').reduce((sum, r) => sum + r.valor, 0);
    const pendingExpenses = expenses.filter(e => e.status !== 'PAGO').reduce((sum, e) => sum + e.valor, 0);

    return {
      totalRevenues,
      totalExpenses,
      netProfit,
      profitMargin,
      pendingRevenues,
      pendingExpenses,
    };
  }, [revenues, expenses]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full w-full">
      {/* Painel de Filtros à esquerda */}
      <ReportFilterPanel
        summary={
          <>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo de Lucro</h4>
            <div className="grid grid-cols-2 gap-2">
              <SummaryCard label="Receitas Realizadas" value={formatCurrency(totals.totalRevenues)} tone="emerald" />
              <SummaryCard label="Despesas Realizadas" value={formatCurrency(totals.totalExpenses)} tone="red" />
              <SummaryCard 
                label="Resultado Líquido" 
                value={formatCurrency(totals.netProfit)} 
                tone={totals.netProfit >= 0 ? 'emerald' : 'red'} 
              />
              <SummaryCard label="Margem de Lucro" value={`${totals.profitMargin.toFixed(1)}%`} tone={totals.netProfit >= 0 ? 'blue' : 'red'} />
            </div>
          </>
        }
      >
        <FilterField label="Selecione a Turma">
          <FilterSelect value={selectedTurmaId} onChange={(e) => setSelectedTurmaId(e.target.value)}>
            <option value="">Selecione uma turma...</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome} ({t.codigo})
              </option>
            ))}
          </FilterSelect>
        </FilterField>
      </ReportFilterPanel>

      {/* Relatório A4 à direita */}
      <A4ReportShell
        company={company}
        polo={polo}
        loading={loading}
        rightTitle="Demonstrativo Financeiro"
        rightType="Lucro por Turma"
        title="Relatório de Lucro e Resultado por Turma"
        description="Demonstrativo analítico do resultado financeiro de uma turma específica, confrontando as mensalidades/taxas pagas pelos alunos contra todas as despesas diretas vinculadas."
        meta={
          <>
            <ReportMetaCard label="Turma Selecionada" value={selectedTurma ? `${selectedTurma.nome} (${selectedTurma.codigo})` : 'Nenhuma'} />
            <ReportMetaCard label="Modalidade de Ensino" value={selectedTurma ? selectedTurma.modalidade : '—'} />
            <ReportMetaCard label="Unidade / Polo" value={polo?.nome || 'Matriz'} />
          </>
        }
        kpis={
          <>
            <ReportKpiCard label="Total Recebido (A)" value={formatCurrency(totals.totalRevenues)} tone="emerald" />
            <ReportKpiCard label="Despesas Pagas (B)" value={formatCurrency(totals.totalExpenses)} tone="red" />
            <ReportKpiCard 
              label="Resultado Líquido (A - B)" 
              value={formatCurrency(totals.netProfit)} 
              tone={totals.netProfit >= 0 ? 'emerald' : 'red'} 
            />
          </>
        }
      >
        {!selectedTurmaId ? (
          <EmptyReportState message="Selecione uma turma no painel de filtros para gerar o relatório." />
        ) : (
          <div className="space-y-8 relative z-10">
            {/* Tabela de Receitas */}
            <div>
              <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider mb-2 border-b pb-1">
                1. Receitas de Alunos (Entradas Realizadas)
              </h4>
              {revenues.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">Nenhum recebimento registrado para esta turma.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-bold border-b">
                        <th className="py-2 px-2">Vencimento</th>
                        <th className="py-2 px-2">Pagamento</th>
                        <th className="py-2 px-2">Aluno</th>
                        <th className="py-2 px-2">Descrição</th>
                        <th className="py-2 px-2 text-right">Valor Original</th>
                        <th className="py-2 px-2 text-right">Valor Pago</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {revenues.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/50">
                          <td className="py-2 px-2">{formatDate(r.dataVencimento)}</td>
                          <td className="py-2 px-2 text-emerald-600 font-semibold">{formatDate(r.dataPagamento)}</td>
                          <td className="py-2 px-2 font-medium text-slate-800">{r.alunoNome}</td>
                          <td className="py-2 px-2 text-slate-500">{r.descricao}</td>
                          <td className="py-2 px-2 text-right text-slate-400">{formatCurrency(r.valor)}</td>
                          <td className="py-2 px-2 text-right font-black text-emerald-650">{formatCurrency(r.valorPago)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Tabela de Despesas */}
            <div>
              <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider mb-2 border-b pb-1">
                2. Despesas Vinculadas (Saídas Realizadas)
              </h4>
              {expenses.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">Nenhuma despesa direta vinculada a esta turma.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-bold border-b">
                        <th className="py-2 px-2">Vencimento</th>
                        <th className="py-2 px-2">Pagamento</th>
                        <th className="py-2 px-2">Descrição</th>
                        <th className="py-2 px-2">Categoria</th>
                        <th className="py-2 px-2">Fornecedor</th>
                        <th className="py-2 px-2 text-right">Valor Original</th>
                        <th className="py-2 px-2 text-right">Valor Pago</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {expenses.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50/50">
                          <td className="py-2 px-2">{formatDate(e.dataVencimento)}</td>
                          <td className="py-2 px-2 text-rose-600 font-semibold">{formatDate(e.dataPagamento)}</td>
                          <td className="py-2 px-2 font-medium text-slate-800">{e.descricao}</td>
                          <td className="py-2 px-2 text-slate-500">{e.categoriaNome}</td>
                          <td className="py-2 px-2 text-slate-500">{e.fornecedorNome}</td>
                          <td className="py-2 px-2 text-right text-slate-400">{formatCurrency(e.valor)}</td>
                          <td className="py-2 px-2 text-right font-black text-rose-650">{formatCurrency(e.valorPago)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Balanço Geral e Resumo Geral */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <h4 className="text-xs font-black text-[#001a33] uppercase tracking-wider mb-2 border-b pb-1">
                3. Balanço Geral da Turma (DRE Simplificado)
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Total de Receitas Realizadas</p>
                  <p className="text-sm font-black text-emerald-600 mt-1">{formatCurrency(totals.totalRevenues)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Total de Despesas Realizadas</p>
                  <p className="text-sm font-black text-rose-600 mt-1">{formatCurrency(totals.totalExpenses)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Resultado Líquido Consolidado</p>
                  <p className={`text-sm font-black mt-1 ${totals.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatCurrency(totals.netProfit)}
                  </p>
                </div>
                <div className="border-t pt-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Margem de Rentabilidade</p>
                  <p className={`text-sm font-black mt-1 ${totals.netProfit >= 0 ? 'text-[#001a33]' : 'text-rose-700'}`}>
                    {totals.profitMargin.toFixed(2)}%
                  </p>
                </div>
                <div className="border-t pt-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Previsão de Receitas Pendentes</p>
                  <p className="text-sm font-black text-slate-650 mt-1">{formatCurrency(totals.pendingRevenues)}</p>
                </div>
                <div className="border-t pt-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Previsão de Despesas Pendentes</p>
                  <p className="text-sm font-black text-slate-650 mt-1">{formatCurrency(totals.pendingExpenses)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </A4ReportShell>
    </div>
  );
};

export default RelatorioLucroTurma;
