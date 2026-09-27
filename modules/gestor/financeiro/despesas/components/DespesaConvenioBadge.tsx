import React from 'react';
import { Handshake } from 'lucide-react';
import type { DespesaLancamento } from '../despesas.service';
import { formatCompetencia } from './despesa-form.utils';

const DespesaConvenioBadge: React.FC<{ item: DespesaLancamento }> = ({ item }) => {
  if (!item.convenioMesId) return null;
  const label = item.convenioNome || 'Convênio vinculado';
  const competencia = item.convenioCompetencia
    ? ` · ${formatCompetencia(item.convenioCompetencia)}`
    : '';
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-800">
      <Handshake size={10} /> {label}{competencia}
    </span>
  );
};

export default DespesaConvenioBadge;
