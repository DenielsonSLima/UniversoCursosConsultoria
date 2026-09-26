import { cancelBaneseBoleto } from '../banese/core/adapter.ts';
import { normalizeBaneseFinancialTerms } from '../banese/internal/financial-terms.ts';

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const rpc = async (admin: any, name: string, args: Record<string, unknown>) => {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw error;
  return data;
};

export async function cancelAuthorizedPdvTitle(admin: any, id: string, cancel = cancelBaneseBoleto) {
  const claim = await rpc(admin, 'claim_banese_pdv_cancellation', { p_receivable_id: id });
  if (['CANCELED', 'RECOVERED'].includes(claim.state)) return { state: claim.state };
  const r = claim.receivable;
  const [payer, credential] = await Promise.all([
    admin.from('parceiros').select('cpf_cnpj').eq('id', r.cliente_id).single(),
    admin.from('payment_gateway_credentials').select('metadata')
      .eq('provider_code', 'banese_card').eq('environment', 'production').single(),
  ]);
  if (payer.error || credential.error) throw new Error('IDENTITY_UNAVAILABLE');
  const m = credential.data?.metadata || {};
  const document = digits(payer.data?.cpf_cnpj);
  if (![11, 14].includes(document.length) ||
    digits(r.gateway_boleto_convenio) !== digits(m.baneseBoletoConvenio || m.baneseConvenio) ||
    digits(r.gateway_boleto_agencia).padStart(3, '0') !== digits(m.baneseAgencia).padStart(3, '0')) {
    throw new Error('IDENTITY_MISMATCH');
  }
  const result = await cancel(admin, 'production', {
    convenio: r.gateway_boleto_convenio,
    nossoNumero: r.gateway_boleto_nosso_numero,
    stopWhenPixAvailable: true,
    expectedAmount: r.valor,
    expectedDueDate: r.data_vencimento,
    expectedAgency: r.gateway_boleto_agencia,
    expectedAccount: m.baneseConta || m.baneseContaDisplay,
    expectedDocumentNumber: id.slice(0, 15),
    expectedCompanyTitleId: id.slice(0, 25),
    expectedPayerDocument: document,
    expectedDigitableLine: r.gateway_boleto_linha_digitavel,
    expectedBarcode: r.gateway_boleto_codigo_barras,
    expectedFinancialTerms: normalizeBaneseFinancialTerms(r.gateway_financial_terms),
    signal: AbortSignal.timeout(45_000),
    onMutationStart: async () => {
      await rpc(admin, 'mark_banese_pdv_cancel_intent', {
        p_receivable_id: id, p_lease_token: claim.leaseToken,
      });
    },
  });
  if (!result.pixAvailable && (result.situationCode !== 5 || result.remoteStatus !== 'CANCELED')) {
    throw new Error('CANCELLATION_NOT_CONFIRMED');
  }
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({
    raw: result.raw, status: result.remoteStatus, checkedAt: new Date().toISOString(),
  })));
  const fingerprint = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return await rpc(admin, 'finish_banese_pdv_cancellation', {
    p_receivable_id: id, p_lease_token: claim.leaseToken,
    p_remote_status: result.remoteStatus, p_evidence_sha256: fingerprint,
    p_pix_payload: result.pixAvailable ? result.pixPayload : null,
    p_pix_image: result.pixAvailable ? result.pixEncodedImage : null,
  });
}
