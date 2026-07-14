import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { QueryDisplayState } from '../turmas.types';

interface QueryStateNoticeProps {
  state: QueryDisplayState;
  label: string;
}

const QueryStateNotice: React.FC<QueryStateNoticeProps> = ({ state, label }) => {
  if (state.isLoading) {
    return <div className="flex items-center justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>;
  }
  if (!state.isError) return null;

  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-5 text-rose-700 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-black">Não foi possível carregar {label}.</p>
          <p className="mt-1 text-[10px] font-semibold text-rose-600">Os dados não estão vazios: ocorreu uma falha de consulta. Tente novamente.</p>
        </div>
      </div>
      <button type="button" onClick={() => void state.refetch()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-rose-100"><RefreshCw size={13} /> Recarregar</button>
    </div>
  );
};

export default QueryStateNotice;
