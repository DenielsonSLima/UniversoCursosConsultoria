import type { NfseScope } from '../types/nfse.types';
import { queueInput } from './nfse-queue.contract';
import type { NfseQueueInput } from './nfse-queue.types';

/** Preserve the same request after a lost reply; changed intent always gets a new ID. */
export function createNfsePreparationAttempt(newId: () => string = () => crypto.randomUUID()) {
  let previous: { key: string; input: NfseQueueInput } | undefined;
  const attempt = (scope: NfseScope, intent: Omit<NfseQueueInput, 'requestId'>): NfseQueueInput => {
    const canonical = { ...intent, candidateIds: [...intent.candidateIds].sort() };
    const key = JSON.stringify([scope, canonical]);
    if (previous?.key === key) return { ...previous.input, candidateIds: [...previous.input.candidateIds] };
    const input = { ...canonical, requestId: newId() };
    queueInput(input);
    previous = { key, input };
    return { ...input, candidateIds: [...input.candidateIds] };
  };
  return Object.assign(attempt, { confirm(requestId: string) {
    if (previous?.input.requestId === requestId) previous = undefined;
  } });
}
