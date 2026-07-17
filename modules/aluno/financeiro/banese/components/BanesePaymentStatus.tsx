import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import Clock3 from 'lucide-react/dist/esm/icons/clock-3';
import MinusCircle from 'lucide-react/dist/esm/icons/minus-circle';
import type { BaneseStatusPresentation } from '../banese-payment.types';

const toneClasses = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-rose-200 bg-rose-50 text-rose-800',
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
};

const toneIcons = {
  success: CheckCircle2,
  warning: Clock3,
  danger: AlertTriangle,
  neutral: MinusCircle,
};

interface BanesePaymentStatusProps {
  status: BaneseStatusPresentation;
  compact?: boolean;
}

const BanesePaymentStatus = ({ status, compact = false }: BanesePaymentStatusProps) => {
  const Icon = toneIcons[status.tone];
  return (
    <div
      className={`flex items-start gap-2 rounded-2xl border ${compact ? 'px-3 py-2' : 'px-4 py-3'} ${toneClasses[status.tone]}`}
      role="status"
      aria-live="polite"
    >
      <Icon size={compact ? 15 : 17} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.16em]">{status.label}</p>
        {compact ? null : <p className="mt-1 text-xs font-semibold leading-relaxed opacity-80">{status.detail}</p>}
      </div>
    </div>
  );
};

export default BanesePaymentStatus;
