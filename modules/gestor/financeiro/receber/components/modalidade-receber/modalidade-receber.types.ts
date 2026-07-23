import type { ReactNode } from 'react';
import type {
  ContasReceber,
  ReceivablesGroupMode,
  ReceivablesStatusScope,
} from '../../../financeiro.service';

export type ViewMode = 'table' | 'cards';
export type GroupMode = ReceivablesGroupMode;
export type StatusScope = ReceivablesStatusScope;
export type CourseModality = 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO';

export interface ModalidadeReceberTabProps {
  poloId?: string | null;
  modality: CourseModality;
  title: string;
  description: string;
  icon: ReactNode;
  accentLabel: string;
}

export interface ReceivableStatusCounts {
  pending: number;
  received: number;
  canceled: number;
  all: number;
}

export interface ReceivableKpis {
  total: number;
  recebido: number;
  aReceber: number;
  vencidos: number;
}

export interface GroupItemsState {
  rows: ContasReceber[];
  isLoading: boolean;
}
