import { queryBaneseBoleto } from "../banese/core/adapter.ts";
import { normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import { reconcileBaneseReceivable } from "../gateways/api/banese.ts";
import { BANESE_DISCOUNT_REMOVAL_PENDING } from "../gateways/api/banese-discount-removal.ts";
import {
  assertBaneseReceivableTitleCompatible,
  assertBaneseReconciliationProvenance,
} from "../gateways/api/banese-reconciliation-contract.ts";
import { loadBaneseExpectedTransactions } from "../gateways/api/banese-reconciliation-persistence.ts";
import { assertPortalPdfBankEvidence, isPortalPdfImport } from "./portal-pdf-evidence.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

const loadPortalContext = async (admin: any, receivableId: string) => {
  if (!uuid.test(receivableId)) throw new Error("INVALID_RECEIVABLE");
  const { data: row, error } = await admin.from("contas_receber")
    .select("*").eq("id", receivableId).maybeSingle();
  if (error || !row || row.gateway_provider !== "banese_card" ||
    row.gateway_payment_method !== "BOLETO" || row.gateway_environment !== "production" ||
    !["PENDENTE", "VENCIDO", "AGUARDANDO_CONFIRMACAO", "PAGO"].includes(String(row.status))) {
    throw new Error("PORTAL_RECEIVABLE_UNAVAILABLE");
  }
  if (row.gateway_last_error === BANESE_DISCOUNT_REMOVAL_PENDING) {
    throw new Error("PORTAL_MAINTENANCE_NOT_ALLOWED");
  }
  const nossoNumero = assertBaneseReceivableTitleCompatible(row);
  const transactions = await loadBaneseExpectedTransactions(admin, { receivableId, environment: "production" });
  if (transactions.length !== 1 || !isPortalPdfImport(transactions[0].raw_payload)) {
    throw new Error("PORTAL_PROVENANCE_UNAVAILABLE");
  }
  assertBaneseReconciliationProvenance(row, transactions, nossoNumero);
  const bankNumbers = assertPortalPdfBankEvidence(row, transactions[0], nossoNumero);
  const terms = normalizeBaneseFinancialTerms(row.gateway_financial_terms);
  if (Math.round(terms.nominalAmount * 100) !== Math.round(Number(row.valor) * 100) ||
    terms.dueDate !== String(row.data_vencimento).slice(0, 10) || !digits(row.gateway_boleto_convenio)) {
    throw new Error("PORTAL_LOCAL_FINANCIAL_DIVERGENCE");
  }
  return { row, nossoNumero, terms, bankNumbers };
};

// An explicit worker action uses the canonical reconciler, CAS and post-settlement
// completion. Nothing enables portal imports on the normal cron/queue branch.
export const reconcilePortalPdfReceivable = async (
  admin: any,
  receivableId: string,
  dependencies: {
    queryBoleto?: typeof queryBaneseBoleto;
    reconcile?: typeof reconcileBaneseReceivable;
  } = {},
) => {
  await loadPortalContext(admin, receivableId);
  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const result = await (dependencies.reconcile ?? reconcileBaneseReceivable)(admin, receivableId, {
      signal: controller.signal,
      // The core checks this maintenance marker before invoking queryBoleto.
      // Block it here too, including a marker introduced after the preflight.
      repairDiscountRemoval: async () => { throw new Error("PORTAL_MAINTENANCE_NOT_ALLOWED"); },
      queryBoleto: async (client, environment, input) => {
        const context = await loadPortalContext(client, receivableId);
        const agency = digits(input.expectedAgency);
        const account = digits(input.expectedAccount);
        if (environment !== "production" || digits(input.nossoNumero) !== context.nossoNumero ||
          digits(input.convenio) !== digits(context.row.gateway_boleto_convenio) ||
          Number(input.expectedAmount) !== context.terms.nominalAmount ||
          input.expectedDueDate !== context.terms.dueDate ||
          ![11, 14].includes(digits(input.expectedPayerDocument).length) ||
          !/^\d{3}$/.test(agency) || agency === "000" ||
          !/^\d{9}$/.test(account) || account === "000000000") {
          throw new Error("PORTAL_QUERY_IDENTITY_INVALID");
        }
        const snapshot = await (dependencies.queryBoleto ?? queryBaneseBoleto)(client, environment, {
          ...input,
          recoverPix: false,
          validateTitleIdentity: true,
          strictEffectivePayments: true,
          skipEffectivePaymentsWhenOfficiallyUnpaid: false,
          expectedDocumentNumber: undefined,
          expectedCompanyTitleId: undefined,
        });
        const official = snapshot.raw as Record<string, unknown>;
        if (digits(official.NumeroLinhaDigitavel ?? official.numeroLinhaDigitavel) !== context.bankNumbers.digitableLine ||
          digits(official.NumeroCodigoBarras ?? official.numeroCodigoBarras) !== context.bankNumbers.barcode ||
          snapshot.pixPayload || snapshot.pixEncodedImage) {
          throw new Error("PORTAL_OFFICIAL_BANK_EVIDENCE_DIVERGENCE");
        }
        return snapshot;
      },
    });
    return {
      success: result.success,
      action: "reconcile_portal_pdf_receivable",
      paid: result.paid,
      payments: result.payments,
      futureSyncPending: Boolean(result.futureSyncWarning),
    };
  } finally {
    clearTimeout(timeout);
  }
};
