import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import Files from 'lucide-react/dist/esm/icons/files';
import ReceiptText from 'lucide-react/dist/esm/icons/receipt-text';
import type { BanesePaymentRecord } from '../banese-payment.types';
import {
  formatBaneseCurrency,
  formatBaneseDate,
  getBaneseInstallmentLabel,
  getBaneseStatusPresentation,
} from '../banese-payment.utils';

interface BaneseInstallmentNavigatorProps {
  installments: BanesePaymentRecord[];
  selectedId: string;
  onSelect: (record: BanesePaymentRecord) => void;
}

const BaneseInstallmentNavigator = ({ installments, selectedId, onSelect }: BaneseInstallmentNavigatorProps) => {
  if (installments.length < 3) return null;
  const paid = installments.filter((item) => getBaneseStatusPresentation(item).tone === 'success').length;

  return (
    <section className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-7 lg:px-10">
      <div className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#001a33] text-white">
              <Files size={18} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Carnê Banese</p>
              <p className="text-sm font-black text-[#001a33]">Plano de pagamento • {installments.length} parcelas</p>
            </div>
          </div>
          <div className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
            {paid} de {installments.length} pagas
          </div>
        </div>

        <div className="flex snap-x gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:thin]">
          {installments.map((record, index) => {
            const selected = record.id === selectedId;
            const status = getBaneseStatusPresentation(record);
            const StatusIcon = status.tone === 'success'
              ? CheckCircle2
              : status.tone === 'danger'
                ? AlertTriangle
                : ReceiptText;
            return (
              <button
                key={record.id}
                type="button"
                onClick={() => onSelect(record)}
                aria-pressed={selected}
                className={`min-w-[164px] snap-start rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  selected
                    ? 'border-[#001a33] bg-[#001a33] text-white shadow-lg shadow-blue-950/15'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[9px] font-black uppercase tracking-[0.14em] ${selected ? 'text-slate-300' : 'text-slate-400'}`}>
                    {getBaneseInstallmentLabel(record, index)}
                  </span>
                  <StatusIcon size={14} className={selected ? 'text-emerald-300' : status.tone === 'success' ? 'text-emerald-600' : status.tone === 'danger' ? 'text-rose-600' : 'text-amber-600'} />
                </div>
                <p className="mt-2 text-sm font-black">{formatBaneseCurrency(record.valor)}</p>
                <p className={`mt-1 text-[10px] font-bold ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                  Vence {formatBaneseDate(record.data_vencimento)}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default BaneseInstallmentNavigator;
