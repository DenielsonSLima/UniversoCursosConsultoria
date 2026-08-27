import type React from 'react';

export type FinancialReportTone = 'emerald' | 'rose' | 'blue' | 'slate' | 'amber';

export interface FinancialReportColumn {
  label: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface FinancialReportRow {
  id: string;
  cells: React.ReactNode[];
  className?: string;
}

export interface FinancialReportSummaryCard {
  label: string;
  value: React.ReactNode;
  tone?: FinancialReportTone;
}

export interface FinancialReportFilter {
  label: string;
  value: React.ReactNode;
}

export interface FinancialReportPdfInput {
  title: string;
  subtitle?: string;
  rightTitle?: string;
  rightType?: string;
  documentSection?: string;
  documentSubject?: string;
  documentKeywords?: string;
  fileName: string;
  columns: FinancialReportColumn[];
  rows: FinancialReportRow[];
  summaryCards?: FinancialReportSummaryCard[];
  filters?: FinancialReportFilter[];
  footerNote?: string;
  recordLabel?: string;
  polo?: object | null;
  company?: object | null;
  tone?: FinancialReportTone;
  issuedAt?: Date;
}

export interface NormalizedFinancialReportRow {
  id: string;
  cells: string[];
}

export interface FinancialReportPage {
  rows: NormalizedFinancialReportRow[];
  firstRecordIndex: number;
}
