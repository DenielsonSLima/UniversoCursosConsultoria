import type {
  TurmaTecnicoCourseOption,
  TurmaTecnicoFormData,
  TurmaTecnicoIdentity,
  TurmaTecnicoPoloOption,
} from './turma-tecnico-form.types';

export const formatCurrencyBRL = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(value);

const getCourseAcronym = (name: string) => {
  if (name.includes('Enfermagem')) return 'ENF';
  if (name.includes('Radiologia')) return 'RAD';
  return name.substring(0, 4).toUpperCase().replace(/\s/g, '');
};

export const buildTurmaTecnicoIdentity = (
  formData: TurmaTecnicoFormData,
  curso?: TurmaTecnicoCourseOption,
  polo?: TurmaTecnicoPoloOption,
): TurmaTecnicoIdentity => {
  if (!curso || !polo || !formData.dataInicio || !formData.turno) {
    return { nome: '', codigo: '' };
  }

  const [year, month] = formData.dataInicio.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return { nome: '', codigo: '' };
  }

  const semester = month <= 6 ? 1 : 2;
  const courseAcronym = getCourseAcronym(curso.nome);
  const poloAcronym = polo.cidade.substring(0, 3).toUpperCase();
  const shiftAcronym = formData.turno.substring(0, 3).toUpperCase();
  const shiftLabel = formData.turno.charAt(0) + formData.turno.slice(1).toLowerCase();

  return {
    codigo: `${year}.${semester}-${courseAcronym}-${shiftAcronym}-${poloAcronym}`,
    nome: `${curso.nome} - ${shiftLabel} - ${polo.cidade} - ${year}.${semester}`,
  };
};

export const getFriendlyTechnicalClassSubmitError = (error: unknown) => {
  const message = error instanceof Error
    ? error.message.trim()
    : String((error as { message?: unknown } | null)?.message || '').trim();
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('row-level security') || lowerMessage.includes('sem permissão')) {
    return 'Seu usuário não tem permissão para criar turma neste polo. Verifique o polo ativo ou o escopo do gestor.';
  }
  if (lowerMessage.includes('duplicate key') || lowerMessage.includes('turmas_codigo_key')) {
    return 'Já existe uma turma com este código. Altere curso, turno, polo ou data de início para gerar outro código.';
  }
  if (lowerMessage.includes('turmas_turno_check') || (lowerMessage.includes('check constraint') && lowerMessage.includes('turno'))) {
    return 'O turno selecionado não está aceito no banco. A migration de turnos precisa estar aplicada.';
  }
  if (lowerMessage.includes('regra financeira') || lowerMessage.includes('campo financeiro')) {
    return message || 'A regra financeira não foi aceita. Revise valores, parcelas, encargos e instrução do boleto.';
  }
  return message || 'Não foi possível criar a turma. Verifique os dados e tente novamente.';
};
