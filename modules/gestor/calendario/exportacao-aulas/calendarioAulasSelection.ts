import type {
  CalendarioAulasTurmaModulo,
  PrepararCalendarioAulasExportacaoInput,
} from './types';

export interface CalendarioAulasSelection {
  modoExportacao: 'MODULO_COMPLETO' | 'CRONOLOGICO';
  moduloId: string;
  todosModulos: boolean;
  moduloIds: string[];
  definirPeriodo: boolean;
  dataInicio: string;
  dataFim: string;
}

export const createCalendarioAulasSelection = (): CalendarioAulasSelection => ({
  modoExportacao: 'MODULO_COMPLETO',
  moduloId: '',
  todosModulos: true,
  moduloIds: [],
  definirPeriodo: false,
  dataInicio: '',
  dataFim: '',
});

const isDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const getCalendarioAulasSelectionError = (
  selection: CalendarioAulasSelection,
  modulos: CalendarioAulasTurmaModulo[],
): string | null => {
  const allowed = new Set(modulos.map((modulo) => modulo.moduloId));
  if (selection.modoExportacao === 'MODULO_COMPLETO') {
    return allowed.has(selection.moduloId) ? null : 'Selecione um módulo disponível da turma.';
  }
  if (!allowed.size) return 'Esta turma ainda não possui módulos disponíveis.';
  if (!selection.todosModulos && (!selection.moduloIds.length
    || selection.moduloIds.some((id) => !allowed.has(id)))) {
    return 'Selecione pelo menos um módulo disponível da turma.';
  }
  if (!selection.definirPeriodo) return null;
  if (!isDate(selection.dataInicio) || !isDate(selection.dataFim)) {
    return 'Informe as datas inicial e final do período.';
  }
  return selection.dataInicio <= selection.dataFim ? null : 'A data final deve ser igual ou posterior à data inicial.';
};

const formatDate = (value: string) => value.split('-').reverse().join('/');

export const getCalendarioAulasScope = (
  selection: CalendarioAulasSelection,
  modulos: CalendarioAulasTurmaModulo[],
) => {
  if (selection.modoExportacao === 'MODULO_COMPLETO') {
    return modulos.find((modulo) => modulo.moduloId === selection.moduloId)?.moduloNome || 'Módulo completo';
  }
  const modules = selection.todosModulos ? 'Todos os módulos disponíveis'
    : `${selection.moduloIds.length} módulo(s) selecionado(s)`;
  const period = selection.definirPeriodo
    ? selection.dataInicio && selection.dataFim
      ? `${formatDate(selection.dataInicio)} a ${formatDate(selection.dataFim)}` : 'Defina o período'
    : 'Todas as aulas programadas';
  return `${modules} · ${period}`;
};

/** Traduz a intenção da tela; seleção e ordenação das aulas pertencem à RPC. */
export const applyCalendarioAulasSelection = (
  input: PrepararCalendarioAulasExportacaoInput,
  selection: CalendarioAulasSelection,
): PrepararCalendarioAulasExportacaoInput => {
  const { poloId, modalidade, turmaId, mesReferencia } = input;
  const base = { poloId, modalidade, turmaId, mesReferencia };
  if (input.modalidade !== 'TECNICO') return { ...base, moduloId: null };
  if (selection.modoExportacao === 'MODULO_COMPLETO') {
    return { ...base, modoExportacao: 'MODULO_COMPLETO', moduloId: selection.moduloId };
  }
  return {
    ...base,
    modoExportacao: 'CRONOLOGICO',
    moduloId: null,
    moduloIds: selection.todosModulos ? null : [...selection.moduloIds],
    dataInicio: selection.definirPeriodo ? selection.dataInicio : null,
    dataFim: selection.definirPeriodo ? selection.dataFim : null,
  };
};
