import { PaymentRequestError, UUID_RE } from './contract.ts';
import type { ReceiptBank } from './bank.ts';
import type { PaymentStore, PaymentEvidence } from './store.ts';
const safeFailureMessage = 'Nenhum novo recebimento foi registrado e nenhum cancelamento foi solicitado ao banco. Confira a situação da cobrança antes de revisar o pagamento.';
const digest = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256', new TextEncoder().encode(JSON.stringify(value)),
))).map(byte => byte.toString(16).padStart(2, '0')).join('');
export async function processReceipt(attemptId: string, receivableId: string,
  dependencies: { store: PaymentStore; bank: ReceiptBank; now?: () => Date },
) {
  const { store, bank } = dependencies;
  const claim = await store.claim(attemptId);
  if (!claim || !['CANCEL_ALLOWED', 'CONFIRM_ONLY', 'LOCAL', 'COMPLETE', 'BUSY', 'FAILED_SAFE'].includes(claim.mode)) {
    throw new Error('PAYMENT_CLAIM_INVALID');
  }
  if (claim.mode === 'COMPLETE') return claim.result;
  if (claim.mode === 'FAILED_SAFE') throw new PaymentRequestError(409, safeFailureMessage, true);
  if (claim.mode === 'BUSY') throw new PaymentRequestError(409, 'Recebimento em processamento. Retome a mesma solicitação em instantes.');
  if (!UUID_RE.test(claim.leaseToken ?? '') || claim.receivable?.id !== receivableId) {
    throw new Error('PAYMENT_CLAIM_SCOPE_MISMATCH');
  }
  const lease = claim.leaseToken!;
  let mutationStarted = false;
  let remoteConfirmed = false;
  try {
    let evidence: PaymentEvidence;
    const confirmedAt = () => (dependencies.now?.() ?? new Date()).toISOString();
    if (claim.mode === 'LOCAL') {
      evidence = { remoteStatus: 'LOCAL', situationCode: null, confirmedAt: confirmedAt(),
        evidenceFingerprint: await digest({ attemptId, receivableId, mode: 'LOCAL' }),
        strictEffectivePayments: true, identityValidated: true, termsValidated: true,
        paymentsCount: 0, mutationAttempted: false, alreadyCanceled: false, convenio: null, nossoNumero: null };
    } else {
      const canceled = await bank(claim, async () => {
        if (mutationStarted || claim.mode !== 'CANCEL_ALLOWED') throw new Error('PAYMENT_DUPLICATE_MUTATION');
        await store.start(attemptId, lease);
        mutationStarted = true;
      });
      if (canceled.situationCode !== 5 || canceled.remoteStatus !== 'CANCELED' || canceled.pixAvailable ||
        canceled.convenio !== String(claim.receivable!.gateway_boleto_convenio).replace(/\D/g, '') ||
        canceled.nossoNumero !== claim.receivable!.gateway_boleto_nosso_numero ||
        canceled.mutationAttempted !== mutationStarted || canceled.alreadyCanceled === canceled.mutationAttempted) {
        throw new Error('PAYMENT_BANK_CONFIRMATION_INVALID');
      }
      remoteConfirmed = true;
      evidence = { remoteStatus: 'CANCELED', situationCode: 5, confirmedAt: confirmedAt(),
        evidenceFingerprint: await digest(canceled), strictEffectivePayments: true,
        identityValidated: true, termsValidated: true, paymentsCount: 0,
        mutationAttempted: canceled.mutationAttempted, alreadyCanceled: canceled.alreadyCanceled,
        convenio: canceled.convenio, nossoNumero: canceled.nossoNumero };
    }
    return await store.complete(attemptId, lease, evidence);
  } catch {
    const reason = remoteConfirmed ? 'LOCAL_SYNC_AFTER_REMOTE' :
      mutationStarted || claim.mode === 'CONFIRM_ONLY' ? 'REMOTE_AMBIGUOUS' : 'REMOTE_PREFLIGHT_ERROR';
    let safeToEdit = false;
    try { safeToEdit = (await store.review(attemptId, lease, reason)).safeToEdit === true; }
    catch { /* Without durable confirmation, preserve the immutable request for retry. */ }
    if (safeToEdit) throw new PaymentRequestError(409, safeFailureMessage, true);
    throw new PaymentRequestError(409, remoteConfirmed
      ? 'O boleto foi cancelado no banco; o recebimento ainda precisa ser confirmado. Retome a mesma solicitação.'
      : 'Recebimento não confirmado. Retome a mesma solicitação para conferir o boleto e concluir com segurança.');
  }
}
