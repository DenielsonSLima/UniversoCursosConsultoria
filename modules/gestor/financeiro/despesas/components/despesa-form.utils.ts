import type { DespesaRateioInput } from '../despesas.service';

export type LancamentoMode = 'pendente' | 'parcelado' | 'baixa';
export type IntervaloUnit = 'dias' | 'semanas' | 'meses';
export type TurmaModalidade = 'EAD' | 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO';
export type RateioSelection = 'DESLIGADO' | DespesaRateioInput['modo'];

export interface RateioPolo {
  id: string;
  nome: string;
  is_matriz?: boolean;
}

export const turmaModalidadeOptions: { value: TurmaModalidade; label: string }[] = [
  { value: 'EAD', label: 'EAD' },
  { value: 'TECNICO', label: 'Técnico' },
  { value: 'LIVRE', label: 'Livres' },
  { value: 'ESPECIALIZACAO', label: 'Especialização' },
];

export const getTurmaModalidade = (turma: any) => {
  const curso = Array.isArray(turma?.cursos) ? turma.cursos[0] : turma?.cursos;
  return String(curso?.modalidade || turma?.modalidade || '').toUpperCase();
};

export const parseCurrencyInput = (value: string) => {
  const normalized = value.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(normalized || 0);
};

export {
  formatCurrencyInput,
  sanitizeCurrencyInput as formatCurrencyTyping,
} from '../../../../shared/utils/currency-input.ts';

export const today = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatCompetencia = (value: string) => {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[2]}/${match[1]}`;
};
