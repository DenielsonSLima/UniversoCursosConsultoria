import { useEffect, useState } from 'react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import type { NfsePartnerServiceFilters as Filters } from './types/nfse-partner-services.types';
import { validPartnerFilterDate } from './services/nfse-partner-list.contract';

interface Props { value: Filters; disabled: boolean; onChange: (value: Partial<Filters>) => void }
export default function NfsePartnerServiceFilters({ value, disabled, onChange }: Props) {
  const [from, setFrom] = useState(value.dateFrom), [to, setTo] = useState(value.dateTo), [hint, setHint] = useState('');
  useEffect(() => setFrom(value.dateFrom), [value.dateFrom]);
  useEffect(() => setTo(value.dateTo), [value.dateTo]);
  const commit = () => {
    if (!validPartnerFilterDate(from) || !validPartnerFilterDate(to)) { setHint('Complete a data com um ano entre 1900 e 2199.'); return; }
    if (from && to && from > to) { setHint('A data inicial deve ser anterior ou igual à data final.'); return; }
    setHint(''); if (from !== value.dateFrom || to !== value.dateTo) onChange({ dateFrom: from, dateTo: to });
  };
  return <div className="nfse-partner-filterline">
    <label className="nfse-field nfse-partner-search"><span>Buscar registros</span><input type="search" aria-label="Buscar serviços"
      placeholder="Parceiro, CPF/CNPJ, serviço ou nota…" maxLength={100} value={value.search} disabled={disabled}
      onChange={event => onChange({ search: event.target.value })} /></label>
    <label className="nfse-field"><span>Data inicial</span><input type="date" aria-label="Data inicial da prestação" value={from}
      min="1900-01-01" max="2199-12-31" disabled={disabled} onChange={event => { setFrom(event.target.value); setHint(''); }} onBlur={commit} /></label>
    <label className="nfse-field"><span>Data final</span><input type="date" aria-label="Data final da prestação" value={to}
      min="1900-01-01" max="2199-12-31" disabled={disabled} onChange={event => { setTo(event.target.value); setHint(''); }} onBlur={commit} /></label>
    <div className="nfse-field"><label>Tipo de parceiro</label><InstitutionalSelect ariaLabel="Tipo de parceiro" value={value.partnerType}
      disabled={disabled} options={[{ value: '', label: 'Todos os tipos' }, { value: 'PJ', label: 'Pessoa jurídica (PJ)' },
        { value: 'PF', label: 'Pessoa física (PF)' }, { value: 'ALUNO', label: 'Aluno' }]}
      onValueChange={next => { if (next === '' || next === 'PJ' || next === 'PF' || next === 'ALUNO') onChange({ partnerType: next }); }} /></div>
    {hint && <p className="nfse-partner-filter-hint" role="alert">{hint}</p>}
  </div>;
}
