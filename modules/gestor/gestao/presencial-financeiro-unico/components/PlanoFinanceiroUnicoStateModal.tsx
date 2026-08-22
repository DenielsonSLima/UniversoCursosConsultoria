import React from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';

interface PlanoFinanceiroUnicoStateModalProps {
  mode: 'loading' | 'error' | 'missing';
  retrying?: boolean;
  onClose: () => void;
  onRetry?: () => void;
}

const PlanoFinanceiroUnicoStateModal: React.FC<PlanoFinanceiroUnicoStateModalProps> = ({
  mode,
  retrying = false,
  onClose,
  onRetry,
}) => {
  const loading = mode === 'loading';
  const missing = mode === 'missing';
  const title = loading
    ? 'Carregando plano financeiro'
    : missing ? 'Plano financeiro não configurado' : 'Plano financeiro não carregado';
  const message = loading
    ? 'Aguarde enquanto o sistema consulta o plano pré-configurado desta turma.'
    : missing
      ? 'Esta turma não possui um plano único válido. A matrícula não foi iniciada para evitar gerar parcelas com valores indefinidos.'
      : 'A confirmação foi bloqueada para não gerar parcelas sem a regra oficial da turma.';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="plano-state-title" className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${loading ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
          {loading ? <Loader2 className="animate-spin" size={22} /> : <AlertCircle size={22} />}
        </div>
        <h3 id="plano-state-title" className="mt-4 text-lg font-black text-[#001a33]">{title}</h3>
        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">{message}</p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Voltar</button>
          {!loading && onRetry ? <button type="button" onClick={onRetry} disabled={retrying} className="flex-1 rounded-xl bg-[#001a33] py-3 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-50"><span className="flex items-center justify-center gap-2"><RefreshCw size={14} className={retrying ? 'animate-spin' : ''} /> Recarregar</span></button> : null}
        </div>
      </section>
    </div>
  );
};

export default PlanoFinanceiroUnicoStateModal;
