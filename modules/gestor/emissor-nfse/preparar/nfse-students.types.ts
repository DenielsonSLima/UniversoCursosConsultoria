import type { NfseMoney } from '../types/nfse.types';

export interface NfseStudentOption {
  value: string;
  label: string;
}

export interface NfseStudentRow {
  id: string;
  studentName: string;
  studentCpf?: string | null;
  studentCity?: string | null;
  studentState?: string | null;
  receivedAmount: NfseMoney;
}

export interface NfseStudentGroup {
  id: string;
  label: string;
  studentCount: number;
  receivedAmount: NfseMoney;
  students: NfseStudentRow[];
}

