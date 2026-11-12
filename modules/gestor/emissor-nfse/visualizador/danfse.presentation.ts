import { type DanfseDocument, dpsValue, xmlValue } from './danfse.types';

export const shown = (value?: string | null) => value?.trim() || '-';
export const joined = (values: string[], separator = ' / ') => values.map(shown).join(separator);

/** Decimal strings are formatted without floating point, rounding, sums or tax calculations. */
export function danfseMoney(value: string): string {
  if (!value) return '-';
  if (!/^\d{1,18}(?:\.\d{1,4})?$/.test(value)) throw new Error('Valor monetário inválido.');
  const [whole, fraction = ''] = value.split('.');
  return `R$ ${whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction.padEnd(2, '0')}`;
}

export function danfsePercent(value: string): string {
  if (!value) return '-';
  if (!/^\d{1,3}(?:\.\d{1,4})?$/.test(value)) throw new Error('Alíquota inválida.');
  return `${value.replace('.', ',')}%`;
}

export function danfseDate(value: string): string {
  if (!value) return '-';
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2})))?$/.exec(value);
  if (!match) throw new Error('Data inválida no XML.');
  const calendar = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  if (Number.isNaN(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== value.slice(0, 10)
    || match[1] === '0000' || (match[4] && (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59))
    || (match[7] && (Number(match[7]) > 14 || Number(match[8]) > 59 || (match[7] === '14' && match[8] !== '00')))) {
    throw new Error('Data inválida no XML.');
  }
  return `${match[3]}/${match[2]}/${match[1]}${match[4] ? ` ${match[4]}:${match[5]}:${match[6]}` : ''}`;
}

export function danfseDocumentNumber(value: string): string {
  if (/^\d{14}$/.test(value)) return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (/^\d{11}$/.test(value)) return value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return shown(value);
}

export function danfsePhone(value: string): string {
  if (/^\d{10,11}$/.test(value)) return value.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');
  return shown(value);
}

export const danfseCep = (value: string) => /^\d{8}$/.test(value) ? value.replace(/^(\d{2})(\d{3})(\d{3})$/, '$1.$2-$3') : shown(value);
export const codeLabel = (value: string, labels: Record<string, string>) => labels[value] ?? shown(value);

// IBGE prefixes identify states; XML names take priority over official catalog labels.
const UF_BY_PREFIX: Record<string, string> = {
  11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
  21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
  31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS',
  50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF',
};
export const stateFromMunicipality = (code: string) => /^\d{7}$/.test(code) ? UF_BY_PREFIX[code.slice(0, 2)] ?? '' : '';

export function municipalityName(document: DanfseDocument, code: string): string {
  if (!code) return '';
  for (const [codePath, namePath] of [
    ['emit/enderNac/cMun', 'xLocEmi'], ['cLocIncid', 'xLocIncid'],
    ['DPS/infDPS/serv/locPrest/cLocPrestacao', 'xLocPrestacao'],
    ['IBSCBS/cLocalidadeIncid', 'IBSCBS/xLocalidadeIncid'],
  ]) if (xmlValue(document, codePath) === code && xmlValue(document, namePath)) return xmlValue(document, namePath);
  return document.municipalityNames?.[code] || code;
}

export function danfseComplements(document: DanfseDocument): string {
  const parts = [
    ['Inf. Cont.', dpsValue(document, 'serv/infoCompl/xInfComp')],
    ['NFS-e Subst.', dpsValue(document, 'subst/chSubstda')],
    ['Doc. Ref.', dpsValue(document, 'serv/infoCompl/docRef')],
    ['Cod. Obra', dpsValue(document, 'serv/obra/cObra')],
    ['Insc. Imob.', dpsValue(document, 'IBSCBS/imovel/inscImobFisc')],
    ['Cod. Evt.', dpsValue(document, 'serv/atvEvento/idAtvEvt')],
    ['Doc. Tec.', dpsValue(document, 'serv/infoCompl/idDocTec')],
    ['Núm. Ped.', dpsValue(document, 'serv/infoCompl/xPed')],
    ['Item Ped.', document.fields['DPS/infDPS/serv/infoCompl/gItemPed/xItemPed']?.join(', ') ?? ''],
    ['Inf. A. T. Mun.', xmlValue(document, 'xOutInf')],
  ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join(' | ');
  const simpleNational = dpsValue(document, 'valores/trib/totTrib/pTotTribSN');
  if (simpleNational) return [parts,
    `Valor percentual aproximado do total dos tributos da alíquota do Simples Nacional: ${danfsePercent(simpleNational)}.`,
  ].filter(Boolean).join('\n');
  const approximate = ['Fed', 'Est', 'Mun'].map(suffix => {
    const amount = dpsValue(document, `valores/trib/totTrib/vTotTrib/vTotTrib${suffix}`);
    const percentage = dpsValue(document, `valores/trib/totTrib/pTotTrib/pTotTrib${suffix}`);
    return amount ? danfseMoney(amount) : percentage ? danfsePercent(percentage) : '-';
  });
  return [parts, `Totais aproximados dos Tributos cfe. Lei n° 12.741/2012: Federais: ${approximate[0]}; Estaduais: ${approximate[1]}; Municipais: ${approximate[2]};`].filter(Boolean).join('\n');
}
