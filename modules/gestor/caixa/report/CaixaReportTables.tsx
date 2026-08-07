import React from 'react';
import {
  formatCaixaCurrency,
  formatCaixaDate,
  formatCaixaInstallment,
} from '../caixa.formatters';
import type {
  CaixaReportExpense,
  CaixaReportReceipt,
  CaixaReportTotals,
} from './caixa-report.types';

const moneyOrDash = (value: number | null) => (
  value === null ? 'Não discriminado' : formatCaixaCurrency(value)
);

const Adjustments: React.FC<{
  juros: number | null;
  multa: number | null;
  acrescimo: number | null;
  desconto: number | null;
  difference: number;
}> = ({ juros, multa, acrescimo, desconto, difference }) => (
  <div className="space-y-0.5 text-[9px] leading-[13px] text-slate-600">
    <p>Juros: <strong>{moneyOrDash(juros)}</strong></p>
    <p>Multa: <strong>{moneyOrDash(multa)}</strong></p>
    <p>Acrésc.: <strong>{moneyOrDash(acrescimo)}</strong></p>
    <p>Desconto: <strong>{moneyOrDash(desconto)}</strong></p>
    {difference !== 0 && (
      <p className="font-bold text-amber-700">
        Diferença não discriminada: {formatCaixaCurrency(difference)}
      </p>
    )}
  </div>
);

const EmptyRow: React.FC<{ label: string }> = ({ label }) => (
  <tr>
    <td colSpan={7} className="py-12 text-center text-[10px] font-semibold text-slate-400">
      {label}
    </td>
  </tr>
);

const TotalsFooter: React.FC<{
  totals: CaixaReportTotals;
  label: string;
  tone: 'emerald' | 'rose';
}> = ({ totals, label, tone }) => (
  <tfoot>
    <tr className={tone === 'emerald' ? 'bg-emerald-50' : 'bg-rose-50'}>
      <td colSpan={4} className="px-2 py-2 text-left text-[9px] font-black uppercase tracking-wide text-slate-700">
        {label} · {totals.quantidade} movimento(s)
        {totals.quantidadeNaoDiscriminada > 0 && (
          <span className="ml-2 text-amber-700">
            · {totals.quantidadeNaoDiscriminada} com diferença não discriminada
          </span>
        )}
      </td>
      <td className="px-2 py-2 text-right text-[9px] font-bold text-slate-700">
        {formatCaixaCurrency(totals.valorBase)}
      </td>
      <td className="px-2 py-2 text-right text-[8px] font-semibold text-slate-600">
        Juros {formatCaixaCurrency(totals.jurosIdentificados)}
        <br />
        Multa {formatCaixaCurrency(totals.multaIdentificada)}
        <br />
        Acrésc. {formatCaixaCurrency(totals.acrescimoIdentificado)}
        <br />
        Desc. {formatCaixaCurrency(totals.descontoIdentificado)}
        {totals.diferencaNaoDiscriminada !== 0 && (
          <>
            <br />
            Não discrim. {formatCaixaCurrency(totals.diferencaNaoDiscriminada)}
          </>
        )}
      </td>
      <td className={`px-2 py-2 text-right text-[9px] font-black ${
        tone === 'emerald' ? 'text-emerald-700' : 'text-rose-700'
      }`}>
        {formatCaixaCurrency(totals.valorFinal)}
      </td>
    </tr>
  </tfoot>
);

const TableHeader: React.FC<{ finalLabel: string; tone: 'emerald' | 'rose' }> = ({
  finalLabel,
  tone,
}) => (
  <thead>
    <tr className={tone === 'emerald' ? 'bg-emerald-700 text-white' : 'bg-rose-700 text-white'}>
      <th scope="col" className="w-[12%] px-2 py-2 text-left text-[9px] font-black uppercase tracking-wide">Data / parcela</th>
      <th scope="col" className="w-[20%] px-2 py-2 text-left text-[9px] font-black uppercase tracking-wide">Pessoa / descrição</th>
      <th scope="col" className="w-[18%] px-2 py-2 text-left text-[9px] font-black uppercase tracking-wide">Classificação</th>
      <th scope="col" className="w-[21%] px-2 py-2 text-left text-[9px] font-black uppercase tracking-wide">Origem / conta</th>
      <th scope="col" className="w-[9%] px-2 py-2 text-right text-[9px] font-black uppercase tracking-wide">Base</th>
      <th scope="col" className="w-[12%] px-2 py-2 text-left text-[9px] font-black uppercase tracking-wide">Ajustes</th>
      <th scope="col" className="w-[8%] px-2 py-2 text-right text-[9px] font-black uppercase tracking-wide">{finalLabel}</th>
    </tr>
  </thead>
);

