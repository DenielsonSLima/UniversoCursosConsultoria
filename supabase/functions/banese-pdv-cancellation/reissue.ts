import { createAsaasBillingService } from '../asaas/api/billing.service.ts';
import { createOtherCreditServerSide, normalizeOtherCreditRequest } from '../asaas/api/other-credit.service.ts';
import { reconcileBaneseReceivable } from '../gateways/api/banese.ts';

export async function reissueCanceledPdvTitle(admin: any, oldId: string) {
  const reserved = await admin.rpc('reserve_banese_pdv_replacement', { p_receivable_id: oldId });
  if (reserved.error) throw reserved.error;
  const request = normalizeOtherCreditRequest(reserved.data);
  const billing = createAsaasBillingService(admin, () => false);
  const result = await createOtherCreditServerSide({
    admin, environment: 'production', request,
    syncGateway: async r => {
      if (r.gateway_submission_status === 'API_AMBIGUOUS' || r.gateway_submission_status === 'API_REGISTERED') {
        const reconciled = await reconcileBaneseReceivable(admin, r.id);
        return reconciled.receivable;
      }
      return await billing.syncReceivable({ environment:'production', apiKey:'', baseUrl:'' }, r.id);
    },
  });
  const r = result.receivable;
  const { error } = await admin.from('banese_pdv_cancellation_jobs')
    .update({ replacement_receivable_id: request.idempotencyKey })
    .eq('receivable_id', oldId).eq('state', 'CANCELED').eq('replacement_request_id', request.idempotencyKey);
  if (error) throw error;
  return { state:'REISSUED', receivableId:request.idempotencyKey,
    pixAvailable:Boolean(r.gateway_pix_payload && r.gateway_pix_encoded_image),
    registered:r.gateway_submission_status === 'API_REGISTERED' };
}
