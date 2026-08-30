import { onlyBaneseDigits } from "./banese-reconciliation-contract.ts";
import { awaitBaneseRead } from "../../banese/core/adapter/utils.ts";

type BankNumbers = {
  digitableLine: string;
  barcode: string;
} | null;

const TRANSACTION_CAS_KEYS = [
  "id",
  "remote_payment_id",
  "bank_slip_our_number",
  "remote_status",
  "amount",
  "pix_payload",
  "pix_encoded_image",
  "bank_slip_digitable_line",
  "bank_slip_barcode",
  "raw_payload",
  "last_error",
  "synced_at",
  "updated_at",
] as const;

export const loadBaneseExpectedTransactions = async (
  admin: any,
  input: {
    receivableId: string;
    environment: string;
  },
) => {
  const { data, error } = await admin
    .from("payment_gateway_transactions")
    .select(TRANSACTION_CAS_KEYS.join(","))
    .eq("receivable_id", input.receivableId)
    .eq("provider_code", "banese_card")
    .eq("environment", input.environment)
    .eq("payment_method", "BOLETO");
  if (error) throw error;
  if (!Array.isArray(data) || data.length > 1) {
    throw new Error(
      "Titulo Banese possui estado transacional ambiguo para conciliacao.",
    );
  }
  return data.map((row) => {
    const base = Object.fromEntries(
      TRANSACTION_CAS_KEYS.map((key) => [key, row[key] ?? null]),
    );
    const rawPayload = row.raw_payload;
    let payload: Record<string, unknown> | null = rawPayload &&
        typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? rawPayload as Record<string, unknown>
      : null;
    if (!payload && typeof rawPayload === "string") {
      try {
        const parsed = JSON.parse(rawPayload);
        payload = parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed as Record<string, unknown>
          : null;
      } catch {
        payload = null;
      }
    }
    const importSource = String(payload?.importSource ?? "");
    // Boletos importados do legado não passaram pelo fluxo normal de POST API,
    // portanto NumeroDocumento e IdTituloEmpresa ficam em branco no Banese.
    // O campo abaixo permite que a conciliação desabilite a validação de
    // identidade de título para esses boletos sem alterar a tabela.
    base.is_legacy_import = importSource === "BANESE_API_LEGACY_DISCOVERY";
    return base;
  });
};

export const persistBaneseReconciliationSnapshot = async (
  admin: any,
  input: {
    receivable: Record<string, any>;
    environment: string;
    convenio: unknown;
    nossoNumero: string;
    remoteStatus: unknown;
    financialTerms: unknown;
    confirmApiSubmission: boolean;
    remotePaid: boolean;
    postSettlementRequired: boolean;
    shouldSettle: boolean;
    paymentTotal: number;
    paymentDate: string | null;
    settlementMethod: string;
    pixPayload: string;
    pixEncodedImage: string;
    bankNumbers: BankNumbers;
    snapshot: Record<string, any>;
    expectedTransactions: Array<Record<string, any>>;
    signal?: AbortSignal;
  },
) => {
  const { receivable, snapshot } = input;
  const transactionSnapshot = {
    reconciliation: snapshot.raw,
    payments: snapshot.payments,
    convenio: onlyBaneseDigits(input.convenio),
    nossoNumero: input.nossoNumero,
    financialTerms: input.financialTerms,
    settlementMethod: input.settlementMethod,
    pixRecovered: Boolean(snapshot.pixPayload),
  };
  const rpcRequest = admin.rpc(
    "persist_banese_reconciliation_snapshot",
    {
      p_receivable_id: receivable.id,
      p_environment: input.environment,
      p_nosso_numero: input.nossoNumero,
      p_expected_updated_at: receivable.updated_at,
      p_expected_status: receivable.status,
      p_expected_gateway_status: receivable.gateway_status ?? null,
      p_expected_amount: Number(receivable.valor),
      p_expected_due_date: String(receivable.data_vencimento || "").slice(
        0,
        10,
      ),
      p_expected_convenio: onlyBaneseDigits(input.convenio),
      p_expected_state: {
        status: receivable.status ?? null,
        origem_pagamento: receivable.origem_pagamento ?? null,
        forma_pagamento: receivable.forma_pagamento ?? null,
        gateway_status: receivable.gateway_status ?? null,
        gateway_last_error: receivable.gateway_last_error ?? null,
        gateway_payment_id: receivable.gateway_payment_id ?? null,
        gateway_boleto_nosso_numero: receivable.gateway_boleto_nosso_numero ??
          null,
        gateway_creation_token: receivable.gateway_creation_token ?? null,
        gateway_financial_terms: receivable.gateway_financial_terms ?? null,
        gateway_financial_terms_confirmed_at:
          receivable.gateway_financial_terms_confirmed_at ?? null,
        gateway_submission_channel: receivable.gateway_submission_channel ??
          null,
        gateway_submission_status: receivable.gateway_submission_status ?? null,
        gateway_cnab_file_id: receivable.gateway_cnab_file_id ?? null,
        gateway_boleto_agencia: receivable.gateway_boleto_agencia ?? null,
        gateway_boleto_linha_digitavel:
          receivable.gateway_boleto_linha_digitavel ?? null,
        gateway_boleto_codigo_barras: receivable.gateway_boleto_codigo_barras ??
          null,
        gateway_pix_payload: receivable.gateway_pix_payload ?? null,
        gateway_pix_encoded_image: receivable.gateway_pix_encoded_image ?? null,
        updated_at: receivable.updated_at ?? null,
      },
      p_remote_status: String(input.remoteStatus || ""),
      p_financial_terms: input.financialTerms,
      p_confirm_api_submission: input.confirmApiSubmission,
      p_remote_paid: input.remotePaid,
      p_post_settlement_required: input.postSettlementRequired,
      p_should_settle: input.shouldSettle,
      p_payment_total: input.remotePaid ? input.paymentTotal : null,
      p_payment_date: input.remotePaid ? input.paymentDate : null,
      p_settlement_method: input.settlementMethod,
      p_pix_payload: input.pixPayload || null,
      p_pix_encoded_image: input.pixEncodedImage || null,
      p_remote_digitable_line: input.bankNumbers?.digitableLine || null,
      p_remote_barcode: input.bankNumbers?.barcode || null,
      p_transaction_snapshot: transactionSnapshot,
      p_expected_transactions: input.expectedTransactions,
    },
  );
  const request = input.signal && typeof rpcRequest?.abortSignal === "function"
    ? rpcRequest.abortSignal(input.signal)
    : rpcRequest;
  const { data, error } = await awaitBaneseRead(
    Promise.resolve(request),
    input.signal,
  );
  if (error) throw error;
  const updated = data?.receivable;
  if (
    !updated || typeof updated !== "object" ||
    String(updated.id || "") !== String(receivable.id)
  ) {
    throw new Error(
      "A persistencia atomica da conciliacao Banese retornou contrato invalido.",
    );
  }
  Object.assign(receivable, updated);
  return updated as Record<string, any>;
};
