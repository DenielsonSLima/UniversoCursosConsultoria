import React, { useMemo } from 'react';
import DocumentHeader from '../../components/DocumentHeader';
import ReportWatermark from '../../relatorios/components/ReportWatermark';
import {
  formatCaixaCompetencia,
  formatCaixaCanonicalCurrency,
  formatCaixaCurrency,
  formatCaixaDate,
  formatCaixaPercent,
} from '../caixa.formatters';
import { buildCaixaReportPages } from './caixa-report.pagination';
import {
  getCaixaReportPosicaoTotal,
  getCaixaReportPosicaoTotalUnavailableMessage,
} from './caixa-report.posicao-total';
import {
  CaixaExpensesTable,
  CaixaReceiptsTable,
} from './CaixaReportTables';
import { CaixaReportRecurringAnalysis } from './CaixaReportRecurringAnalysis';
import { CaixaReportNonOperationalPositions } from './CaixaReportNonOperationalPositions';
import { CaixaReportSummaryBreakdowns } from './CaixaReportSummaryBreakdowns';
import type {
  CaixaDetailedReport,
  CaixaReportExpense,
  CaixaReportReceipt,
  CaixaReportRecurringClass,
} from './caixa-report.types';
import type { CaixaReportPosicaoTotal } from './caixa-report.posicao-total';

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

const PositionTotalMetric: React.FC<{
  position: CaixaReportPosicaoTotal | null;
}> = ({ position }) => {
  if (!position?.disponivel) {
    return (
      <div className="col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-amber-900">
        <p className="text-[8px] font-black uppercase tracking-wide">Posição total no corte</p>
        <p className="mt-0.5 text-[14px] font-black leading-none">Indisponível</p>
        <p className="mt-0.5 text-[7.5px] leading-3 text-amber-800">
          {getCaixaReportPosicaoTotalUnavailableMessage(position)}
        </p>
      </div>
    );
  }

  const { dados } = position;
  const totalIsNegative = dados.valorTotalLiquido.startsWith('-');
  return (
    <div className="col-span-2 rounded-xl border border-[#0b365d] bg-[#001a33] p-2 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[8px] font-black uppercase tracking-wide text-blue-100">
            Posição total no corte
          </p>
          <p className={`mt-0.5 text-[15px] font-black leading-none ${
            totalIsNegative ? 'text-rose-300' : 'text-emerald-300'
          }`}>
            {formatCaixaCanonicalCurrency(dados.valorTotalLiquido)}
          </p>
        </div>
        <p className="max-w-[42%] text-right text-[7px] font-semibold leading-3 text-blue-100">
          Caixa + patrimônio a custo − empréstimos a pagar
        </p>
      </div>
      <p className="mt-1 border-t border-blue-400/30 pt-1 text-[7px] leading-3 text-blue-100">
        Corte {formatCaixaDate(position.dataCorte)} · Caixa: {formatCaixaCanonicalCurrency(dados.saldoCaixaRegistrado)} · Patrimônio: {formatCaixaCanonicalCurrency(dados.valorPatrimonialCusto)} · Empréstimos: {formatCaixaCanonicalCurrency(dados.saldoEmprestimosAPagar)}
      </p>
    </div>
  );
};

const SummaryPage: React.FC<{ report: CaixaDetailedReport }> = ({ report }) => {
  const statement = report.resumo;
  const posicaoTotal = getCaixaReportPosicaoTotal(report);
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
          {`Posição contábil e movimentos confirmados de ${formatCaixaCompetencia(statement.meta.competencia)}. Os compromissos em aberto refletem a posição apurada na geração do relatório.`}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <PositionTotalMetric position={posicaoTotal} />
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
          label="Saldo contábil registrado"
          value={statement.saldosHoje.registradoTotal}
          helper="Posição contábil do sistema; não é consulta ao extrato"
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
          helper={statement.compromissos.margemInadimplencia > 0
            ? `Inadimplência: ${formatCaixaCurrency(statement.compromissos.receberVencido)} (${formatCaixaPercent(statement.compromissos.margemInadimplencia)})`
            : `Em atraso: ${formatCaixaCurrency(statement.compromissos.receberVencido)}`}
          tone={statement.compromissos.receberVencido > 0 ? 'amber' : 'navy'}
        />
        <ExecutiveMetric
          label="A pagar"
          value={statement.compromissos.aPagar}
          helper={`Vencidas: ${formatCaixaCurrency(statement.compromissos.pagarVencido)}`}
          tone={statement.compromissos.pagarVencido > 0 ? 'rose' : 'navy'}
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
                Ajustes identificados nos recebimentos confirmados
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
            className="caixa-report-page relative box-border grid h-[210mm] min-h-[210mm] w-[297mm] min-w-[297mm] shrink-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-white p-[8mm] text-slate-800 shadow-xl"
            aria-label={`Página ${pageIndex + 1} de ${pages.length}`}
          >
            <ReportWatermark polo={polo} orientation="landscape" />
            <div
              data-caixa-report-header
              className="relative z-10 pl-[7mm] [&>header]:mb-5"
            >
              <DocumentHeader
                company={company}
                polo={polo}
                orientation="landscape"
                meta={{
                  eyebrow: 'Caixa · uso interno',
                  title: report.resumo.meta.escopoRotulo,
                  label: 'Competência',
                  value: formatCaixaCompetencia(report.resumo.meta.competencia),
                }}
              />
            </div>

            <div data-caixa-report-content className="relative z-10 min-h-0 pl-[7mm]">
              {page.section === 'RESUMO' && <SummaryPage report={report} />}
              {page.section === 'POSICOES_COMPLEMENTARES' && (
                <CaixaReportNonOperationalPositions report={report} />
              )}
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

            <footer
              data-caixa-report-footer
              className="relative z-10 ml-[7mm] mt-2 grid grid-cols-3 border-t border-slate-100 pt-2 text-[7.5px] font-bold uppercase tracking-widest text-slate-500"
            >
              <span>Confidencial · uso interno</span>
              <span className="text-center">
                Emitido em {new Date(report.geradoEm).toLocaleString('pt-BR')}
              </span>
              <span className="text-right">Página {pageIndex + 1} de {pages.length}</span>
            </footer>
          </section>
        );
      })}
    </div>
  );
};
