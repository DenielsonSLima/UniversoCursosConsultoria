import { nfsePresetReviewRows } from '../additional/nfse-preset-review.presentation';
import type { NfsePresetReviewCatalogs } from '../additional/nfse-preset-review.domains';
import type { NfseValuesCatalogs, NfseValuesContext } from '../services/nfse-model-values.types';

export interface NfseModelReportRow { path: string; label: string; value: string; origin: string }
export interface NfseModelReportSection { title: string; rows: NfseModelReportRow[] }
export interface NfseModelReportCatalogs { fiscal?: NfsePresetReviewCatalogs; values?: NfseValuesCatalogs; profile: NfseValuesContext['profile'] }
const hidden = /password|senha|privatekey|secret|token|certificate|credential|contextkey|authuserid/i;
const rootLabels: Record<string, string> = { peopleOptions: 'Regras da emissão', serviceOptions: 'Parâmetros da prestação', valuesOptions: 'Regras de valores',
  'additionalOptions.people': 'Complementos de pessoas', 'additionalOptions.service': 'Complementos do serviço' };
const extraLabels: Record<string, string> = { version: 'Versão das regras', unitKey: 'Identificador da unidade do imóvel',
  destinationPartnerId: 'Referência do destinatário', intermediaryPartnerId: 'Referência do intermediário',
  providerPartnerLabel: 'Nome do prestador referenciado', destinationPartnerLabel: 'Nome do destinatário referenciado',
  intermediaryPartnerLabel: 'Nome do intermediário referenciado', supplierPartnerId: 'Referência do fornecedor', supplierPartnerLabel: 'Nome do fornecedor referenciado',
  countryLabel: 'Descrição do país', municipalityLabel: 'Descrição do município', exportResultCountryLabel: 'Descrição do país do resultado' };
const origins: Record<string, string> = { FIXED: 'Pré-modelo', AT_ISSUANCE: 'Na emissão', FROM_PARTNER: 'Cadastro na emissão',
  FROM_ESTABLISHMENT: 'Configuração da unidade', RECEIPTS: 'Preparação', PERCENTAGE: 'Regra percentual',
  FROM_RULES: 'Regras fiscais', DOCUMENT: 'Documento na emissão', LINKED_OPERATION_DOCUMENTS: 'Documentos da operação',
  ISSUE_DATE: 'Data da emissão', AUTOMATIC: 'Gerado na emissão', NONE: 'Não aplicar', OMIT: 'Não informar' };

function labelFor(key: string, prefix: string, path: readonly string[], catalogs: NfseModelReportCatalogs): string {
  const custom = extraLabels[key];
  if (custom) return prefix ? `${prefix} · ${custom}` : custom;
  return nfsePresetReviewRows({ [key]: 'Rótulo' }, prefix, path, catalogs.fiscal, catalogs.values, catalogs.profile)[0]?.label
    || (prefix ? `${prefix} · ${key.replace(/([a-z])([A-Z])/g, '$1 $2')}` : key.replace(/([a-z])([A-Z])/g, '$1 $2'));
}
function display(value: unknown, key: string, parent: Record<string, unknown>, path: readonly string[], catalogs: NfseModelReportCatalogs): string {
  if (value === null || value === undefined || value === '') return parent.source === 'AT_ISSUANCE' ? 'A definir na emissão' : 'Sem valor definido';
  if (Array.isArray(value) && !value.length) return 'Nenhum item configurado';
  if (typeof value === 'object') return 'Grupo sem campos preenchidos';
  if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return value;
  const result = nfsePresetReviewRows({ [key]: value }, '', path, catalogs.fiscal, catalogs.values, catalogs.profile)[0]?.value;
  if (key === 'value' && parent.source === 'PERCENTAGE') return `${String(value).replace('.', ',')}%`;
  if (key === 'value' && parent.source === 'FIXED' && parent.base === null || key === 'fixedAmount') {
    const money = String(value);
    if (/^\d+(?:\.\d{1,2})?$/.test(money)) {
      const [whole, fraction = ''] = money.split('.');
      return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction.padEnd(2, '0')}`;
    }
  }
  return result || (typeof value === 'boolean' ? value ? 'Sim' : 'Não' : String(value));
}

/** Includes absent fields and empty lists; preserves every persisted leaf without presenting raw JSON. */
export function modelReportRows(value: unknown, root: string, catalogs: NfseModelReportCatalogs,
  prefix = '', inheritedOrigin = 'Pré-modelo'): NfseModelReportRow[] {
  const rows: NfseModelReportRow[] = [];
  function visit(current: unknown, path: string[], label: string, origin: string, parent: Record<string, unknown>, key: string) {
    if (Array.isArray(current) && current.length) {
      current.forEach((item, index) => visit(item, [...path, String(index)], `${label} · Item ${index + 1}`, origin, {}, ''));
      return;
    }
    if (current && typeof current === 'object' && !Array.isArray(current) && Object.keys(current).length) {
      const record = current as Record<string, unknown>;
      const nestedOrigin = typeof record.source === 'string' ? origins[record.source] || origin : origin;
      Object.entries(record).forEach(([child, entry]) => {
        if (!hidden.test(child)) visit(entry, [...path, child], labelFor(child, label, path, catalogs), nestedOrigin, record, child);
      });
      return;
    }
    const actualOrigin = /Label$/.test(key) ? (/country|municipality/i.test(key) ? 'Catálogo' : 'Cadastro referenciado')
      : typeof current === 'string' && origins[current] ? origins[current] : origin;
    rows.push({ path: path.join('.'), label: label || rootLabels[root] || root, value: display(current, key, parent, path.slice(0, -1), catalogs), origin: actualOrigin });
  }
  visit(value, [root], prefix, inheritedOrigin, {}, root);
  return rows;
}
