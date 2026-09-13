import React from 'react';
import type { ContasReceber } from '../../../financeiro.types';
import {
  getFinancialCompositionPresentation,
  isProescFinancialComposition,
} from '../../../financeiro.composition-presentation';
import { formatCurrency, formatReceivableDate, receivableDiscountPresentation } from './modalidade-receber.utils';
import {
  financialReportValueToText,
  type FinancialReportPdfTextComponent,
} from '../../../components/financial-report.vector-pdf.resources';

const hasAmount = (value?: number): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

interface ReceivableAmountSummaryProps {
  item: Pick<ContasReceber,
    'valor' | 'valorPago' | 'descontoAplicado' | 'jurosAplicados' | 'multaAplicada'
    | 'acrescimoAplicado' | 'diferencaNaoDiscriminada' | 'composicaoStatus'
    | 'boletoNossoNumero' | 'boletoDescontoConfigurado' | 'boletoDescontoValidoAte'
    | 'boletoDescontoSituacao'> & { status: string };
  compact?: boolean;
}

const renderReceivableAmountSummary = ({ item, compact = false }: ReceivableAmountSummaryProps) => {
  const discount = receivableDiscountPresentation(item);
  const discountExpired = discount?.kind === 'BOLETO_EXPIRADO';
  const composition = getFinancialCompositionPresentation(item.composicaoStatus);
  const proescComposition = item.status === 'PAGO' && isProescFinancialComposition(item.composicaoStatus);
  const amountLabel = (value?: number) => hasAmount(value) ? formatCurrency(value) : 'Não informado';
  const detailSize = compact ? 'text-[10px]' : 'text-[11px]';

  return (
    <div className={`${compact ? 'min-w-0 ' : ''}space-y-1`}>
      <p className="whitespace-nowrap text-sm font-black text-[#001a33]">{formatCurrency(item.valor)}</p>
      {proescComposition ? (
        <>
          <p className={`${detailSize} font-bold text-emerald-700`}>Desconto: {amountLabel(item.descontoAplicado)}</p>
          <p className={`${detailSize} font-bold text-amber-700`}>Juros: {amountLabel(item.jurosAplicados)}</p>
          <p className={`${detailSize} font-bold text-rose-700`}>Multa: {amountLabel(item.multaAplicada)}</p>
          <p className={`${detailSize} font-bold text-indigo-700`}>Acréscimos: {amountLabel(item.acrescimoAplicado)}</p>
        </>
      ) : (
        <>
          {discount ? (
            <p className={`${compact ? 'text-[10px] leading-tight' : 'text-[11px]'} font-bold ${discountExpired ? 'text-amber-700' : 'text-emerald-700'}`}>
              <span className="whitespace-nowrap">
                {discount.kind === 'APLICADO'
                  ? 'Desconto aplicado'
                  : discountExpired ? 'Desconto expirado' : 'Desconto do boleto'}:
                {' '}{formatCurrency(discount.value)}
              </span>
              {discount.validUntil ? (
                <span className={`block whitespace-nowrap ${compact ? 'mt-0.5 text-[9px]' : 'text-[10px]'}`}>
                  {discountExpired ? 'Expirou em' : 'Válido até'}{' '}{formatReceivableDate(discount.validUntil)}
                </span>
              ) : null}
            </p>
          ) : null}
          {hasAmount(item.jurosAplicados) && item.jurosAplicados > 0 ? (
            <p className={`whitespace-nowrap ${detailSize} font-bold text-amber-700`}>Juros: {formatCurrency(item.jurosAplicados)}</p>
          ) : null}
          {hasAmount(item.multaAplicada) && item.multaAplicada > 0 ? (
            <p className={`whitespace-nowrap ${detailSize} font-bold text-rose-700`}>Multa: {formatCurrency(item.multaAplicada)}</p>
          ) : null}
          {hasAmount(item.acrescimoAplicado) && item.acrescimoAplicado > 0 ? (
            <p className={`whitespace-nowrap ${detailSize} font-bold text-indigo-700`}>Acréscimos: {formatCurrency(item.acrescimoAplicado)}</p>
          ) : null}
        </>
      )}
      {item.valorPago !== undefined ? (
        <p className={`whitespace-nowrap ${detailSize} font-black text-emerald-700`}>Recebido: {formatCurrency(item.valorPago)}</p>
      ) : null}
      {item.status === 'PAGO' && composition ? (
        <p className={`${detailSize} font-semibold ${composition.tone === 'confirmed' ? 'text-emerald-700' : 'text-amber-800'}`}>
          {composition.label}
        </p>
      ) : null}
      {item.status === 'PAGO' && hasAmount(item.diferencaNaoDiscriminada) && item.diferencaNaoDiscriminada !== 0 ? (
        <p className={`${detailSize} font-bold text-amber-800`}>
          Diferença não discriminada: {formatCurrency(item.diferencaNaoDiscriminada)}
        </p>
      ) : null}
    </div>
  );
};

export const ReceivableAmountSummary = renderReceivableAmountSummary as
  FinancialReportPdfTextComponent<ReceivableAmountSummaryProps>;

ReceivableAmountSummary.pdfText = (props) => (
  financialReportValueToText(renderReceivableAmountSummary(props))
);
