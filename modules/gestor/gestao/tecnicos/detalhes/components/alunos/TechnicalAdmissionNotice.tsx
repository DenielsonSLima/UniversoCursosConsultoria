import React from 'react';
import { ArrowDownToLine, RefreshCw } from 'lucide-react';
import type { TechnicalAdmissionUiState } from '../../../../../../shared/utils/technicalAdmissionPolicy';

interface Props {
  admission: TechnicalAdmissionUiState;
  onReceiveTransfer?: () => void;
  onRetry?: () => void;
}

const TechnicalAdmissionNotice: React.FC<Props> = ({ admission, onReceiveTransfer, onRetry }) => {
  if (!admission.message) return null;
  return (
    <div role="status" className={`rounded-2xl border p-4 text-xs font-semibold ${admission.allowed
      ? 'border-blue-100 bg-blue-50 text-blue-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      <p>{admission.message}</p>
      {admission.transferRequired && <p className="mt-2">Use Ciclo Acadêmico → Receber transferência ou Secretaria → Transferência → Receber.</p>}
      {((admission.transferRequired && onReceiveTransfer) || (admission.retryable && onRetry)) && <div className="mt-3 flex flex-wrap gap-2">
        {admission.transferRequired && onReceiveTransfer && <button type="button" onClick={onReceiveTransfer}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black text-white hover:bg-violet-700">
          <ArrowDownToLine size={15} /> Receber transferência
        </button>}
        {admission.retryable && onRetry && <button type="button" onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-xs font-black text-amber-900">
          <RefreshCw size={14} /> Tentar novamente
        </button>}
      </div>}
    </div>
  );
};

export default TechnicalAdmissionNotice;
