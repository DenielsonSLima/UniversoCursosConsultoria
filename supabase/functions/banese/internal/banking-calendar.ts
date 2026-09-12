// Verified national banking calendar for 2026 only (including weekends).
// CMN 4.880/2020 art. 6; FEBRABAN's thirteen published dates:
// https://portal.febraban.org.br/noticia/4413/pt-br/
// https://portal.febraban.org.br/noticia/4494/pt-br/
// No local holidays, optional public-service holidays or unverified years.
const HOLIDAYS_2026 = new Set([
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03",
  "2026-04-21", "2026-05-01", "2026-06-04", "2026-09-07",
  "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25",
]);

const dateValue = (iso: string) => {
  const date = new Date(`${iso}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== iso) throw new Error("Data bancária inválida.");
  return date;
};

export const nextNationalBankingDay = (iso: string): string | null => {
  let date = dateValue(iso);
  for (let offset = 0; offset < 10; offset++) {
    // Absence of a verified calendar never grants a grace period.
    if (date.getUTCFullYear() !== 2026) return null;
    const day = date.toISOString().slice(0, 10);
    if (![0, 6].includes(date.getUTCDay()) && !HOLIDAYS_2026.has(day)) return day;
    date = new Date(date.getTime() + 86_400_000);
  }
  return null;
};
