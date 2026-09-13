import type { ProescConsoleFilters } from './consulta-api-proesc.types';

export function proescConsolePeriod(
  from: string,
  to: string,
): Pick<ProescConsoleFilters, 'startedFrom' | 'startedTo'> {
  const toIso = (value: string): string | null => {
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw new Error('Informe datas válidas para filtrar o período.');
    }
    return date.toISOString();
  };
  return { startedFrom: toIso(from), startedTo: toIso(to) };
}

export function proescConsoleErrorMessage(code?: string): string {
  if (code === '42501') return 'Seu acesso não permite consultar este acompanhamento ou polo.';
  if (code === '22023') return 'Escolha um período válido de até 31 dias.';
  return 'Não foi possível carregar o acompanhamento Proesc. Tente novamente.';
}
