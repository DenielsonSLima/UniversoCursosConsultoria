export const isPortalScheduleBlocked = (restriction: any): boolean => {
  if (!restriction || !restriction.ativo) return false;

  const now = new Date();
  const currentDay = now.getDay();
  if (!restriction.dias.includes(currentDay)) return true;

  const currentHour = now.getHours().toString().padStart(2, '0');
  const currentMinute = now.getMinutes().toString().padStart(2, '0');
  const currentTime = `${currentHour}:${currentMinute}`;

  if (restriction.horario_inicio && currentTime < restriction.horario_inicio) return true;
  if (restriction.horario_fim && currentTime > restriction.horario_fim) return true;

  return false;
};
