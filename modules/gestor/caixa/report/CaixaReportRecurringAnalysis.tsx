import React from 'react';
import { formatCaixaCurrency } from '../caixa.formatters';
import type {
  CaixaDetailedReport,
  CaixaReportRecurringBreakdown,
  CaixaReportRecurringClass,
} from './caixa-report.types';

const VALUE_COLUMNS = [
  ['Previsto', 'previstoNoMes', 'text-slate-700'],
  ['Recebido', 'recebidoNoMes', 'text-emerald-700'],
  ['Em atraso', 'emAtraso', 'text-amber-700'],
  ['Juros', 'juros', 'text-slate-600'],
  ['Multa', 'multa', 'text-slate-600'],
  ['Acrésc.', 'acrescimo', 'text-slate-600'],
  ['Desconto', 'desconto', 'text-blue-700'],
  ['Não discr.', 'diferencaNaoDiscriminada', 'text-slate-500'],
] as const satisfies ReadonlyArray<readonly [
  string,
  keyof CaixaReportRecurringBreakdown,
  string,
]>;

const GRID = 'grid-cols-[minmax(0,1fr)_repeat(8,67px)]';

const FinancialColumns: React.FC<{ item: CaixaReportRecurringBreakdown }> = ({ item }) => (
  <>
    {VALUE_COLUMNS.map(([, field, tone]) => (
      <strong key={field} className={`text-right text-[8px] ${tone}`}>
        {formatCaixaCurrency(item[field] as number)}
      </strong>
    ))}
  </>
);

const ColumnHeader = () => (
  <div className={`grid ${GRID} gap-1 border-b border-slate-200 px-2 py-1.5 text-right text-[7.5px] font-black uppercase tracking-wide text-slate-500`}>
    <span className="text-left">Modalidade / turma</span>
    {VALUE_COLUMNS.map(([label]) => <span key={label}>{label}</span>)}
  </div>
);

export const CaixaReportRecurringAnalysis: React.FC<{
  report: CaixaDetailedReport;
  rows: CaixaReportRecurringClass[];
  page: number;
  showModalities: boolean;
  showTotals: boolean;
}> = ({ report, rows, page, showModalities, showTotals }) => (
  <div>
    <div className="mb-3 flex items-end justify-between border-b border-slate-200 pb-2">
      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.16em] text-blue-600">
          Carteira parcelada · EAD não incluído
        </p>
        <h2 className="mt-0.5 text-base font-black uppercase tracking-tight text-[#001a33]">
          Acompanhamento por modalidade e turma
        </h2>
        <p className="mt-0.5 text-[8px] text-slate-500">
          Valores previstos, recebidos, vencidos e ajustes confirmados na competência.
        </p>
      </div>
      <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
        Página da seção {page}
      </span>
    </div>

    {showModalities && (
      <section className="mb-3 overflow-hidden rounded-xl border border-blue-100 bg-white">
        <header className="flex items-end justify-between bg-blue-50 px-3 py-2">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.14em] text-blue-600">
              Consolidado
            </p>
            <h3 className="text-[10px] font-black uppercase text-[#001a33]">
              Resumo por modalidade
            </h3>
          </div>
          <p className="text-[8px] font-bold text-slate-500">
            {report.analiseRecorrente.totais.quantidadeCursos} curso(s) ·{' '}
            {report.analiseRecorrente.totais.quantidadeTurmas} turma(s) ·{' '}
            {report.analiseRecorrente.totais.quantidadeAlunos} aluno(s)
          </p>
        </header>
        <ColumnHeader />
        {report.analiseRecorrente.modalidades.length === 0 ? (
          <p className="px-3 py-5 text-center text-[8px] font-semibold text-slate-400">
            Nenhuma carteira parcelada com movimento nesta competência.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {report.analiseRecorrente.modalidades.map((item) => (
              <div key={item.modalidade} className={`grid ${GRID} items-center gap-1 px-2 py-2`}>
                <div className="min-w-0">
                  <p className="truncate text-[9px] font-black text-slate-800">{item.rotulo}</p>
                  <p className="mt-0.5 truncate text-[8px] text-slate-500">
                    {item.quantidadeCursos} curso(s) · {item.quantidadeTurmas} turma(s) ·{' '}
                    {item.quantidadeAlunos} aluno(s)
                  </p>
                </div>
                <FinancialColumns item={item} />
              </div>
            ))}
          </div>
        )}
        {showTotals && (
          <div className={`grid ${GRID} items-center gap-1 border-t border-blue-100 bg-blue-50 px-2 py-2`}>
            <div>
              <p className="text-[9px] font-black uppercase text-blue-900">Total da carteira</p>
              <p className="text-[8px] text-blue-700">Valores canônicos do backend</p>
            </div>
            <FinancialColumns item={report.analiseRecorrente.totais} />
          </div>
        )}
      </section>
    )}

    {!showModalities && (
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="bg-slate-50 px-3 py-2">
          <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-600">
            Detalhamento
          </p>
          <h3 className="text-[11px] font-black uppercase text-[#001a33]">
            Valores por turma
          </h3>
        </header>
        <ColumnHeader />
        <div className="divide-y divide-slate-100">
          {rows.map((item) => (
            <div key={item.turmaId} className={`grid ${GRID} items-center gap-1 px-2 py-3`}>
              <div className="min-w-0">
                <p className="truncate text-[9px] font-black text-slate-800">{item.turma}</p>
                <p className="mt-0.5 truncate text-[8px] text-slate-500">
                  {item.modalidade} · {item.curso} · {item.quantidadeAlunos} aluno(s) ·{' '}
                  {item.quantidadeParcelas} parcela(s)
                </p>
              </div>
              <FinancialColumns item={item} />
            </div>
          ))}
        </div>
        {showTotals && (
          <div className={`grid ${GRID} items-center gap-1 border-t border-blue-100 bg-blue-50 px-2 py-2`}>
            <div>
              <p className="text-[9px] font-black uppercase text-blue-900">Total da carteira</p>
              <p className="text-[8px] text-blue-700">Valores canônicos do backend</p>
            </div>
            <FinancialColumns item={report.analiseRecorrente.totais} />
          </div>
        )}
      </section>
    )}

    <p className="mt-2 text-[8px] leading-3 text-slate-500">
      Juros, multa, acréscimo e desconto refletem somente composições confirmadas na baixa.
      Diferenças sem detalhamento do gateway permanecem em “Não discr.” para auditoria.
    </p>
  </div>
);
