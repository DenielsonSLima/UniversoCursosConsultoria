import React from 'react';
import type { NfseEnvironment } from '../types/nfse.types';
import { NfseAccessError } from '../services/nfse.errors';

interface QueryObservation {
  error: unknown;
  isPending: boolean;
  isFetching: boolean;
}

interface Props {
  environment: NfseEnvironment;
  enabled: boolean;
  workspace: QueryObservation;
  queue: QueryObservation;
}

/** These queries observe internal reads only, not the national fiscal provider. */
export function describeNfseEnvironmentStatus({ enabled, workspace, queue }: Omit<Props, 'environment'>) {
  const unknown = (message: string) => ({ state: 'unknown' as const, message });
  if (!enabled) return unknown('Selecione uma unidade e um mês válidos para verificar as consultas do emissor.');
  const queries = [workspace, queue];
  const failure = queries.some(query => query.error && !(query.error instanceof NfseAccessError)
    && !(query.error instanceof Error && query.error.name === 'AbortError') && !query.isFetching);
  if (failure) return { state: 'error' as const,
    message: 'Falha na última consulta do emissor. Isso não confirma indisponibilidade do serviço fiscal nacional.' };
  if (queries.some(query => query.error instanceof NfseAccessError)) {
    return unknown('Acesso às consultas não confirmado. Isso não indica indisponibilidade do serviço fiscal nacional.');
  }
  if (queries.some(query => query.isPending || query.isFetching)) {
    return unknown('Verificando as consultas do emissor. Disponibilidade do serviço fiscal nacional não verificada.');
  }
  // Successful reads, readiness and old rejected notes are not provider health checks.
  return unknown('Disponibilidade do serviço fiscal nacional não verificada. Não há monitoramento de saúde integrado para este ambiente.');
}

export default function NfseEnvironmentStatus(props: Props) {
  const label = props.environment === 'PRODUCAO' ? 'Produção' : 'Homologação';
  const status = describeNfseEnvironmentStatus(props);
  const description = `${label}: ${status.message} O ambiente é alterado nas configurações fiscais.`;
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600"
      role="status" aria-label={description} title={description} data-nfse-health={status.state}>
      <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" className="shrink-0">
        <circle cx="4" cy="4" r="4" fill={status.state === 'error' ? '#dc2626' : '#94a3b8'} />
      </svg>
      {label}
    </span>
  );
}
