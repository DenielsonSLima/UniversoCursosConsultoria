import React from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  offline?: boolean;
  retrying?: boolean;
  onRetry: () => void;
}

export function ReceivablesQueryRecovery({ offline, retrying, onRetry }: Props) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
      <div>
        <p className="font-bold">{offline ? 'Sem conexão para carregar os recebíveis.' : 'Não foi possível atualizar os recebíveis.'}</p>
        <p className="mt-1">{offline ? 'A consulta será retomada quando a conexão voltar.' : 'Tente novamente. Seus filtros foram mantidos.'}</p>
      </div>
      {!offline ? (
        <button type="button" disabled={retrying} onClick={onRetry} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 font-bold disabled:opacity-50">
          <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} />
          {retrying ? 'Tentando novamente…' : 'Tentar novamente'}
        </button>
      ) : null}
    </div>
  );
}
