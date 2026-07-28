import React, { useMemo } from 'react';
import DocumentHeader from '../../components/DocumentHeader';
import ReportWatermark from '../../relatorios/components/ReportWatermark';
import {
  formatCaixaCompetencia,
  formatCaixaCurrency,
} from '../caixa.formatters';
import { buildCaixaReportPages } from './caixa-report.pagination';
import {
  CaixaExpensesTable,
  CaixaReceiptsTable,
} from './CaixaReportTables';
import { CaixaReportRecurringAnalysis } from './CaixaReportRecurringAnalysis';
import { CaixaReportSummaryBreakdowns } from './CaixaReportSummaryBreakdowns';
import type {
  CaixaDetailedReport,
  CaixaReportExpense,
  CaixaReportReceipt,
  CaixaReportRecurringClass,
} from './caixa-report.types';

const ExecutiveMetric: React.FC<{
  label: string;
  value: number;
  helper: string;
  tone?: 'navy' | 'emerald' | 'rose' | 'amber';
}> = ({ label, value, helper, tone = 'navy' }) => {
  const tones = {
    navy: 'border-slate-200 bg-slate-50 text-slate-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
  };
  return (
    <div className={`rounded-xl border p-2 ${tones[tone]}`}>
      <p className="text-[8px] font-black uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-0.5 text-[14px] font-black leading-none">{formatCaixaCurrency(value)}</p>
      <p className="mt-0.5 text-[7.5px] leading-3 text-slate-600">{helper}</p>
    </div>
  );
};

