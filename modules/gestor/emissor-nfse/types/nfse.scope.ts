import type { NfseScope } from './nfse.types';

export function getNfseCurrentMonth(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Maceio', year: 'numeric', month: '2-digit',
  }).formatToParts(date);
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}

export function isNfseScopeValid(scope: NfseScope | null | undefined): scope is NfseScope {
  return Boolean(scope
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scope.poloId)
    && typeof scope.contextKey === 'string' && scope.contextKey.trim().length > 0
    && scope.contextKey.length <= 4096
    && (scope.environment === 'HOMOLOGACAO' || scope.environment === 'PRODUCAO')
    && /^\d{4}-(0[1-9]|1[0-2])$/.test(scope.month));
}
