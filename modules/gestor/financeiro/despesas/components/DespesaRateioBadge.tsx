import React, { useState } from 'react';
import { Info } from 'lucide-react';
import type { DespesaLancamento } from '../despesas.types';
import DespesaRateioModal from './DespesaRateioModal';

export default function DespesaRateioBadge({ item }: { item: DespesaLancamento }) {
  const [open, setOpen] = useState(false);
  if (!item.isRateioDerived && (!item.rateioMode || item.rateioMode === 'SEM_RATEIO')) return null;
  const count = item.rateioPolosQuantidade;
  const label = item.isRateioDerived
    ? `Rateio da Matriz${item.poloMatrizNome ? ` · ${item.poloMatrizNome}` : ''}`
    : `Custo rateado${count ? ` em ${count} polo${count === 1 ? '' : 's'}` : ''}`;

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
      aria-label={`Ver detalhes do rateio de ${item.descricao}`}
      title="Ver polos e valores do rateio"
      className="mt-1 inline-flex max-w-full items-center gap-1 text-left text-xs font-medium text-indigo-600 underline decoration-dotted underline-offset-2 hover:text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
      <span>{label}</span><Info size={12} className="shrink-0" aria-hidden="true" />
    </button>
    {open && <DespesaRateioModal item={item} onClose={() => setOpen(false)} />}
  </>;
}

