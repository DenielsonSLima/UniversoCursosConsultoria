import { createNationalProductionRelayTransport, type ProductionRelayConfig } from '../_shared/nfse-national/production-relay.ts';
import { createNationalProductionIssuer } from '../_shared/nfse-national/production.ts';
import { createNationalProductionCancellation } from '../_shared/nfse-national/production-cancellation.ts';
import { createProductionNumericSeriesCompatibilityValidator } from '../_shared/nfse-national/production-schema.ts';
import { assessNationalProductionContract, type ProductionContractEvidence } from '../_shared/nfse-national/production-live-contract.ts';
import { parseFiscalJson } from '../_shared/nfse-national/pilot-codec.ts';
import { requireContract, NfseContractError } from '../_shared/nfse-national/xml.ts';
import type { PreparedProductionDps, PreparedProductionCancellation } from '../_shared/nfse-national/production.types.ts';
import { fiscalReadOnlyTransport } from './read-only-transport.ts';
export interface WorkerMaterial {
  targetKind: 'ISSUE' | 'CANCEL';
  operation: PreparedProductionDps;
  cancellation?: PreparedProductionCancellation;
  issuerCnpj: string;
  credential: { certificatePem: string; chainPem: string; privateKeyPem: string };
  relay: ProductionRelayConfig;
}
/** No fiscal issue/cancel entrypoint is exposed; GET-only transport is a second independent gate. */
export async function reconcileSubmittedOperation(material: WorkerMaterial) {
  const raw = createNationalProductionRelayTransport(material.relay,material.credential);
  const deadline = setTimeout(() => raw.close(),45_000);
  const transport = fiscalReadOnlyTransport(raw,material.operation.dpsId,material.cancellation?.input.accessKey);
  try {
    requireContract(material.operation.input.environment === 'PRODUCAO' && material.operation.input.issuer.taxId.value === material.issuerCnpj,
      'WORKER_ISSUER_SCOPE_MISMATCH');
    let evidence: ProductionContractEvidence | null = null;
    for (const path of ['/swagger/docs/v1','/swagger/v1/swagger.json']) {
     try {
      const response = await transport.request('GET',path);
      if (response.status === 429) return {state:'AWAITING_CONFIRMATION' as const,code:'WORKER_RATE_LIMITED'};
      if (response.status !== 200) continue;
      evidence = {environment:'PRODUCAO',checkedAt:new Date().toISOString(),status:200,tlsVerified:true,certificateValid:true,
        url:`https://sefin.nfse.gov.br/SefinNacional${path}`,specification:parseFiscalJson(response.body)};
      break;
     } catch (error) {
      if (error instanceof NfseContractError && error.code === 'WORKER_RATE_LIMITED') throw error;
     }
    }
    requireContract(evidence !== null,'WORKER_CONTRACT_UNVERIFIED');
    const assessment = assessNationalProductionContract(evidence);
    const deps = {schema:createProductionNumericSeriesCompatibilityValidator(),credential:material.credential,
      signatureProfile:assessment.profile,transport,
      assertLiveContract:() => { throw new Error('WORKER_FISCAL_POST_FORBIDDEN'); }};
    if (material.targetKind === 'ISSUE') return await createNationalProductionIssuer(deps).reconcile(material.operation);
    requireContract(material.cancellation && assessment.eventContract,'WORKER_CANCELLATION_CONTRACT_UNVERIFIED');
    requireContract(material.cancellation.input.author.value === material.issuerCnpj,'WORKER_EVENT_ISSUER_MISMATCH');
    return await createNationalProductionCancellation({...deps,eventContract:assessment.eventContract,
      assertCancellationAllowed:() => { throw new Error('WORKER_FISCAL_POST_FORBIDDEN'); }}).reconcile(material.cancellation);
  } finally { clearTimeout(deadline); raw.close(); }
}
