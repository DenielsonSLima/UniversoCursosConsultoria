import React from 'react';
import { FilterField, FilterSelect } from './RelatorioShared';
export default function ExtratoContaScope({ enabled, value, onChange }: { enabled: boolean; value: boolean; onChange: (value: boolean) => void }) {
  if (!enabled) return null;
  return <FilterField label="Abrangência do extrato">
    <FilterSelect value={value ? 'CONTA' : 'POLO'} onChange={(event) => onChange(event.target.value === 'CONTA')}>
      <option value="POLO">Somente este polo</option>
      <option value="CONTA">Toda a conta · todos os polos</option>
    </FilterSelect>
    <p className="text-xs text-slate-500">Toda a conta reúne entradas e saídas dos polos para conferir com o banco.</p>
  </FilterField>;
}
