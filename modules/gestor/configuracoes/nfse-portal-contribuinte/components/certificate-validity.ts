const DAY_MS = 24 * 60 * 60 * 1000;
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Display only server-derived metadata, with an explicit time zone and expiry instant. */
export function certificateValidity(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt || !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(expiresAt)) return null;
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || !Number.isFinite(now)) return null;
  const parts = Object.fromEntries(dateFormat.formatToParts(expiry).map(({ type, value }) => [type, value]));
  const remaining = expiry - now;
  return {
    dateTime: new Date(expiry).toISOString(),
    label: `${parts.day}/${parts.month}/${parts.year} às ${parts.hour}:${parts.minute} (horário de Brasília)`,
    warning: remaining <= 0
      ? 'Certificado vencido. Cadastre um certificado válido.'
      : remaining <= 30 * DAY_MS
        ? 'O certificado vence nos próximos 30 dias. Providencie a renovação.'
        : null,
  };
}