const SummaryPage: React.FC<{ report: CaixaDetailedReport }> = ({ report }) => {
  const statement = report.resumo;
  const resultLabel = statement.resumoCompetencia.resultadoStatus === 'NEGATIVO'
    ? 'Déficit do mês'
    : statement.resumoCompetencia.resultadoStatus === 'POSITIVO'
      ? 'Superávit do mês'
      : 'Resultado do mês';

  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-lg font-black uppercase tracking-tight text-[#001a33]">
          Prestação de contas mensal
        </h2>
        <p className="mt-1 text-[9px] text-slate-500">
          Posição contábil e movimentos confirmados de{' '}
          {formatCaixaCompetencia(statement.meta.competencia)}. Os compromissos
          em aberto refletem a posição apurada na geração do relatório.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <ExecutiveMetric
          label="Saldo contábil registrado"
          value={statement.saldosHoje.registradoTotal}
          helper="Posição contábil do sistema; não é consulta ao extrato"
        />
        <ExecutiveMetric
          label="Entradas recebidas"
          value={statement.resumoCompetencia.entradasRecebidasBrutas}
          helper={`${statement.resumoCompetencia.quantidadeRecebimentos} recebimento(s) confirmado(s)`}
          tone="emerald"
        />
        <ExecutiveMetric
          label="Saídas pagas"
          value={statement.resumoCompetencia.saidasPagas}
          helper={`${statement.resumoCompetencia.quantidadePagamentos} pagamento(s) confirmado(s)`}
          tone="rose"
        />
        <ExecutiveMetric
          label={resultLabel}
          value={statement.resumoCompetencia.resultado}
          helper="Entradas menos saídas confirmadas no período"
          tone={statement.resumoCompetencia.resultadoStatus === 'NEGATIVO' ? 'rose' : 'emerald'}
        />
        <ExecutiveMetric
          label="A receber"
          value={statement.compromissos.aReceber}
          helper="Receitas futuras ainda em aberto"
        />
        <ExecutiveMetric
          label="Inadimplência"
          value={statement.compromissos.receberVencido}
          helper="Valor vencido e ainda não recebido"
          tone="amber"
        />
        <ExecutiveMetric
          label="A pagar"
          value={statement.compromissos.aPagar}
          helper="Obrigações futuras ainda em aberto"
        />
        <ExecutiveMetric
          label="Obrigações vencidas"
          value={statement.compromissos.pagarVencido}
          helper="Valor vencido e ainda não pago"
          tone="rose"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-emerald-200 bg-white p-2.5">
          <div className="flex items-end justify-between border-b border-emerald-100 pb-1.5">
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-emerald-700">
                Composição dos recebimentos
              </p>
              <p className="mt-0.5 text-[7.5px] text-slate-600">
                Ajustes identificados e auditados pelo backend
              </p>
            </div>
            <strong className="text-sm text-emerald-700">
              {formatCaixaCurrency(report.totaisRecebimentos.valorFinal)}
            </strong>
          </div>
          <div className="mt-1.5 grid grid-cols-6 gap-1.5 text-[8px]">
            <p>Base<br /><strong>{formatCaixaCurrency(report.totaisRecebimentos.valorBase)}</strong></p>
            <p>Juros<br /><strong>{formatCaixaCurrency(report.totaisRecebimentos.jurosIdentificados)}</strong></p>
            <p>Multa<br /><strong>{formatCaixaCurrency(report.totaisRecebimentos.multaIdentificada)}</strong></p>
            <p>Acréscimo<br /><strong>{formatCaixaCurrency(report.totaisRecebimentos.acrescimoIdentificado)}</strong></p>
            <p>Desconto<br /><strong>{formatCaixaCurrency(report.totaisRecebimentos.descontoIdentificado)}</strong></p>
            <p>Não discrim.<br /><strong>{formatCaixaCurrency(report.totaisRecebimentos.diferencaNaoDiscriminada)}</strong></p>
          </div>
        </div>

        <div className="rounded-xl border border-rose-200 bg-white p-2.5">
          <div className="flex items-end justify-between border-b border-rose-100 pb-1.5">
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-rose-700">
                Composição das despesas
              </p>
              <p className="mt-0.5 text-[7.5px] text-slate-600">
                Pagamentos confirmados, sem duplicar lançamentos vinculados
              </p>
            </div>
            <strong className="text-sm text-rose-700">
              {formatCaixaCurrency(report.totaisDespesas.valorFinal)}
            </strong>
          </div>
          <div className="mt-1.5 grid grid-cols-6 gap-1.5 text-[8px]">
            <p>Base<br /><strong>{formatCaixaCurrency(report.totaisDespesas.valorBase)}</strong></p>
            <p>Juros<br /><strong>{formatCaixaCurrency(report.totaisDespesas.jurosIdentificados)}</strong></p>
            <p>Multa<br /><strong>{formatCaixaCurrency(report.totaisDespesas.multaIdentificada)}</strong></p>
            <p>Acréscimo<br /><strong>{formatCaixaCurrency(report.totaisDespesas.acrescimoIdentificado)}</strong></p>
            <p>Desconto<br /><strong>{formatCaixaCurrency(report.totaisDespesas.descontoIdentificado)}</strong></p>
            <p>Não discrim.<br /><strong>{formatCaixaCurrency(report.totaisDespesas.diferencaNaoDiscriminada)}</strong></p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-1 text-[7.5px] leading-3 text-blue-900">
        <strong>Leitura correta:</strong> o resultado mensal representa o fluxo de caixa confirmado,
        não lucro contábil por competência. O saldo Banese é a posição contábil do sistema; a integração
        atual não consulta o extrato bancário.
      </div>

      <CaixaReportSummaryBreakdowns report={report} />
    </div>
  );
};

const SectionHeading: React.FC<{
  title: string;
  description: string;
  page: number;
  tone: 'emerald' | 'rose';
}> = ({ title, description, page, tone }) => (
  <div className="mb-3 flex items-end justify-between border-b border-slate-200 pb-2">
    <div>
      <h2 className={`text-base font-black uppercase tracking-tight ${
        tone === 'emerald' ? 'text-emerald-800' : 'text-rose-800'
      }`}>{title}</h2>
      <p className="mt-0.5 text-[8px] text-slate-500">{description}</p>
    </div>
    <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
      Página da seção {page}
    </span>
  </div>
);

