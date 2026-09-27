import React from 'react';
import type { CaixaConvenioResumoItem } from '../caixa-convenios.service';
import { formatCaixaCurrency } from '../caixa.formatters';
import type { CaixaDetailedReport } from './caixa-report.types';

export const CaixaReportConvenios: React.FC<{
  report: CaixaDetailedReport;
  rows: CaixaConvenioResumoItem[];
  page: number;
}> = ({ report, rows, page }) => (
  <div>
    <div className="mb-3 flex items-end justify-between border-b border-violet-100 pb-2">
      <div>
        <p className="text-[8px] font-black uppercase tracking-widest text-violet-700">Recursos vinculados</p>
        <h2 className="text-base font-black uppercase tracking-tight text-[#001a33]">Convênios</h2>
        <p className="mt-0.5 text-[8px] text-slate-500">Ciclo manual; baixas posteriores aparecem no Caixa do mês do pagamento, sem duplicação.</p>
      </div>
      <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Página da seção {page}</span>
    </div>
    {!report.convenios.disponivel ? (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">Posição de convênios indisponível para este perfil.</div>
    ) : (
      <>
        <div className="mb-3 grid grid-cols-5 gap-1.5">
          {[
            ['Saldo inicial', report.convenios.dados.saldoInicial],
            ['Créditos', report.convenios.dados.creditosRecebidos],
            ['Despesas pagas', report.convenios.dados.despesasPagas],
            ['Disponível', report.convenios.dados.saldoDisponivel],
            ['Projetado', report.convenios.dados.saldoProjetado],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-violet-100 bg-violet-50 p-2">
              <p className="text-[7px] font-black uppercase text-violet-700">{label}</p>
              <p className="mt-1 text-[11px] font-black text-slate-900">{formatCaixaCurrency(value as number)}</p>
            </div>
          ))}
        </div>
        <table className="w-full table-fixed border-collapse text-[7px]">
          <thead><tr className="bg-violet-50 text-left uppercase text-violet-800">
            {['Convênio', 'Status', 'Saldo inicial', 'Créditos', 'Pagas', 'Em aberto', 'Projetado'].map((title) => <th key={title} className="p-2">{title}</th>)}
          </tr></thead>
          <tbody>{rows.map((item) => <tr key={item.convenioId} className="border-b border-slate-100">
            <td className="p-2 font-bold">{item.nome}</td><td className="p-2">{item.status === 'ABERTO' ? 'Em aberto' : 'Finalizado'}</td>
            {[item.saldoInicial, item.creditosRecebidos, item.despesasPagas, item.comprometidoAberto, item.saldoProjetado].map((value, index) => <td key={index} className="p-2">{formatCaixaCurrency(value)}</td>)}
          </tr>)}</tbody>
        </table>
      </>
    )}
  </div>
);
