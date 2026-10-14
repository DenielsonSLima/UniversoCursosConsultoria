import { UUID_RE, type CancellationResponse, type CancellationResult } from './contract.ts';
import type { CancellationBank } from './bank.ts';
import type { CancellationEvidence, CancellationStore, Claim } from './store.ts';

const fingerprint = async (value: unknown) => Array.from(new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))),
)).map(byte => byte.toString(16).padStart(2, '0')).join('');

const validateClaim = (claim: Claim, id: string) => {
  if (!claim || !['CANCEL_ALLOWED', 'CONFIRM_ONLY', 'LOCAL', 'COMPLETE', 'BUSY'].includes(claim.mode)) {
    throw new Error('CANCELLATION_CLAIM_INVALID');
  }
  if (claim.mode !== 'COMPLETE' && claim.mode !== 'BUSY' &&
    (!UUID_RE.test(claim.leaseToken ?? '') || claim.receivable?.id !== id)) {
    throw new Error('CANCELLATION_CLAIM_SCOPE_MISMATCH');
  }
};

export async function processCancellationItem(operationId: string, receivableId: string,
  dependencies: { store: CancellationStore; bank: CancellationBank; now?: () => Date },
): Promise<CancellationResult> {
  const { store, bank } = dependencies;
  let claim: Claim;
  try {
    claim = await store.claim(operationId, receivableId);
    validateClaim(claim, receivableId);
  } catch {
    return { receivableId, status: 'FAILED', message: 'O crédito mudou ou não está disponível para cancelamento. Confira sua situação.' };
  }
  if (claim.mode === 'COMPLETE') return { receivableId, status: 'CANCELED' };
  if (claim.mode === 'BUSY') return { receivableId, status: 'PROCESSING', message: 'Este crédito já está sendo processado. Retome a mesma solicitação em instantes.' };
  const leaseToken = claim.leaseToken!;
  let mutationStarted = false;
  let remoteConfirmed = false;
  try {
    const confirmedAt = () => (dependencies.now?.() ?? new Date()).toISOString();
    let evidence: CancellationEvidence;
    if (claim.mode === 'LOCAL') {
      // The SQL store independently checks absence of all remote identities,
      // settlements, academic/loan/contract links and concurrent changes.
      evidence = {
        remoteStatus: 'LOCAL', situationCode: null, confirmedAt: confirmedAt(),
        evidenceFingerprint: await fingerprint({ operationId, receivableId, mode: 'LOCAL' }),
        strictEffectivePayments: true, identityValidated: true, termsValidated: true,
        paymentsCount: 0, mutationAttempted: false, alreadyCanceled: false,
        convenio: null, nossoNumero: null,
      };
    } else {
      const canceled = await bank(claim, async () => {
        if (mutationStarted || claim.mode !== 'CANCEL_ALLOWED') throw new Error('DUPLICATE_REMOTE_MUTATION_BLOCKED');
        await store.start(operationId, receivableId, leaseToken);
        mutationStarted = true;
      });
      if (canceled.situationCode !== 5 || canceled.remoteStatus !== 'CANCELED' || canceled.pixAvailable ||
        canceled.convenio !== String(claim.receivable!.gateway_boleto_convenio).replace(/\D/g, '') ||
        canceled.nossoNumero !== claim.receivable!.gateway_boleto_nosso_numero ||
        canceled.mutationAttempted !== mutationStarted ||
        canceled.alreadyCanceled === canceled.mutationAttempted) {
        throw new Error('CANCELLATION_BANK_CONFIRMATION_INVALID');
      }
      remoteConfirmed = true;
      evidence = {
        remoteStatus: 'CANCELED', situationCode: 5, confirmedAt: confirmedAt(),
        evidenceFingerprint: await fingerprint(canceled), strictEffectivePayments: true,
        identityValidated: true, termsValidated: true, paymentsCount: 0,
        mutationAttempted: canceled.mutationAttempted, alreadyCanceled: canceled.alreadyCanceled,
        convenio: canceled.convenio, nossoNumero: canceled.nossoNumero,
      };
    }
    await store.complete(operationId, receivableId, leaseToken, evidence);
    return { receivableId, status: 'CANCELED' };
  } catch {
    const reason = remoteConfirmed ? 'LOCAL_SYNC_AFTER_REMOTE' :
      mutationStarted || claim.mode === 'CONFIRM_ONLY' ? 'REMOTE_AMBIGUOUS' : 'REMOTE_PREFLIGHT_ERROR';
    try {
      await store.review(operationId, receivableId, leaseToken, reason);
    } catch {
      return { receivableId, status: 'REVIEW_REQUIRED', message: 'A confirmação não foi concluída. Retome a mesma solicitação para consultar o resultado com segurança.' };
    }
    return {
      receivableId, status: 'REVIEW_REQUIRED',
      message: remoteConfirmed
        ? 'O banco confirmou o cancelamento; falta concluir a atualização do crédito. Retome esta solicitação.'
        : mutationStarted || claim.mode === 'CONFIRM_ONLY'
        ? 'O resultado no banco precisa ser confirmado. Retome esta solicitação para consultar o mesmo boleto.'
        : 'Não foi possível confirmar que o crédito pode ser cancelado. Confira pagamentos e dados bancários.',
    };
  }
}

export async function processCancellationBatch(operationId: string, receivableIds: string[],
  dependencies: { store: CancellationStore; bank: CancellationBank; now?: () => Date; clock?: () => number },
): Promise<CancellationResponse> {
  const clock = dependencies.clock ?? Date.now;
  const started = clock();
  const results: CancellationResult[] = [];
  // Deliberately serial: bounded requests protect the bank, while every item has
  // an independent durable outcome and resumes under the same operation ID.
  for (const receivableId of receivableIds) {
    if (clock() - started > 80_000) {
      results.push({ receivableId, status: 'PROCESSING', message: 'Aguardando processamento. Retome a mesma solicitação para continuar.' });
      continue;
    }
    results.push(await processCancellationItem(operationId, receivableId, dependencies));
  }
  return { operationId, results };
}
