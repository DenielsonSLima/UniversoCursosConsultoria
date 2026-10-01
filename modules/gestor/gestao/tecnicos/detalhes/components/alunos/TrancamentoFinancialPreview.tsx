import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import type { TrancamentoFinancialPreview as Preview } from '../../trancamento-financeiro.contract';

interface Props {
  preview?: Preview;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const TrancamentoFinancialPreview: React.FC<Props> = ({
  preview,
  loading,
  error,
  onRetry,
}) => {
  if (loading) return (
    <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs font-bold text-blue-800">
      <Loader2 size={15} className="animate-spin" /> Conferindo o impacto financeiro do trancamento...
    </div>
  );
  if (error || !preview) return (
    <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700">
      <p>A prévia financeira não foi confirmada. O trancamento está bloqueado para evitar baixa indevida.</p>
      <button type="button" onClick={onRetry}
        className="mt-2 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase">
        <RefreshCw size={12} /> Tentar novamente
      </button>
    </div>
  );

  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <p className="font-bold">
          {preview.futureBaneseToCancel} boleto(s) Banese não pago(s), com vencimento após {preview.cutoffDate},
          serão enviados à fila de baixa.
        </p>
      </div>
      <p>
        Pagos/parciais ({preview.paidPreserved}) e vencimentos até o corte
        ({preview.throughCutoffPreserved}) serão preservados. Os boletos Banese continuam em aberto
        e provisionados durante a fila; só aparecem como CANCELADOS e saem dos valores em aberto
        após confirmação do banco.
      </p>
      {preview.futureLocalSuspended > 0 && (
        <p>{preview.futureLocalSuspended} cobrança(s) somente local(is) futura(s) ficarão suspensas.</p>
      )}
      {preview.futureProescPreserved > 0 && (
        <p>
          {preview.futureProescPreserved} cobrança(s) histórica(s) do Proesc serão preservadas sem alteração.
        </p>
      )}
      {preview.futureBaneseReview > 0 && (
        <p className="font-bold text-red-700">
          {preview.futureBaneseReview} título(s) possuem identidade bancária incompleta e exigirão revisão;
          revisão não significa cancelamento no banco.
        </p>
      )}
      {preview.futureBaneseToCancel === 0 && preview.futureBaneseReview === 0 && (
        <p className="flex items-center gap-2 font-bold text-emerald-700">
          <CheckCircle2 size={14} /> Nenhum boleto Banese futuro será baixado.
        </p>
      )}
      {(preview.baneseCancellation.pending > 0
        || preview.baneseCancellation.processing > 0
        || preview.baneseCancellation.reviewRequired > 0
        || preview.baneseCancellation.canceled > 0) && (
        <p className="font-bold">
          Estado atual: {preview.baneseCancellation.pending} pendente(s),{' '}
          {preview.baneseCancellation.processing} em processamento,{' '}
          {preview.baneseCancellation.reviewRequired} em revisão e{' '}
          {preview.baneseCancellation.canceled} cancelado(s) confirmado(s).
        </p>
      )}
    </div>
  );
};

export default TrancamentoFinancialPreview;
