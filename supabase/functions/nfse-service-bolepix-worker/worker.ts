import type { GatewayChargeResult } from "../gateways/router.ts";
import { readBaneseCreationEvidence } from "../banese/core/adapter/creation-evidence.ts";
import { preserveServiceCreationEvidence } from "./creation-evidence.ts";
import { createServiceBolepix, recoverServiceBolepix } from "./bank.ts";
import { type Admin, type Material, leaseArgs, parseJob, parseMaterial, record, rpc, validateResult } from "./contract.ts";

export type BankAction = (admin: Admin, supabaseUrl: string, material: Material) => Promise<GatewayChargeResult>;
export interface Dependencies { create?: BankAction; recover?: BankAction }
const failure = (error: unknown) => {
  const value = record(error), code = String(value.code || ""), message = String(value.message || "");
  if (["42501","55000"].includes(code)) return { transient: false, code: "AUTH_BLOCKED" };
  if (message === "INVALID_EVIDENCE" || /diverg|incompat|identidade|parcial|snapshot/i.test(message)) return { transient: false, code: "INVALID_EVIDENCE" };
  const transient = /network|fetch failed|failed to fetch|timeout|timed out|abort|TRANSPORT|\((429|5\d\d)\)/i.test(message)
    || ["57014","55P03","PGRST003"].includes(code);
  return { transient, code: transient ? "TRANSPORT" : "LOCAL_CONFLICT" };
};
export async function processServiceBolepix(admin: Admin, supabaseUrl: string, dependencies: Dependencies = {}) {
  const claimed = await rpc(admin, "claim_nfse_service_bolepix_job_internal");
  if (claimed == null) return { handled: false };
  const job = parseJob(claimed);
  let material: Material | undefined;
  try {
    material = parseMaterial(await rpc(admin, "get_nfse_service_bolepix_material_internal", leaseArgs(job)), job);
    const result = material.action === "GET"
      ? await (dependencies.recover ?? recoverServiceBolepix)(admin, supabaseUrl, material)
      : await (dependencies.create ?? createServiceBolepix)(admin, supabaseUrl, material);
    const normalized = validateResult(result, material);
    const receipt = record(await rpc(admin, "complete_nfse_service_bolepix_job_internal", { ...leaseArgs(job), p_result: normalized }));
    if (receipt.persisted !== true || receipt.receivableId !== job.receivableId) throw new Error("INVALID_EVIDENCE");
    return { handled: true, result: receipt.reviewRequired === true ? "REVIEW" : receipt.complete === true ? "DONE" : "PIX_PENDING" };
  } catch (error) {
    const creationEvidence = readBaneseCreationEvidence(error);
    if (creationEvidence) await preserveServiceCreationEvidence(admin, job.jobId,
      material?.receivable.gateway_creation_token, creationEvidence);
    const decision = failure(error);
    // A network error never releases the adapter's API_AMBIGUOUS marker or the reserved Nosso Número.
    await rpc(admin, "fail_nfse_service_bolepix_job_internal", {
      ...leaseArgs(job), p_transient: decision.transient, p_code: decision.code,
    });
    return { handled: true, result: decision.transient ? "RETRY" : "REVIEW" };
  }
}
