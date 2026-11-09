import React from 'react';
import { Layers, LayoutGrid, LayoutList } from 'lucide-react';
import FinancialSelect from '../../components/FinancialSelect';
import type { DespesaAgrupamento } from '../despesas.queryKeys';

export type DespesaAgrupamentoSelection = DespesaAgrupamento | 'nenhum';

interface Props {
  viewMode: 'tabela' | 'cards';
  onViewModeChange: (value: 'tabela' | 'cards') => void;
  agrupamento: DespesaAgrupamentoSelection;
  onAgrupamentoChange: (value: DespesaAgrupamentoSelection) => void;
}

const DespesaViewControls: React.FC<Props> = ({ viewMode, onViewModeChange, agrupamento, onAgrupamentoChange }) => (
  <div className="ml-auto flex shrink-0 items-center gap-2" role="group" aria-label="Visualização das despesas">
    <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      {[{ value: 'tabela' as const, label: 'Tabela', Icon: LayoutList },
        { value: 'cards' as const, label: 'Cartões', Icon: LayoutGrid }].map(({ value, label, Icon }) => (
        <button key={value} type="button" title={label} aria-label={label} aria-pressed={viewMode === value}
          onClick={() => onViewModeChange(value)}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${viewMode === value ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Icon size={15} />
        </button>
      ))}
    </div>
    <Layers size={15} className="text-slate-500" aria-hidden="true" />
    <FinancialSelect value={agrupamento}
      onValueChange={(value) => onAgrupamentoChange(value as DespesaAgrupamentoSelection)}
      ariaLabel="Agrupar despesas" className="w-40 sm:w-44"
      options={[
        { value: 'mes', label: 'Por mês', keywords: 'vencimento competência' },
        { value: 'fornecedor', label: 'Por fornecedor', keywords: 'parceiro credor' },
        { value: 'categoria', label: 'Por categoria' },
        { value: 'nenhum', label: 'Sem agrupamento' },
      ]} />
  </div>
);

export default DespesaViewControls;
