import { queryBaneseBoleto } from "../banese/core/adapter.ts";
import {
  normalizeBaneseFinancialTerms,
} from "../banese/internal/financial-terms.ts";
import { calculateBaneseSettlementRange } from "../banese/internal/settlement-range.ts";
import { assertBaneseFinancialTermsEqual } from "../banese/internal/financial-terms-response.ts";
import {
  assertBaneseReceivableTitleCompatible,
  assertBaneseReconciliationProvenance,
  banesePaymentDate,
  sumBanesePaymentValues,
} from "../gateways/api/banese-reconciliation-contract.ts";
import { loadBaneseExpectedTransactions } from "../gateways/api/banese-reconciliation-persistence.ts";
import { requireGatewayEnvironment } from "../gateways/api/environment.ts";
import { readRequestBody } from "./request-guards.ts";
import { json } from "./response.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Called only after worker-secret authentication. No reconciliation, maintenance,
// queue RPC or persistence is available on this branch; OAuth remains internal.
export const diagnoseBaneseReceivable = async (
  admin: any,
  receivableId: string,
  query: typeof queryBaneseBoleto = queryBaneseBoleto,
) => {
  if (!uuid.test(receivableId)) throw new Error("INVALID_RECEIVABLE");
  const { data: row, error } = await admin.from("contas_receber")
    .select("*").eq("id", receivableId).maybeSingle();
  if (error || !row) throw new Error("RECEIVABLE_UNAVAILABLE");
  if (row.gateway_provider !== "banese_card" || row.gateway_payment_method !== "BOLETO") {
    throw new Error("INVALID_PROVIDER");
  }
  const environment = requireGatewayEnvironment(row.gateway_environment, "diagnostico");
  const nossoNumero = assertBaneseReceivableTitleCompatible(row);
  const transactions = await loadBaneseExpectedTransactions(admin, { receivableId, environment });
  if (transactions.length !== 1) throw new Error("AMBIGUOUS_TRANSACTION");
  assertBaneseReconciliationProvenance(row, transactions, nossoNumero);
  const terms = normalizeBaneseFinancialTerms(row.gateway_financial_terms);
  if (Math.round(terms.nominalAmount * 100) !== Math.round(Number(row.valor) * 100) ||
    terms.dueDate !== String(row.data_vencimento).slice(0, 10)) {
    throw new Error("LOCAL_FINANCIAL_DIVERGENCE");
  }
  const { data: payer, error: payerError } = await admin.from("parceiros")
    .select("cpf_cnpj").eq("id", row.cliente_id).maybeSingle();
  const payerDocument = String(payer?.cpf_cnpj ?? "").replace(/\D/g, "");
  if (payerError || ![11, 14].includes(payerDocument.length)) throw new Error("INVALID_PAYER");
  const { data: credential, error: credentialError } = await admin
    .from("payment_gateway_credentials").select("metadata")
    .eq("provider_code", "banese_card").eq("environment", environment).maybeSingle();
  if (credentialError) throw new Error("CONFIGURATION_UNAVAILABLE");
  const metadata = credential?.metadata ?? {};
  const legacy = transactions[0].is_legacy_import;
  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const snapshot = await query(admin, environment, {
      convenio: row.gateway_boleto_convenio || metadata.baneseBoletoConvenio || metadata.baneseConvenio,
      nossoNumero,
      recoverPix: false,
      skipEffectivePaymentsWhenOfficiallyUnpaid: false,
      // CPF, nominal, due date and ASBACE are validated even for legacy titles.
      // Legacy has no local document/company ID to compare with the bank.
      validateTitleIdentity: true,
      expectedAmount: terms.nominalAmount,
      expectedDueDate: terms.dueDate,
      expectedPayerDocument: payerDocument,
      expectedAgency: legacy ? undefined : row.gateway_boleto_agencia || metadata.baneseAgencia,
      expectedAccount: legacy ? undefined : metadata.baneseConta || metadata.baneseContaDisplay,
      expectedDocumentNumber: legacy ? undefined : receivableId.slice(0, 15),
      expectedCompanyTitleId: legacy ? undefined : receivableId.slice(0, 25),
      signal: controller.signal,
    });
    if (!snapshot.financialTerms || snapshot.financialTermsError || snapshot.paymentsError) throw new Error("INVALID_REMOTE_SNAPSHOT");
    assertBaneseFinancialTermsEqual(terms, snapshot.financialTerms);
    const amount = Math.round(sumBanesePaymentValues(snapshot.payments) * 100) / 100;
    const dates = snapshot.payments.map(banesePaymentDate).sort();
    const paymentDate = dates.at(-1) ?? null;
    const range = paymentDate ? calculateBaneseSettlementRange(terms, paymentDate) : null;
    return {
      success: true, action: "diagnose_receivable", readOnly: true,
      checkedAt: new Date().toISOString(), environment,
      paid: snapshot.paid, remoteStatus: snapshot.remoteStatus,
      situationCode: snapshot.situationCode, amount, paymentDate,
      nominalAmount: terms.nominalAmount, financialTerms: terms,
      calculatedRange: range,
      withinCalculatedRange: range ? amount >= range.minimumAmount && amount <= range.maximumAmount : null,
      payments: snapshot.payments.map((payment) => ({
        amount: Math.round(sumBanesePaymentValues([payment]) * 100) / 100,
        date: banesePaymentDate(payment),
        // Names only, bounded ASCII identifiers; never return arbitrary values.
        detectedPaymentFieldNames: Object.keys(payment)
          .filter((key) => /^[A-Za-z][A-Za-z_]{0,63}$/.test(key)).slice(0, 80).sort(),
        officialComponents: null,
      })),
      componentsNote: "O parser atual não normaliza a composição efetivamente paga; os termos contratuais não são componentes pagos.",
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const handleDiagnosticRequest = async (
  req: Request,
  admin: any,
  diagnose: typeof diagnoseBaneseReceivable = diagnoseBaneseReceivable,
): Promise<Response | null> => {
  let body: unknown;
  try {
    body = await readRequestBody(req);
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }
  if (body === undefined) return null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Requisição inválida." }, 400);
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length === 0) return null;
  if (input.action !== "diagnose_receivable" || typeof input.receivableId !== "string" ||
    !uuid.test(input.receivableId) || Object.keys(input).some((key) => !["action", "receivableId"].includes(key))) {
    return json({ error: "Ação de diagnóstico inválida." }, 400);
  }
  try {
    return json(await diagnose(admin, input.receivableId));
  } catch {
    // Adapter errors may contain bank responses: never echo or log them.
    return json({ success: false, readOnly: true, error: "Não foi possível validar a consulta bancária isolada." }, 422);
  }
};
