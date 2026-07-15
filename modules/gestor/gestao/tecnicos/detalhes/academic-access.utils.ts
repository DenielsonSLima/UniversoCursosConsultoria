export type AcademicPeriodStatus = 'PLANEJADO' | 'ABERTO' | 'EM_FECHAMENTO' | 'FECHADO';

const normalizeStatus = (value?: string | null) => String(value || '').trim().toUpperCase();

export const isAcademicContextEditable = (
  turmaStatus?: string | null,
  periodoStatus?: string | null,
) => normalizeStatus(turmaStatus) === 'EM_ANDAMENTO'
  && ['ABERTO', 'EM_FECHAMENTO'].includes(normalizeStatus(periodoStatus));

export const getAcademicReadOnlyContent = (
  turmaStatus?: string | null,
  periodoStatus?: string | null,
) => {
  const turma = normalizeStatus(turmaStatus);
  const periodo = normalizeStatus(periodoStatus);

  if (turma === 'FINALIZADA') {
    return {
      label: 'Turma encerrada',
      message: 'Esta turma foi encerrada. Os registros acadêmicos estão disponíveis apenas para consulta.',
    };
  }
  if (turma !== 'EM_ANDAMENTO') {
    return {
      label: 'Aguardando início',
      message: 'A turma ainda não está em andamento. Os lançamentos serão liberados pela coordenação quando o ciclo acadêmico começar.',
    };
  }
  if (periodo === 'PLANEJADO') {
    return {
      label: 'Período planejado',
      message: 'Este período ainda não começou. O diário está disponível apenas para consulta até a coordenação abrir o período.',
    };
  }
  if (periodo === 'FECHADO') {
    return {
      label: 'Período fechado',
      message: 'Este período foi fechado. Os lançamentos ficam bloqueados até a coordenação reabri-lo com justificativa.',
    };
  }
  return {
    label: 'Lançamentos bloqueados',
    message: 'Não foi possível confirmar uma etapa acadêmica aberta. Os registros ficaram bloqueados por segurança.',
  };
};
