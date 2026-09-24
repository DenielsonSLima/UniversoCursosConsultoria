import React from 'react';
import type { CicloFinanceiroTecnicoManualRevisaoItem } from './matricula-tecnica-ciclo-manual.types';

export interface CicloManualItemEditorProps {
  draft: CicloFinanceiroTecnicoManualRevisaoItem;
  disabled: boolean;
  onChange: (field: keyof Omit<CicloFinanceiroTecnicoManualRevisaoItem, 'chave'>, value: string) => void;
}

const fields = [
  ['vencimento', 'Vencimento', 'date', undefined],
  ['valor', 'Valor nominal (R$)', 'number', '0.01'],
  ['descontoPontualidade', 'Desconto em dia (R$)', 'number', '0.01'],
  ['jurosAtrasoPercentual', 'Juros ao mês (%)', 'number', '0.000001'],
  ['multaAtrasoPercentual', 'Multa única (%)', 'number', '0.000001'],
] as const;

const FinanceiroCicloManualItemEditor: React.FC<CicloManualItemEditorProps> = ({ draft, disabled, onChange }) => (
  <fieldset disabled={disabled} className="mt-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
    <legend className="px-1 text-[9px] font-black uppercase text-blue-700">Revisar esta cobrança</legend>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {fields.map(([field, label, type, step]) => (
        <label key={field} className="space-y-1 text-[10px] font-bold text-slate-600">
          <span className="block">{label}</span>
          <input
            type={type}
            value={draft[field]}
            step={step}
            min={type === 'number' ? (field === 'valor' ? '0.01' : '0') : undefined}
            required
            onChange={(event) => onChange(field, event.target.value)}
            className="w-full min-w-0 rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
          />
        </label>
      ))}
    </div>
  </fieldset>
);

export default FinanceiroCicloManualItemEditor;
