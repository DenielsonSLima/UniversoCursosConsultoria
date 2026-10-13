import React from 'react';
import { formatCurrency, formatDate } from './outros-creditos.presentation';
import type { OtherCreditPlan, OtherCreditPlanPreview as Preview, OtherCreditPlanRole } from './other-credit-plan.types';
import { otherCreditPlanEmissionState } from './other-credit-plan.model';

const labels: Record<OtherCreditPlanRole, string> = { PARCELA: 'Parcela', MATRICULA: 'Matrícula', REMATRICULA: 'Rematrícula' };
const stateLabels = { closed: 'Encerrada', review: 'Conferir emissão', issued: 'Boleto emitido', pending: 'A emitir' };

export function OtherCreditPlanPreview({ preview, plan }: { preview: Preview; plan?: OtherCreditPlan }) {
  return <section aria-label="Prévia do carnê" className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        ['Parcelas', formatCurrency(preview.totalParcelas)],
        ['Taxas opcionais', formatCurrency(preview.totalTaxas)],
        ['Total nominal', formatCurrency(preview.totalNominal)],
        ['Total com pontualidade', formatCurrency(preview.totalComDesconto)],
      ].map(([label, value]) => <div key={label} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800">{label}</p>
        <p className="mt-2 text-lg font-black text-[#001a33]">{value}</p>
      </div>)}
    </div>
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="bg-slate-50 text-slate-500"><tr>
          {['Cobrança', 'Vencimento', 'Valor nominal', 'Com desconto', 'Prazo do desconto', ...(plan ? ['Emissão'] : [])].map(label => (
            <th key={label} className="px-4 py-3 font-black">{label}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {preview.parcelas.map(item => {
            const receivable = plan?.receivables.find(row => row.outros_creditos_papel === item.papel
              && (item.papel !== 'PARCELA' || Number(row.parcela_numero) === item.numero));
            return <tr key={item.ordem}>
              <td className="px-4 py-3 font-bold text-[#001a33]">{labels[item.papel]} {item.papel === 'PARCELA' ? `${item.numero}/${preview.quantidadeParcelas}` : ''}</td>
              <td className="px-4 py-3 text-slate-600">{formatDate(item.dataVencimento)}</td>
              <td className="px-4 py-3 font-bold text-slate-700">{formatCurrency(item.valor)}</td>
              <td className="px-4 py-3 text-emerald-700">{formatCurrency(item.valorComDesconto)}</td>
              <td className="px-4 py-3 text-slate-600">{item.financialTerms.discount ? formatDate(item.financialTerms.discount.validUntil) : 'Sem desconto'}</td>
              {plan ? <td className="px-4 py-3 font-bold text-slate-600">{receivable ? stateLabels[otherCreditPlanEmissionState(receivable)] : 'A conferir'}</td> : null}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <p className="text-xs leading-5 text-slate-500">
      Juros de atraso: {preview.input.jurosMensalPercentual.toLocaleString('pt-BR')}% ao mês · Multa: {preview.input.multaPercentual.toLocaleString('pt-BR')}%.
      {' '}O total com pontualidade depende do pagamento dentro do prazo de cada desconto.
    </p>
  </section>;
}