export const CaixaReceiptsTable: React.FC<{
  rows: CaixaReportReceipt[];
  totals: CaixaReportTotals;
  showTotals: boolean;
}> = ({ rows, totals, showTotals }) => (
  <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white">
    <table className="w-full table-fixed border-collapse">
      <caption className="sr-only">Recebimentos confirmados do período</caption>
      <TableHeader finalLabel="Recebido" tone="emerald" />
      <tbody className="divide-y divide-slate-100">
        {rows.length === 0 ? <EmptyRow label="Nenhum recebimento confirmado no período." /> : rows.map((row) => (
          <tr key={row.id} className="min-h-[20mm] align-top">
            <td className="break-words px-2 py-2 text-[9px] leading-[13px] text-slate-600">
              <strong className="text-slate-800">{formatCaixaDate(row.dataPagamento)}</strong>
              <br />Venc.: {formatCaixaDate(row.dataVencimento)}
              <br />{formatCaixaInstallment(row.parcelaNumero, row.totalParcelas, row.tipoLancamento)}
            </td>
            <td className="break-words px-2 py-2 text-[9px] leading-[13px]">
              <p className="font-bold text-slate-900">{row.pagador}</p>
              <p className="text-slate-500">{row.descricao}</p>
            </td>
            <td className="break-words px-2 py-2 text-[9px] leading-[13px]">
              <p className="font-bold text-slate-800">{row.curso}</p>
              <p className="text-slate-500">{row.modalidade} · {row.turma}</p>
            </td>
            <td className="break-words px-2 py-2 text-[9px] leading-[13px]">
              <p className="font-semibold text-slate-700">{row.conta}</p>
              <p className="text-slate-500">{row.formaPagamento} · {row.polo}</p>
            </td>
            <td className="px-2 py-2 text-right text-[9px] font-bold text-slate-700">
              {formatCaixaCurrency(row.valorBase)}
            </td>
            <td className="px-2 py-2">
              <Adjustments
                juros={row.juros}
                multa={row.multa}
                acrescimo={row.acrescimo}
                desconto={row.desconto}
                difference={row.diferencaNaoDiscriminada}
              />
            </td>
            <td className="px-2 py-2 text-right text-[10px] font-black text-emerald-700">
              {formatCaixaCurrency(row.valorRecebido)}
            </td>
          </tr>
        ))}
      </tbody>
      {showTotals && <TotalsFooter totals={totals} label="Total recebido" tone="emerald" />}
    </table>
  </div>
);

export const CaixaExpensesTable: React.FC<{
  rows: CaixaReportExpense[];
  totals: CaixaReportTotals;
  showTotals: boolean;
}> = ({ rows, totals, showTotals }) => (
  <div className="overflow-hidden rounded-xl border border-rose-200 bg-white">
    <table className="w-full table-fixed border-collapse">
      <caption className="sr-only">Despesas pagas do período</caption>
      <TableHeader finalLabel="Pago" tone="rose" />
      <tbody className="divide-y divide-slate-100">
        {rows.length === 0 ? <EmptyRow label="Nenhuma despesa paga no período." /> : rows.map((row) => (
          <tr key={`${row.origem}-${row.id}`} className="min-h-[20mm] align-top">
            <td className="break-words px-2 py-2 text-[9px] leading-[13px] text-slate-600">
              <strong className="text-slate-800">{formatCaixaDate(row.dataPagamento)}</strong>
              <br />Venc.: {formatCaixaDate(row.dataVencimento)}
              <br />{formatCaixaInstallment(row.parcelaNumero, row.totalParcelas)}
            </td>
            <td className="break-words px-2 py-2 text-[9px] leading-[13px]">
              <p className="font-bold text-slate-900">{row.fornecedor}</p>
              <p className="text-slate-500">{row.descricao}</p>
            </td>
            <td className="break-words px-2 py-2 text-[9px] leading-[13px]">
              <p className="font-bold text-slate-800">{row.categoria}</p>
              <p className="text-slate-500">{row.curso} · {row.turma}</p>
            </td>
            <td className="break-words px-2 py-2 text-[9px] leading-[13px]">
              <p className="font-semibold text-slate-700">{row.conta}</p>
              <p className="text-slate-500">{row.formaPagamento} · {row.polo}</p>
            </td>
            <td className="px-2 py-2 text-right text-[9px] font-bold text-slate-700">
              {formatCaixaCurrency(row.valorBase)}
            </td>
            <td className="px-2 py-2">
              <Adjustments
                juros={row.juros}
                multa={row.multa}
                acrescimo={row.acrescimo}
                desconto={row.desconto}
                difference={row.diferencaNaoDiscriminada}
              />
            </td>
            <td className="px-2 py-2 text-right text-[10px] font-black text-rose-700">
              {formatCaixaCurrency(row.valorPago)}
            </td>
          </tr>
        ))}
      </tbody>
      {showTotals && <TotalsFooter totals={totals} label="Total pago" tone="rose" />}
    </table>
  </div>
);
