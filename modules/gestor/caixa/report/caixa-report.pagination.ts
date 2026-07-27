import type {
  CaixaReportExpense,
  CaixaReportReceipt,
} from './caixa-report.types';

export type CaixaReportSection = 'RESUMO' | 'RECEBIMENTOS' | 'DESPESAS';

export interface CaixaReportPage {
  key: string;
  section: CaixaReportSection;
  sectionPage: number;
  rows: CaixaReportReceipt[] | CaixaReportExpense[];
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

  return pages;
};
