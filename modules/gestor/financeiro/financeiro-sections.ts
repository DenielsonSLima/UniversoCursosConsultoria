import type { FinanceiroTabId } from '../access-control';

export type FinancialSectionId = FinanceiroTabId | 'renegociacoes';
export const FINANCIAL_SECTION_PARAM = 'financeiroSecao';
const sectionIds: readonly FinancialSectionId[] = [
  'resumo',
  'receber',
  'renegociacoes',
  'despesas',
  'emprestimos',
  'convenios',
  'transferencias',
  'conciliacao-bancaria',
  'outros-debitos',
  'outros-creditos',
];

export function readFinancialSection(search: string): FinancialSectionId | null {
  const value = new URLSearchParams(search).get(FINANCIAL_SECTION_PARAM);
  return sectionIds.includes(value as FinancialSectionId) ? (value as FinancialSectionId) : null;
}

export function canOpenFinancialSection(section: FinancialSectionId, allowed?: readonly FinanceiroTabId[]) {
  // This proposal-only workspace uses the same server permission as A Receber.
  // Approval and bank activation are not granted by this navigation capability.
  return !allowed || allowed.includes(section === 'renegociacoes' ? 'receber' : section);
}

export function financialSectionSearch(search: string, section: FinancialSectionId | null) {
  const params = new URLSearchParams(search);
  if (section) params.set(FINANCIAL_SECTION_PARAM, section);
  else params.delete(FINANCIAL_SECTION_PARAM);
  const value = params.toString();
  return value ? `?${value}` : '';
}

export function initialGestorFinancialModule() {
  return readFinancialSection(window.location.search) ? 'financeiro' : 'inicio';
}

export function leaveFinancialSection(moduleId: string) {
  if (moduleId !== 'financeiro' && readFinancialSection(window.location.search)) {
    const url = new URL(window.location.href);
    url.search = financialSectionSearch(url.search, null);
    window.history.replaceState(window.history.state, '', url);
  }
  return moduleId;
}
