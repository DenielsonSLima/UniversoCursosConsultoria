import { type Job, parseJob, record, uuid } from "./contract.ts";
export interface CancellationMaterial extends Job {
  action: "LOCAL_CANCEL" | "CANCEL_BANK" | "OBSERVE_BANK" | "PRESERVE_PAID";
  cancelIntent: boolean; receivable: Record<string, unknown>;
  payer: Record<string, unknown>; metadata: Record<string, unknown>;
}
export const parseCancellationMaterial = (value: unknown, job: Job): CancellationMaterial => {
  const item = record(value), c = record(item.receivable), payer = record(item.payer);
  if (JSON.stringify(parseJob({ ...item, receivableId: c.id })) !== JSON.stringify(job)
    || !["LOCAL_CANCEL","CANCEL_BANK","OBSERVE_BANK","PRESERVE_PAID"].includes(String(item.action))
    || c.categoria !== "OUTROS_CREDITOS" || c.tipo_lancamento !== "OUTRO_CREDITO"
    || c.matricula_id != null || c.turma_id != null || c.origem_cronograma_id != null) throw new Error("INVALID_EVIDENCE");
  if (item.action !== "PRESERVE_PAID" && (c.status === "PAGO" || Number(c.valor_pago || 0) > 0
    || Number(record(c.payment_summary).previouslyPaid || 0) > 0)) throw new Error("PAYMENT_HISTORY");
  if (["CANCEL_BANK","OBSERVE_BANK"].includes(String(item.action)) && (
    c.gateway_provider !== "banese_card" || c.gateway_environment !== "production" || c.gateway_payment_method !== "BOLETO"
    || !uuid.test(String(c.gateway_issuer_polo_id))
    || !/^\d{9}$/.test(String(c.gateway_boleto_nosso_numero)) || c.cliente_id !== payer.id
    || !uuid.test(String(item.bankActorId)) || typeof item.cancelIntent !== "boolean"
    || item.action === "CANCEL_BANK" && item.cancelIntent === true
    || item.action === "OBSERVE_BANK" && item.cancelIntent !== true)) throw new Error("INVALID_EVIDENCE");
  if (item.action === "PRESERVE_PAID" && c.status !== "PAGO") throw new Error("PAYMENT_HISTORY");
  return { ...job, action: item.action as CancellationMaterial["action"], cancelIntent: item.cancelIntent === true,
    receivable: c, payer, metadata: record(item.metadata) };
};
export type CancellationProof = Record<string, unknown> & { outcome: "LOCAL_CANCELLED" | "CANCELLED" | "PAID" };
export const cancellationFingerprint = async (value: unknown) => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))));
  return Array.from(bytes, byte => byte.toString(16).padStart(2,"0")).join("");
};
