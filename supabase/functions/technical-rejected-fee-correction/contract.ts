export type RejectedFeeRpcClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
export const REJECTED_FEE_ACTION = "inspect_rejected_fee_absence";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const parseInspectionRequest = (value: unknown) => {
  const row = record(value);
  if (Object.keys(row).sort().join() !== "action,manifestHash,operationId" ||
    row.action !== REJECTED_FEE_ACTION || !UUID.test(String(row.operationId)) ||
    !/^[a-f0-9]{64}$/.test(String(row.manifestHash))) {
    throw new Error("REJECTED_FEE_INSPECTION_REQUEST_INVALID");
  }
  return { operationId: String(row.operationId), manifestHash: String(row.manifestHash) };
};
export const parseInspectionLease = (value: unknown, operationId: string, manifestHash: string) => {
  const row = record(value);
  if (row.operationId !== operationId || row.manifestHash !== manifestHash ||
    row.environment !== "production" || !UUID.test(String(row.leaseToken)) ||
    !UUID.test(String(row.receivableId)) || !/^[0-9]{1,20}$/.test(String(row.convenio)) ||
    !/^[0-9]{9}$/.test(String(row.nossoNumero))) throw new Error("REJECTED_FEE_LEASE_INVALID");
  return { operationId, manifestHash, leaseToken: String(row.leaseToken),
    convenio: String(row.convenio), nossoNumero: String(row.nossoNumero) };
};
export const assertOfficialAbsence = (status: number, body: unknown) => {
  const errors = record(body).Erros;
  const code = Array.isArray(errors) && errors.length === 1
    ? record(errors[0]).CodigoErroProcessamento : null;
  // Banese API manual v1.6, GET section 2.3: one Erros entry, exact code.
  // Only surrounding whitespace is normalized; no description or substring match.
  if ((status !== 400 && status !== 404) || typeof code !== "string" ||
    code.trim() !== "ERRO_BOLETO_NAO_ENCONTRADO") {
    throw new Error("REJECTED_FEE_EXACT_OFFICIAL_ABSENCE_NOT_CONFIRMED");
  }
  return { normalizer: "BANESE_GET_SINGLE_ERROR_V1", responseShape: "Erros[1].CodigoErroProcessamento", errorCount: 1 };
};
