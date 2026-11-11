import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { useEffect, useState } from 'react';
export interface NfseIssuedFilterValues { dateFrom: string; dateTo: string; courseType: string; origin: '' | 'ALUNO' | 'SERVICO' }
interface Props { value: NfseIssuedFilterValues; courseTypes: { value: string; label: string }[]; disabled: boolean; onChange: (value: Partial<NfseIssuedFilterValues>) => void;
  search: string; searchDisabled: boolean; onSearch: (value: string) => void }
export default function NfseIssuedFilters({ value, courseTypes, disabled, onChange, search, searchDisabled, onSearch }: Props) {
  const [from, setFrom] = useState(value.dateFrom), [to, setTo] = useState(value.dateTo), [hint, setHint] = useState('');
  useEffect(() => setFrom(value.dateFrom), [value.dateFrom]);
  useEffect(() => setTo(value.dateTo), [value.dateTo]);
  const valid = (date: string) => !date || /^(19[0-9]{2}|20[0-9]{2}|21[0-9]{2})-[0-9]{2}-[0-9]{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  const commit = () => {
    if (!valid(from) || !valid(to)) { setHint('Complete a data com um ano entre 1900 e 2199 antes de aplicar o filtro.'); return; }
    if (from && to && from > to) { setHint('A data inicial deve ser anterior ou igual à data final.'); return; }
    setHint(''); if (from !== value.dateFrom || to !== value.dateTo) onChange({ dateFrom: from, dateTo: to });
  };
  return <div className="nfse-issued-filterline">
    <label className="nfse-field nfse-issued-search"><span>Buscar registros</span><input id="nfse-search-EMITIDA" aria-label="Buscar registros" type="search" value={search} disabled={searchDisabled}
      placeholder="Aluno, parceiro ou nota…" onChange={event => onSearch(event.target.value)} /></label>
    <label className="nfse-field"><span>Data inicial</span><input aria-label="Data inicial de emissão" type="date" value={from} min="1900-01-01" max="2199-12-31" disabled={disabled}
      onChange={event => { setFrom(event.target.value); setHint(''); }} onBlur={commit} /></label>
    <label className="nfse-field"><span>Data final</span><input aria-label="Data final de emissão" type="date" value={to} min="1900-01-01" max="2199-12-31" disabled={disabled}
      onChange={event => { setTo(event.target.value); setHint(''); }} onBlur={commit} /></label>
    <div className="nfse-field"><label>Tipo de curso</label><InstitutionalSelect ariaLabel="Tipo de curso das notas" value={value.courseType} disabled={disabled}
      options={[{ value: '', label: 'Todos os tipos' }, ...courseTypes]} onValueChange={next => { if (!next || courseTypes.some(item => item.value === next)) onChange({ courseType: next }); }} /></div>
    <div className="nfse-field"><label>Origem</label><InstitutionalSelect ariaLabel="Origem das notas" value={value.origin} disabled={disabled}
      options={[{ value: '', label: 'Todas as origens' }, { value: 'ALUNO', label: 'Aluno' }, { value: 'SERVICO', label: 'Serviço' }]}
      onValueChange={next => { if (next === '' || next === 'ALUNO' || next === 'SERVICO') onChange({ origin: next }); }} /></div>
    {hint && <p className="nfse-issued-filter-hint" role="alert">{hint}</p>}
  </div>;
}
