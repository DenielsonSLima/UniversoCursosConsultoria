/** Description reference only. Never supplies competence or serviceDate. */
export const NFSE_SERVICE_PERIOD_TOKEN = '{{periodo}}';

export function isNfseServicePeriodDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function nfseServicePeriod(start: string, end: string) {
  if (!isNfseServicePeriodDate(start) || !isNfseServicePeriodDate(end)) {
    return { valid: false, label: '', error: 'Selecione a data inicial e a data final do período do serviço.' };
  }
  if (end < start) return { valid: false, label: '', error: 'A data final do período não pode ser anterior à data inicial.' };
  const display = (date: string) => date.split('-').reverse().join('/');
  return { valid: true, label: `${display(start)} ATÉ ${display(end)}`, error: '' };
}

/** Local presentation; the save RPC independently validates and expands the template. */
export function nfseServicePeriodPreview(template: string, start: string, end: string) {
  const period = nfseServicePeriod(start, end);
  const requiresPeriod = template.includes(NFSE_SERVICE_PERIOD_TOKEN);
  const text = requiresPeriod && period.valid ? template.split(NFSE_SERVICE_PERIOD_TOKEN).join(period.label) : template;
  const unknownVariables = /\{\{|\}\}/.test(template.split(NFSE_SERVICE_PERIOD_TOKEN).join(''));
  return { ...period, text, requiresPeriod, unknownVariables, tooLong: [...text].length > 2000 };
}
