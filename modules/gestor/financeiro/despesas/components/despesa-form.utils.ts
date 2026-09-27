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

export const formatCurrencyInput = (value: string) => {
  const parsed = parseCurrencyInput(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return parsed.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatCurrencyTyping = (value: string, previousValue: string) => {
  const cleaned = value.replace(/[^\d,.]/g, '');
  if (!cleaned) return '';
  const previousInteger = previousValue.split(',')[0].replace(/\D/g, '');
  if (previousValue.endsWith(',00')) {
    const appended = value.startsWith(previousValue)
      ? value.slice(previousValue.length).replace(/\D/g, '')
      : '';
    if (appended) return formatCurrencyInput(`${previousInteger}${appended}`);
    if (value === previousValue.slice(0, -1)) {
      return formatCurrencyInput(previousInteger.slice(0, -1));
    }
  }
  return formatCurrencyInput(cleaned);
};

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
