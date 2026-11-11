import React, { useEffect, useState } from 'react';
import type { NfseEnvironment } from '../types/nfse.types';
import { NfseAccessError } from '../services/nfse.errors';
import { isNfseHealthFresh, type NfseHealthObservation } from '../health/nfse-health.contract';

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
  health?: { data?: NfseHealthObservation; error: unknown; isFetching: boolean };
}

/** Internal reads and the official read-only consultation have separate evidence. */
export function describeNfseEnvironmentStatus({ enabled, workspace, queue, health }: Omit<Props, 'environment'>, now = Date.now()) {
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
  if (queries.some(query => query.error instanceof Error && query.error.name === 'AbortError')) {
    return unknown('Consulta do emissor interrompida. Aguarde uma nova verificação.');
  }
  if (queries.some(query => query.isPending || query.isFetching)) {
    return unknown('Verificando as consultas do emissor. Disponibilidade do serviço fiscal nacional não verificada.');
  }
  if (health?.data && !health.error && isNfseHealthFresh(health.data, now)) {
    const checked = new Date(health.data.checkedAt).toLocaleTimeString('pt-BR');
    if (health.data.state === 'AVAILABLE') return { state: 'ok' as const,
      message: `Consulta à NFS-e Nacional respondeu corretamente às ${checked}. Isso não garante aprovação de novas notas.` };
    if (health.data.state === 'UNAVAILABLE') return { state: 'error' as const,
      message: `A consulta à NFS-e Nacional apresentou erro técnico às ${checked}.` };
    if (health.data.reason === 'NO_REFERENCE') return unknown('Ainda não há uma nota autorizada de referência para verificar a consulta nacional.');
  }
  // Never promote successful internal reads, stale results or old rejected notes to fiscal health.
  return unknown('Disponibilidade do serviço fiscal nacional não verificada. A consulta precisa de acesso válido e uma resposta recente.');
}

export default function NfseEnvironmentStatus(props: Props) {
  const [clock, setClock] = useState(Date.now);
  const expiresAt = props.health?.data?.expiresAt;
  useEffect(() => {
    const expires = Date.parse(expiresAt || '');
    if (!Number.isFinite(expires) || expires <= Date.now()) return;
    const timer = setTimeout(() => setClock(Date.now()), expires - Date.now() + 1);
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const label = props.environment === 'PRODUCAO' ? 'Produção' : 'Homologação';
  const status = describeNfseEnvironmentStatus(props, Math.max(clock, Date.now()));
  const description = `${label}: ${status.message} O ambiente é alterado nas configurações fiscais.`;
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600"
      role="status" aria-label={description} title={description} data-nfse-health={status.state}>
      <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" className="shrink-0">
        <circle cx="4" cy="4" r="4" fill={status.state === 'error' ? '#dc2626' : status.state === 'ok' ? '#16a34a' : '#94a3b8'} />
      </svg>
      {label}
    </span>
  );
}
