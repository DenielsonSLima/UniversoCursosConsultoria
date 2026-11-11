import snapshot from '../catalogos/generated/nfse-additional-data';

export const nfseCurrencyOptions = snapshot.currencies.map(row => ({ value: row.code,
  label: `${row.code} · ${row.name} (${row.symbol})${row.excludedDate ? ` · exclusão PTAX ${row.excludedDate}` : ''}`,
  keywords: row.aliases.join(' ') }));
export const nfseProviderSupportOptions = snapshot.providerSupport.map(row => ({ value: row.code, label: `${row.code} · ${row.description}` }));
export const nfseRecipientSupportOptions = snapshot.recipientSupport.map(row => ({ value: row.code, label: `${row.code} · ${row.description}` }));
// Numeric domain follows the XSD; labels follow the current Web guide / Anexo I.
export const nfseProvisionModeOptions = [
  { value: '1', label: 'Transfronteiriço' }, { value: '2', label: 'Consumo no Brasil' },
  { value: '3', label: 'Movimento temporário de pessoas físicas' }, { value: '4', label: 'Consumo no exterior' },
];
export const nfseRelationshipOptions = [
  { value: '0', label: 'Sem vínculo com o tomador/prestador' }, { value: '1', label: 'Controlada' },
  { value: '2', label: 'Controladora' }, { value: '3', label: 'Coligada' }, { value: '4', label: 'Matriz' },
  { value: '5', label: 'Filial ou sucursal' }, { value: '6', label: 'Outro vínculo' }, { value: '9', label: 'Desconhecido' },
];
