import type { reconcileBaneseReceivable } from "../gateways/api/banese.ts";
import { BANESE_DISCOUNT_REMOVAL_PENDING } from "../gateways/api/banese-discount-removal.ts";

type Reconcile = typeof reconcileBaneseReceivable;

export const discountRepairDiagnosticCode = (error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : String((error as Record<string, unknown> | null)?.message || "");
  const known: Array<[string, string]> = [
    ["DISCOUNT_REPAIR_REMOTE_PROOF:OUR_NUMBER", "REMOTE_PROOF_OUR_NUMBER"],
    ["DISCOUNT_REPAIR_REMOTE_PROOF:STATUS", "REMOTE_PROOF_STATUS"],
    ["DISCOUNT_REPAIR_REMOTE_PROOF:DIGITABLE_LINE", "REMOTE_PROOF_LINE"],
    ["DISCOUNT_REPAIR_REMOTE_PROOF:BARCODE", "REMOTE_PROOF_BARCODE"],
    ["DISCOUNT_REPAIR_REMOTE_PROOF:AMOUNT", "REMOTE_PROOF_AMOUNT"],
    ["DISCOUNT_REPAIR_REMOTE_PROOF:DUE_DATE", "REMOTE_PROOF_DUE_DATE"],
    ["DISCOUNT_REPAIR_REMOTE_PROOF:DISCOUNT", "REMOTE_PROOF_DISCOUNT"],
    ["LOCAL_PERSISTENCE:RPC_ACCESS", "PERSISTENCE_ACCESS"],
    ["LOCAL_PERSISTENCE:RPC_INPUT", "PERSISTENCE_INPUT"],
    ["LOCAL_PERSISTENCE:RPC_SNAPSHOT_KEYS", "PERSISTENCE_SNAPSHOT_KEYS"],
    ["LOCAL_PERSISTENCE:RPC_NOT_FOUND", "PERSISTENCE_NOT_FOUND"],
    ["LOCAL_PERSISTENCE:RPC_REPLAY", "PERSISTENCE_REPLAY"],
    ["LOCAL_PERSISTENCE:RPC_CANONICAL", "PERSISTENCE_CANONICAL"],
    ["LOCAL_PERSISTENCE:RPC_ACTOR", "PERSISTENCE_ACTOR"],
    ["LOCAL_PERSISTENCE:RPC_RECEIVABLE_CAS", "PERSISTENCE_RECEIVABLE_CAS"],
    ["LOCAL_PERSISTENCE:RPC_TERMS", "PERSISTENCE_TERMS"],
    ["LOCAL_PERSISTENCE:RPC_POLICY", "PERSISTENCE_POLICY"],
    ["LOCAL_PERSISTENCE:RPC_REMOTE_DISCOUNT_SHAPE", "PERSISTENCE_REMOTE_SHAPE"],
    ["LOCAL_PERSISTENCE:RPC_REMOTE_PROOF", "PERSISTENCE_REMOTE_PROOF"],
    ["LOCAL_PERSISTENCE:RPC_BANK_IDENTITY", "PERSISTENCE_BANK_IDENTITY"],
    [
      "LOCAL_PERSISTENCE:RPC_TRANSACTION_COUNT",
      "PERSISTENCE_TRANSACTION_COUNT",
    ],
    [
      "LOCAL_PERSISTENCE:RPC_TRANSACTION_IDENTITY",
      "PERSISTENCE_TRANSACTION_IDENTITY",
    ],
    ["LOCAL_PERSISTENCE:RPC_GUARD", "PERSISTENCE_GUARD"],
    ["LOCAL_PERSISTENCE:RPC_TRANSACTION_CAS", "PERSISTENCE_TRANSACTION_CAS"],
    ["LOCAL_PERSISTENCE:RPC_AUDIT", "PERSISTENCE_AUDIT"],
    ["DISCOUNT_REPAIR_STAGE:LOCAL_CONTEXT", "LOCAL_CONTEXT"],
    ["DISCOUNT_REPAIR_STAGE:LOCAL_TRANSACTIONS", "LOCAL_TRANSACTIONS"],
    ["DISCOUNT_REPAIR_STAGE:BANK_PREFLIGHT", "BANK_PREFLIGHT"],
    ["DISCOUNT_REPAIR_STAGE:BANK_UPDATE", "BANK_UPDATE"],
    ["DISCOUNT_REPAIR_STAGE:LOCAL_PERSISTENCE", "LOCAL_PERSISTENCE"],
    ["identidade completa de titulo pendente", "LOCAL_IDENTITY"],
    ["termos e Pix oficiais completos", "LOCAL_TERMS_PIX"],
    ["Snapshot tecnico", "LOCAL_POLICY_SNAPSHOT"],
    ["Desconto, multa ou juros", "REMOTE_TERMS_MISMATCH"],
    ["Regra canonica", "CANONICAL_POLICY"],
    ["convenio, agencia e conta", "BANK_SCOPE"],
    ["Transacao da rematricula", "TRANSACTION_IDENTITY"],
    ["transacao da rematricula", "TRANSACTION_IDENTITY"],
    ["Transacao canonica", "TRANSACTION_IDENTITY"],
    ["transacao canonica", "TRANSACTION_IDENTITY"],
    ["proveniencia exclusiva", "TRANSACTION_IDENTITY"],
    ["Snapshot Pix", "TRANSACTION_IDENTITY"],
    ["Linha digitavel", "LOCAL_BANK_IDENTITY"],
    ["Codigo de barras", "LOCAL_BANK_IDENTITY"],
    ["Documento nao pertence", "LOCAL_BANK_IDENTITY"],
    ["Digito verificador", "LOCAL_BANK_IDENTITY"],
    ["Fator de vencimento", "LOCAL_BANK_IDENTITY"],
    ["chave ASBACE", "LOCAL_BANK_IDENTITY"],
    ["Conta do beneficiario", "LOCAL_BANK_IDENTITY"],
    ["Nosso Numero", "LOCAL_BANK_IDENTITY"],
    ["Consulta Banese", "BANK_PREFLIGHT"],
    ["Banese recusou consulta", "BANK_PREFLIGHT"],
    ["retornado pelo Banese", "BANK_PREFLIGHT"],
    ["titulo consultado", "BANK_PREFLIGHT"],
    ["Boleto remoto nao esta pendente", "REMOTE_STATUS"],
    ["Termos remotos nao correspondem", "REMOTE_TERMS"],
    ["Nao foi possivel confirmar", "BANK_UPDATE"],
    ["Termos financeiros divergentes", "BANK_UPDATE"],
    ["deixou de estar pendente", "BANK_UPDATE"],
    ["remocao automatica", "BANK_UPDATE"],
    ["CAS", "LOCAL_PERSISTENCE"],
    ["persist", "LOCAL_PERSISTENCE"],
    ["autoriz", "LOCAL_PERSISTENCE"],
    ["Persistencia", "LOCAL_PERSISTENCE"],
  ];
  return known.find(([needle]) => message.includes(needle))?.[1] ??
    "BANK_OR_UNKNOWN";
};

export const repairMarkedBaneseDiscountBeforeBatch = async (
  admin: any,
  reconcile: Reconcile,
) => {
  const { data, error } = await admin
    .from("contas_receber")
    .select("id")
    .eq("gateway_last_error", BANESE_DISCOUNT_REMOVAL_PENDING)
    .limit(2);
  if (error) throw error;

  const targets = Array.isArray(data) ? data : [];
  if (targets.length > 1) {
    throw new Error(
      "Mais de um titulo possui o marcador restrito de correcao Banese.",
    );
  }
  if (targets.length === 0) return null;

  const receivableId = String(targets[0]?.id || "");
  const result = await reconcile(admin, receivableId);
  if (
    result?.success !== true || !("repairedDiscount" in result) ||
    result.repairedDiscount !== true
  ) {
    throw new Error("O reparo marcado nao confirmou a remocao do desconto.");
  }
  return { receivableId, repairedDiscount: true as const };
};
