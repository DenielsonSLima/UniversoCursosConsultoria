import React from 'react';
import type { OtherCreditPlanPreview } from '../../financeiro/outros-creditos/other-credit-plan.types';
import { formatCurrency, formatDate } from '../../financeiro/outros-creditos/outros-creditos.presentation';

export default function NfseServicePlanPreview({ preview }: { preview: OtherCreditPlanPreview }) {
  return <section className="nfse-partner-form-section" aria-label="Revisão financeira do serviço">
    <div className="flex flex-wrap gap-5 text-sm"><p>Total do serviço: <strong>{formatCurrency(preview.totalNominal)}</strong></p>
      <p>{preview.quantidadeParcelas} parcela(s)</p><p>Com pontualidade: <strong>{formatCurrency(preview.totalComDesconto)}</strong></p></div>
    <div className="nfse-table-wrap mt-3"><table className="nfse-table"><thead><tr>{['Parcela', 'Vencimento', 'Valor', 'Com desconto', 'Prazo do desconto', 'Juros ao mês', 'Multa'].map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{preview.parcelas.map(item => <tr key={item.numero}><td>{item.numero}/{preview.quantidadeParcelas}</td><td>{formatDate(item.dataVencimento)}</td>
        <td>{formatCurrency(item.valor)}</td><td>{formatCurrency(item.valorComDesconto)}</td><td>{item.financialTerms.discount ? formatDate(item.financialTerms.discount.validUntil) : 'Sem desconto'}</td>
        <td>{item.financialTerms.interest ? item.financialTerms.interest.type === 'monthly-percentage'
          ? `${item.financialTerms.interest.value.toLocaleString('pt-BR')}% ao mês` : `${formatCurrency(item.financialTerms.interest.value)} ao dia` : 'Sem juros'}</td>
        <td>{item.financialTerms.penalty ? item.financialTerms.penalty.type === 'percentage'
          ? `${item.financialTerms.penalty.value.toLocaleString('pt-BR')}%` : formatCurrency(item.financialTerms.penalty.value) : 'Sem multa'}</td></tr>)}</tbody></table></div>
    <p className="nfse-inline-help mt-3">Juros e multa são condições de atraso. O desconto depende do prazo de pontualidade de cada parcela.</p>
  </section>;
}
