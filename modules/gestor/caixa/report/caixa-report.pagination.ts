import type {
  CaixaReportExpense,
  CaixaReportReceipt,
  CaixaReportRecurringClass,
} from './caixa-report.types';

export type CaixaReportSection =
  | 'RESUMO'
  | 'RECEBIMENTOS'
  | 'DESPESAS'
  | 'CARTEIRA_RECORRENTE';

export interface CaixaReportPage {
  key: string;
  section: CaixaReportSection;
  sectionPage: number;
  rows: CaixaReportReceipt[] | CaixaReportExpense[] | CaixaReportRecurringClass[];
}

const chunk = <T,>(items: T[], size: number): T[][] => {
  if (items.length === 0) return [[]];
  const pages: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    pages.push(items.slice(offset, offset + size));
  }
  return pages;
};

export const buildCaixaReportPages = (
  receipts: CaixaReportReceipt[],
  expenses: CaixaReportExpense[],
  recurringClasses: CaixaReportRecurringClass[],
): CaixaReportPage[] => {
  const pages: CaixaReportPage[] = [{
    key: 'summary',
    section: 'RESUMO',
    sectionPage: 1,
    rows: [],
  }];

  chunk(receipts, 5).forEach((rows, index) => {
    pages.push({
      key: `receipts-${index + 1}`,
      section: 'RECEBIMENTOS',
      sectionPage: index + 1,
      rows,
    });
  });

  chunk(expenses, 5).forEach((rows, index) => {
    pages.push({
      key: `expenses-${index + 1}`,
      section: 'DESPESAS',
      sectionPage: index + 1,
      rows,
    });
  });

  chunk(recurringClasses, 8).forEach((rows, index) => {
    pages.push({
      key: `recurring-analysis-${index + 1}`,
      section: 'CARTEIRA_RECORRENTE',
      sectionPage: index + 1,
      rows,
    });
  });

  return pages;
};
