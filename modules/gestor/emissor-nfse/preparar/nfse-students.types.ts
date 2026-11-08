import type { NfseMoney } from '../types/nfse.types';

export interface NfseStudentOption {
  value: string;
  label: string;
}

export interface NfseStudentRow {
  id: string;
  studentName: string;
  receivedAmount: NfseMoney;
}

export interface NfseStudentGroup {
  id: string;
  label: string;
  studentCount: number;
  receivedAmount: NfseMoney;
  students: NfseStudentRow[];
}
