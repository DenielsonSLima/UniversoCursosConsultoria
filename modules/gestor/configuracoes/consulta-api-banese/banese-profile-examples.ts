import type { BanesePollingProfile } from './consulta-api-banese.types';

const formatElapsed = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
};

export const estimateProfileTime = (titles: number, titlesPerMinute: number) =>
  formatElapsed(Math.ceil(Math.max(0, titles) / Math.max(1, titlesPerMinute)));

export const profileOperationalExample = (
  profile?: BanesePollingProfile,
  queuedTitles = 20,
) => {
  if (!profile) return 'Perfil ainda não carregado.';
  const rate = profile.titles_per_minute;
  return `Até ${rate} título${rate === 1 ? '' : 's'}/min, equivalente a ${rate * 5} a cada 5 min e ${profile.estimated_requests_per_minute} GETs/min. ${queuedTitles.toLocaleString('pt-BR')} títulos prontos: cerca de ${estimateProfileTime(queuedTitles, rate)}.`;
};

export const profileScaleExample = (profile: BanesePollingProfile) =>
  `Exemplo teórico: 20 títulos em ~${estimateProfileTime(20, profile.titles_per_minute)}; 400 alunos × 12 títulos (4.800) em ~${estimateProfileTime(4_800, profile.titles_per_minute)}.`;
