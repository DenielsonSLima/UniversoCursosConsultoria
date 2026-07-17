import Barcode from 'lucide-react/dist/esm/icons/barcode';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import Clipboard from 'lucide-react/dist/esm/icons/clipboard';
import Download from 'lucide-react/dist/esm/icons/download';
import FileCheck2 from 'lucide-react/dist/esm/icons/file-check-2';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import type { BanesePaymentRecord } from '../banese-payment.types';
import {
  formatBaneseDigitableLine,
  hasRegisteredBaneseBoleto,
  onlyDigits,
} from '../banese-payment.utils';
import useCopyFeedback from '../hooks/useCopyFeedback';

interface BaneseBoletoPanelProps {
  record: BanesePaymentRecord;
  disabled?: boolean;
  documentUrl?: string | null;
  documentLoading?: boolean;
  documentError?: string | null;
  onDownloadDocument?: () => void;
  onRetryDocument?: () => void;
}

const BaneseBoletoPanel = ({
  record,
  disabled = false,
  documentUrl,
  documentLoading = false,
  documentError,
  onDownloadDocument,
  onRetryDocument,
}: BaneseBoletoPanelProps) => {
  const { state, copy } = useCopyFeedback(record.id);
  const line = onlyDigits(record.gateway_boleto_linha_digitavel);
  const registered = hasRegisteredBaneseBoleto(record);
  const officialDocumentUrl = documentUrl;

  return (
    <section className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#001a33] text-white">
            <Barcode size={18} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Boleto Banese</p>
            <p className="text-xs font-bold text-[#001a33]">Linha digitável</p>
          </div>
        </div>
        {registered ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700">
            <FileCheck2 size={11} /> Registrado
          </span>
        ) : null}
      </div>

      <div className="p-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="break-all font-mono text-xs font-black leading-6 tracking-[0.04em] text-[#001a33]">
            {disabled ? 'Cobrança encerrada' : line ? formatBaneseDigitableLine(line) : 'Linha digitável em preparação'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void copy(line)}
          disabled={!registered || disabled}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#07345f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {state === 'copied' ? <CheckCircle2 size={15} /> : <Clipboard size={15} />}
          {state === 'copied' ? 'Linha copiada' : 'Copiar linha digitável'}
        </button>

        <p className={`mt-2 text-center text-[10px] font-bold ${state === 'error' ? 'text-rose-600' : 'text-slate-400'}`} aria-live="polite">
          {state === 'error' ? 'Não foi possível copiar. Selecione a linha manualmente.' : 'O código de barras bancário foi validado no registro.'}
        </p>

        {officialDocumentUrl && !disabled ? (
          <button
            type="button"
            onClick={onDownloadDocument}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700 transition hover:border-blue-200 hover:bg-blue-50"
          >
            <Download size={15} /> Baixar boleto em PDF
          </button>
        ) : documentLoading ? (
          <div className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-center text-[10px] font-bold text-slate-500">
            Montando boleto em PDF...
          </div>
        ) : documentError ? (
          <button
            type="button"
            onClick={onRetryDocument}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-center text-[10px] font-bold text-rose-700"
          >
            <RefreshCw size={14} /> Tentar gerar o PDF novamente
          </button>
        ) : disabled ? (
          <div className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-center text-[10px] font-bold leading-relaxed text-slate-500">
            <FileCheck2 size={14} className="shrink-0" /> Esta cobrança está encerrada e não aceita mais pagamento.
          </div>
        ) : (
          <div className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-[10px] font-bold leading-relaxed text-slate-500">
            <FileCheck2 size={14} className="shrink-0" /> O pagamento já pode ser feito pela linha digitável. O PDF aparecerá aqui quando estiver disponível.
          </div>
        )}
      </div>
    </section>
  );
};

export default BaneseBoletoPanel;
