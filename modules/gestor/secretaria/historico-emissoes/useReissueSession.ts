import { useRef } from 'react';
import { createDocumentReissueKey } from '../../../shared/document-validation/document-validation.service';
import type { ValidatableDocumentType } from '../../../shared/document-validation/document-validation.types';
import type { EmissionLog } from './historico-emissoes.types';

/** Keeps the same backend idempotency key through preparation and confirmation. */
export function useReissueSession(userId: string | null | undefined) {
  const operation = useRef(false);
  const request = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const getRequest = (emission: EmissionLog) => {
    const fingerprint = JSON.stringify([
      emission.documento, emission.matricula_id, emission.periodo_referencia || null,
      emission.referencia_externa || null, userId || null,
    ]);
    if (request.current?.fingerprint !== fingerprint) {
      request.current = { fingerprint, idempotencyKey: createDocumentReissueKey() };
    }
    return {
      type: emission.documento as ValidatableDocumentType,
      enrollmentId: emission.matricula_id,
      referencePeriod: emission.periodo_referencia || undefined,
      sourceReference: emission.referencia_externa || undefined,
      issuedBy: userId,
      idempotencyKey: request.current.idempotencyKey,
    };
  };
  const finish = () => { request.current = null; };
  return {
    operation, getRequest, finish,
    begin: () => {
      if (operation.current) return false;
      operation.current = true;
      return true;
    },
    end: () => { operation.current = false; },
    discardStale: (error: unknown) => {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '40001') finish();
    },
  };
}
