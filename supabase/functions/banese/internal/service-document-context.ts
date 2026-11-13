import type { BaneseBoletoDocumentInput } from "./types.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RpcReader = { rpc(name: string, args: { p_receivable_id: string }): PromiseLike<{ data: unknown; error: unknown }> };
export type ServiceDocumentContext = {
  invoiceNumber: string;
  serviceDescription: string;
  installmentNumber: number;
  installmentCount: number;
  operationId: string;
  serviceId: string;
  receivableIds: string[];
};

export function parseServiceDocumentContext(value: unknown, receivableId: string): ServiceDocumentContext | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Referência fiscal do boleto indisponível.");
  const row = value as Record<string, unknown>;
  const number = String(row.invoiceNumber || "").trim();
  const description = typeof row.serviceDescription === "string" ? row.serviceDescription : "";
  const installment = row.installmentNumber, count = row.installmentCount;
  const ids = row.receivableIds;
  if (!/^\d{1,20}$/.test(number) || !description.trim() || [...description].length > 2000
    || !Number.isInteger(installment) || !Number.isInteger(count)
    || Number(installment) < 1 || Number(installment) > Number(count) || Number(count) > 60
    || !uuid.test(String(row.operationId)) || !uuid.test(String(row.serviceId))
    || !Array.isArray(ids) || ids.length !== count || ids.some(id => typeof id !== "string" || !uuid.test(id))
    || new Set(ids).size !== ids.length || ids[Number(installment) - 1] !== receivableId) {
    throw new Error("A referência da NFS-e não corresponde ao grupo de boletos deste serviço.");
  }
  return { invoiceNumber: number, serviceDescription: description, installmentNumber: Number(installment),
    installmentCount: Number(count), operationId: String(row.operationId), serviceId: String(row.serviceId), receivableIds: ids };
}

/** Service-role projection is consumed only after the Edge validated the user token. */
export async function readServiceDocumentContext(admin: RpcReader, receivableId: string) {
  const { data, error } = await admin.rpc("get_nfse_service_boleto_context_internal", { p_receivable_id: receivableId });
  if (error) throw new Error("Não foi possível conferir a referência fiscal do boleto.");
  return parseServiceDocumentContext(data, receivableId);
}

/** Permission comes from the caller JWT and the canonical ledger, never a client-supplied flag. */
export async function hasScopedServiceDocumentReadAccess(caller: RpcReader, receivableId: string) {
  const { data, error } = await caller.rpc("can_read_nfse_service_boleto_secure", { p_receivable_id: receivableId });
  return !error && data === true;
}

export function withServiceDocumentContext(input: BaneseBoletoDocumentInput, context: ServiceDocumentContext) {
  const index = context.receivableIds.indexOf(input.receivableId);
  if (index < 0) throw new Error("O boleto não pertence à NFS-e selecionada.");
  return { ...input,
    installment: { current: index + 1, total: context.installmentCount },
    serviceInvoice: { number: context.invoiceNumber, description: context.serviceDescription },
    instructions: [
      ...(input.environment === "sandbox" ? ["BOLETO DE HOMOLOGAÇÃO - NÃO REALIZAR PAGAMENTO."] : []),
      `NFS-e nº ${context.invoiceNumber} · Parcela ${index + 1}/${context.installmentCount}`,
    ],
  };
}
