import { Curso } from '../cadastros.types';

// Configurações dinâmicas de estilo e texto por modalidade
export const getModalidadeConfig = (modalidade: Curso['modalidade']) => {
  switch (modalidade) {
    case 'TECNICO':
      return {
        themeColor: 'emerald',
        textColor: 'text-emerald-600',
        bgColor: 'bg-emerald-50/50',
        borderColor: 'border-emerald-200',
        hoverBorderColor: 'hover:border-emerald-400',
        hoverBgColor: 'hover:bg-emerald-50',
        labelDisciplina: 'Disciplina',
        labelAula: 'Aula/Conteúdo',
        labelSave: 'Salvar Grade'
      };
    case 'LIVRE':
      return {
        themeColor: 'amber',
        textColor: 'text-amber-600',
        bgColor: 'bg-amber-50/50',
        borderColor: 'border-amber-200',
        hoverBorderColor: 'hover:border-amber-400',
        hoverBgColor: 'hover:bg-amber-50',
        labelDisciplina: 'Tópico',
        labelAula: 'Aula/Atividade',
        labelSave: 'Salvar Conteúdo'
      };
    case 'ESPECIALIZACAO':
      return {
        themeColor: 'rose',
        textColor: 'text-rose-600',
        bgColor: 'bg-rose-50/50',
        borderColor: 'border-rose-200',
        hoverBorderColor: 'hover:border-rose-400',
        hoverBgColor: 'hover:bg-rose-50',
        labelDisciplina: 'Disciplina',
        labelAula: 'Aula/Conteúdo',
        labelSave: 'Salvar Especialização'
      };
    case 'EAD':
      return {
        themeColor: 'purple',
        textColor: 'text-purple-600',
        bgColor: 'bg-purple-50/50',
        borderColor: 'border-purple-200',
        hoverBorderColor: 'hover:border-purple-400',
        hoverBgColor: 'hover:bg-purple-50',
        labelDisciplina: 'Disciplina',
        labelAula: 'Aula/Módulo',
        labelSave: 'Salvar Grade EAD'
      };
    case 'SUPERIOR':
      return {
        themeColor: 'blue',
        textColor: 'text-blue-800',
        bgColor: 'bg-blue-50/50',
        borderColor: 'border-blue-200',
        hoverBorderColor: 'hover:border-blue-400',
        hoverBgColor: 'hover:bg-blue-50',
        labelDisciplina: 'Disciplina',
        labelAula: 'Aula/Conteúdo',
        labelSave: 'Salvar Grade'
      };
    default:
      return {
        themeColor: 'slate',
        textColor: 'text-slate-600',
        bgColor: 'bg-slate-50/50',
        borderColor: 'border-slate-200',
        hoverBorderColor: 'hover:border-slate-400',
        hoverBgColor: 'hover:bg-slate-50',
        labelDisciplina: 'Disciplina',
        labelAula: 'Aula',
        labelSave: 'Salvar'
      };
  }
};

// Helper para analisar e converter preços em formato brasileiro (BRL) para float
export const parseBRLPrice = (valStr: string): number | null => {
  const clean = valStr.trim();
  if (clean === '') return null;

  // Se tiver tanto ponto quanto vírgula (ex: 1.250,50 ou 1,250.50)
  if (clean.includes('.') && clean.includes(',')) {
    if (clean.indexOf('.') < clean.indexOf(',')) {
      return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
    } else {
      return parseFloat(clean.replace(/,/g, ''));
    }
  }

  // Se tiver apenas vírgula (ex: 299,90)
  if (clean.includes(',')) {
    return parseFloat(clean.replace(',', '.'));
  }

  // Se tiver apenas ponto
  if (clean.includes('.')) {
    const parts = clean.split('.');
    const lastPart = parts[parts.length - 1];
    if (lastPart.length === 2 || lastPart.length === 1) {
      return parseFloat(clean);
    } else if (lastPart.length === 3) {
      return parseFloat(clean.replace(/\./g, ''));
    }
    return parseFloat(clean);
  }

  // Apenas números (ex: 299)
  return parseFloat(clean);
};

export const formatMoney = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

export const moneyInputValue = (value: number) => value.toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export const parseMoneyInput = (value: string, fallback: number) => {
  const parsed = parseBRLPrice(value);
  return parsed !== null && !Number.isNaN(parsed) ? parsed : fallback;
};
