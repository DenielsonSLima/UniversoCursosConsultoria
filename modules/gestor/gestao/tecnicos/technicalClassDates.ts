import { StatusTurma } from '../gestao.types';

export const getMaceioIsoDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Maceio',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const getInitialTechnicalStatus = (input: {
  permitirInscricoesOnline: boolean;
  dataInicioInscricao: string;
  dataFimInscricao: string;
}): StatusTurma => {
  const today = getMaceioIsoDate();
  const registrationStarted = !input.dataInicioInscricao || input.dataInicioInscricao <= today;
  const registrationStillOpen = !input.dataFimInscricao || input.dataFimInscricao >= today;
  return input.permitirInscricoesOnline && registrationStarted && registrationStillOpen
    ? 'INSCRICOES_ABERTAS'
    : 'PLANEJADA';
};
