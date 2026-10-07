import React from 'react';
import { canReviewCorrection, correctionLabels, type CorrectionSummary } from './bounded-correction';
export default function FinanceiroBoundedCorrectionStatus({ correction, disabled, onReview }: {
  correction: CorrectionSummary; disabled: boolean; onReview: () => void;
}) {
  return <div role="status" className="space-y-1 text-xs">
    <p className="font-bold">{correctionLabels[correction.status]}</p>
    <p>12 mensalidades no 1º ciclo existente. Nenhum novo ciclo ou taxa de matrícula.</p>
    {correction.historicalCycle2Count > 0 && <p>2º ciclo: 13 títulos somente históricos; retomada bloqueada.</p>}
    {correction.localFeeDisposition === 'PRESERVED_PAID' && <p>Matrícula paga preservada no histórico; sem nova cobrança.</p>}
    {canReviewCorrection(correction) && <button type="button" disabled={disabled} onClick={onReview}
      className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 font-bold text-blue-700 disabled:opacity-50">
      Revisar correção e emitir 1º ciclo
    </button>}
  </div>;
}