export const CaixaReportDocument: React.FC<{
  report: CaixaDetailedReport;
}> = ({ report }) => {
  const pages = useMemo(
    () => buildCaixaReportPages(
      report.recebimentos,
      report.despesas,
      report.analiseRecorrente.turmas,
    ),
    [report.analiseRecorrente.turmas, report.despesas, report.recebimentos],
  );
  const polo = {
    ...report.institucional,
    uf: report.institucional.estado,
    logoUrl: report.institucional.logo_url,
    landscapeWatermarkUrl: report.institucional.landscape_watermark_url,
    landscapeWatermarkOpacity: report.institucional.landscape_watermark_opacity,
    landscapeWatermarkScale: report.institucional.landscape_watermark_scale,
    landscapeWatermarkRotate: report.institucional.landscape_watermark_rotate,
  };
  const company = {
    logoUrl: report.institucional.logo_url || undefined,
    nomeFantasia: report.institucional.nome,
    razaoSocial: report.institucional.nome,
    cnpj: report.institucional.cnpj,
    endereco: report.institucional.endereco,
    numero: report.institucional.numero,
    bairro: report.institucional.bairro,
    cidade: report.institucional.cidade,
    uf: report.institucional.estado,
    cep: report.institucional.cep,
    telefone: report.institucional.telefone,
    email: report.institucional.email,
  };

  return (
    <div className="flex min-w-max flex-col items-center gap-4">
      {pages.map((page, pageIndex) => {
        const isLastSectionPage = pageIndex === pages.length - 1
          || pages[pageIndex + 1]?.section !== page.section;
        return (
          <section
            key={page.key}
            className="caixa-report-page relative box-border flex h-[210mm] min-h-[210mm] w-[297mm] min-w-[297mm] shrink-0 flex-col overflow-hidden bg-white p-[8mm] text-slate-800 shadow-xl"
            aria-label={`Página ${pageIndex + 1} de ${pages.length}`}
          >
            <ReportWatermark polo={polo} orientation="landscape" />
            <div className="relative z-10 pl-[7mm] [&>div]:mb-5">
              <DocumentHeader
                company={company}
                polo={polo}
                orientation="landscape"
                rightContent={(
                  <div className="text-right">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                      Caixa · uso interno
                    </p>
                    <p className="mt-1 text-xs font-black uppercase text-[#001a33]">
                      {report.resumo.meta.escopoRotulo}
                    </p>
                    <p className="mt-1 text-[8px] font-bold text-slate-500">
                      {formatCaixaCompetencia(report.resumo.meta.competencia)}
                    </p>
                  </div>
                )}
              />
            </div>

            <div className="relative z-10 min-h-0 flex-1 pl-[7mm]">
              {page.section === 'RESUMO' && <SummaryPage report={report} />}
              {page.section === 'RECEBIMENTOS' && (
                <>
                  <SectionHeading
                    title="Recebimentos confirmados"
                    description="Aluno/pagador, parcela, curso, turma, conta e composição financeira."
                    page={page.sectionPage}
                    tone="emerald"
                  />
                  <CaixaReceiptsTable
                    rows={page.rows as CaixaReportReceipt[]}
                    totals={report.totaisRecebimentos}
                    showTotals={isLastSectionPage}
                  />
                </>
              )}
              {page.section === 'DESPESAS' && (
                <>
                  <SectionHeading
                    title="Despesas pagas"
                    description="Fornecedor, classificação, parcela, conta e composição financeira."
                    page={page.sectionPage}
                    tone="rose"
                  />
                  <CaixaExpensesTable
                    rows={page.rows as CaixaReportExpense[]}
                    totals={report.totaisDespesas}
                    showTotals={isLastSectionPage}
                  />
                </>
              )}
              {page.section === 'CARTEIRA_RECORRENTE' && (
                <CaixaReportRecurringAnalysis
                  report={report}
                  rows={page.rows as CaixaReportRecurringClass[]}
                  page={page.sectionPage}
                  showModalities={page.sectionPage === 1}
                  showTotals={isLastSectionPage}
                />
              )}
            </div>

            <footer className="relative z-10 ml-[7mm] mt-2 grid shrink-0 grid-cols-3 border-t border-slate-100 pt-2 text-[7.5px] font-bold uppercase tracking-widest text-slate-500">
              <span>Confidencial · uso interno</span>
              <span className="text-center">
                Gerado pelo backend em {new Date(report.geradoEm).toLocaleString('pt-BR')}
              </span>
              <span className="text-right">Página {pageIndex + 1} de {pages.length}</span>
            </footer>
          </section>
        );
      })}
    </div>
  );
};
