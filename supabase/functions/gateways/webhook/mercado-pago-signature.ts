/**
 * Janela maxima aceita para atraso de rede e diferenca de relogio. O mesmo
 * limite vale para timestamps antigos e adiantados, reduzindo replay.
 */
export const MERCADO_PAGO_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

export const parseMercadoPagoSignature = (header: string | null) => {
  const parsed = { ts: "", v1: "" };
  for (const part of String(header || "").split(",")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "ts") parsed.ts = value;
    if (key === "v1") parsed.v1 = value;
  }
  return parsed;
};

export const parseMercadoPagoSignatureTimestamp = (
  value: string,
): number | null => {
  const normalized = String(value || "").trim();
  if (!/^\d+$/.test(normalized)) return null;

  const timestamp = Number(normalized);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return null;

  // Mercado Pago documenta `ts` em segundos, mas alguns intermediarios
  // preservam o mesmo instante em milissegundos. Formatos ambiguos falham.
  if (normalized.length <= 10) return timestamp * 1000;
  if (normalized.length === 13) return timestamp;
  return null;
};

export const isMercadoPagoSignatureTimestampFresh = (
  value: string,
  nowMs = Date.now(),
  toleranceMs = MERCADO_PAGO_SIGNATURE_TOLERANCE_MS,
) => {
  const timestampMs = parseMercadoPagoSignatureTimestamp(value);
  if (timestampMs === null) return false;
  if (!Number.isFinite(nowMs) || !Number.isFinite(toleranceMs)) return false;
  if (toleranceMs < 0) return false;
  return Math.abs(nowMs - timestampMs) <= toleranceMs;
};
