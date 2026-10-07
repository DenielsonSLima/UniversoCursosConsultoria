import React, { useEffect, useRef, useState } from 'react';
import { canReviewCorrection, type CorrectionPreview, type CorrectionSummary } from './bounded-correction';
import { boundedCorrectionService } from './bounded-correction.service';
import { useAccessibleDialog } from './hooks/useAccessibleDialog';
const money = (value: string | number) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: string) => value.split('-').reverse().join('/');
interface FinanceiroBoundedCorrectionDialogProps {
  correction: CorrectionSummary; onClose: () => void;
  onConfirm: (preview: CorrectionPreview) => Promise<void>;
}
const FinanceiroBoundedCorrectionDialog: React.FC<FinanceiroBoundedCorrectionDialogProps> = ({ correction, onClose, onConfirm }) => {
  const [preview, setPreview] = useState<CorrectionPreview | null>(null);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  const { dialogRef, initialFocusRef } = useAccessibleDialog(true, onClose, pending);
  useEffect(() => {
    let current = true;
    setPreview(null); setAccepted(false); setError('');
    boundedCorrectionService.preview(correction.operationId, correction.matriculaId).then((result) => {
      if (current) setPreview(result);
    }).catch((e) => { if (current) setError(e instanceof Error ? e.message : 'Não foi possível consultar a correção.'); });
    return () => { current = false; };
  }, [correction.operationId, correction.matriculaId, correction.fingerprint]);
  const confirm = async () => {
    if (busy.current || !accepted || !preview || !canReviewCorrection(preview)) return;
    busy.current = true; setPending(true); setError('');
    try {
      const consentRequestId = preview.consent.consented ? preview.consent.requestId! : requestId.current;
      await boundedCorrectionService.consent(preview, consentRequestId);
      await onConfirm(preview);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A emissão não foi confirmada. O progresso foi preservado.');
      // Review and consent again after any failure; retry keeps the same idempotency key.
      setAccepted(false);
    } finally { busy.current = false; setPending(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="correction-title" tabIndex={-1}
      className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
      <h2 id="correction-title" className="text-lg font-bold">Revisar correção do 1º ciclo existente</h2>
      <p className="mt-2 text-sm">O cancelamento bancário não emite boletos. Confirme abaixo para retomar somente as 12 mensalidades corrigidas, preservando os registros originais.</p>
      {!preview && !error && <p role="status">Consultando valores e datas canônicos...</p>}
      {error && <p role="alert" className="my-3 text-red-700">{error}</p>}
      {preview && <>
        <p className="my-3 font-bold">Total nominal ativo: {money(preview.activeTotal)}. Sem nova taxa de matrícula.</p>
        {preview.historicalCycle2Count > 0 && <p>Os 13 títulos do 2º ciclo ficam apenas no histórico. Não serão retomados e não haverá 3º ciclo.</p>}
        <p>{preview.localFeeDisposition === 'WAIVED' ? 'Taxa local dispensada com registro preservado.'
          : preview.localFeeDisposition === 'PRESERVED_PAID' ? 'Taxa local paga preservada; sem estorno ou nova cobrança.' : 'Taxa local pendente de revisão; emissão bloqueada.'}</p>
        <div className="my-4 overflow-x-auto"><table className="w-full text-left text-xs">
          <thead><tr><th>Mensalidade</th><th>Vencimento</th><th>Nominal</th><th>Desconto</th><th>Multa</th><th>Juros</th></tr></thead>
          <tbody>{preview.installments.map((item, index) => <tr key={item.id} className="border-t">
            <td className="py-2">{index + 1}</td><td>{date(item.dueDate)}</td><td>{money(item.value)}</td>
            <td>{money(item.financialTerms.discount.value)} até {date(item.financialTerms.discount.validUntil)}</td>
            <td>{item.financialTerms.penalty.value}% a partir de {date(item.financialTerms.penalty.startsOn)}</td>
            <td>{item.financialTerms.interest.value}% ao mês a partir de {date(item.financialTerms.interest.startsOn)}</td>
          </tr>)}</tbody>
        </table></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={accepted}
          disabled={pending || !canReviewCorrection(preview)} onChange={(e) => setAccepted(e.target.checked)} />
          Revisei todos os valores, descontos, encargos e vencimentos e autorizo a emissão manual destas mensalidades corrigidas.
        </label>
      </>}
      <div className="mt-5 flex justify-end gap-3">
        <button ref={initialFocusRef as React.RefObject<HTMLButtonElement>} type="button" disabled={pending} onClick={onClose}>Cancelar</button>
        <button type="button" disabled={pending || !accepted || !preview || !canReviewCorrection(preview)} onClick={() => void confirm()}
          className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-40">
          {pending ? 'Confirmando emissão...' : 'Confirmar termos e emitir 1º ciclo'}
        </button>
      </div>
    </div>
  </div>;
};
export default FinanceiroBoundedCorrectionDialog;
