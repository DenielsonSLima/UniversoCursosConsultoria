import type { NfseEnvironment } from '../../types/nfse.types';

export interface NfseReceiptScope {
  contextId: string;
  poloId: string;
  paymentMonth: string;
  /** Optional only for legacy read-only consumers during deployment. */
  environment?: NfseEnvironment;
}

export interface NfseReceiptFilters {
  courseType: string;
  classId: string;
  search: string;
  page: number;
}

export interface NfseReceiptStudent {
  id: string;
  studentId: string;
  studentName: string;
  studentCpf: string | null;
  studentCity: string | null;
  studentState: string | null;
  receivedAmount: string;
  receiptCount: number;
}

export interface NfseReceiptGroup {
  id: string;
  label: string;
  studentCount: number;
  receivedAmount: string;
  students: NfseReceiptStudent[];
}

export interface NfseReceiptSelection {
  ids: string[];
  selectedCount: number;
  selectedAmount: string | null;
  valid: boolean;
  unavailableIds: string[];
  groups: NfseReceiptGroup[];
}

export interface NfseReceiptResponse {
  courseTypes: { id: string; label: string }[];
  classes: { id: string; label: string }[];
  groups: NfseReceiptGroup[];
  page: number;
  pageSize: number;
  totalGroups: number;
  totalStudents: number;
  excludedUnknownCount: number;
  selection: NfseReceiptSelection;
}

export const NFSE_STUDENT_PAGE_SIZE = 10;
export const NFSE_STUDENT_SELECTION_LIMIT = 1000;
export const defaultNfseReceiptFilters = (): NfseReceiptFilters => ({
  courseType: 'TECNICO', classId: '', search: '', page: 1,
});

