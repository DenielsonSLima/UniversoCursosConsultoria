export interface IndividualScope {
  poloId: string;
  contextKey: string;
  environment: "PRODUCAO";
  month: string;
}
export interface IndividualCommand {
  scope: IndividualScope;
  action:
    | "PREVIEW"
    | "PREVIEW_QUEUE"
    | "ISSUE"
    | "RECONCILE"
    | "OBSERVE"
    | "CANCEL_PREVIEW"
    | "CANCEL"
    | "RETRY_CANCEL"
    | "RECONCILE_CANCEL"
    | "OBSERVE_CANCEL";
  requestId: string;
  previewId?: string;
  confirmed?: true;
  partnerId?: string;
  modelId?: string;
  modelVersion?: number;
  amount?: string;
  source?: { kind: "PARTNER_SERVICE" | "ACADEMIC_QUEUE"; id: string };
  competenceDate?: string;
  serviceDate?: string;
  cancelPreviewId?: string;
  reasonCode?: "1" | "2" | "9";
  justification?: string;
  cancellationModel?: { id: string; version: number };
  detail?: string | null;
  retryRequestId?: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const invalidFinalText = (value: string) => /\{\{|\}\}/.test(value) ||
  [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
const date = (v: unknown) =>
  typeof v === "string" && /^20\d{2}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export function parseIndividualCommand(v: unknown): IndividualCommand {
  if (
    !object(v) || !object(v.scope) ||
    Object.keys(v.scope).sort().join(",") !==
      "contextKey,environment,month,poloId" ||
    !uuid.test(String(v.scope.poloId)) ||
    !uuid.test(String(v.scope.contextKey)) ||
    v.scope.environment !== "PRODUCAO" ||
    !/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(v.scope.month)) ||
    !uuid.test(String(v.requestId))
  ) throw new Error("INVALID_COMMAND");
  const fields = ["scope", "action", "requestId"];
  if (v.action === "PREVIEW_QUEUE") {
    fields.push("source");
    if (
      !object(v.source) ||
      Object.keys(v.source).sort().join(",") !== "id,kind" ||
      !uuid.test(String(v.source.id)) ||
      !["PARTNER_SERVICE", "ACADEMIC_QUEUE"].includes(String(v.source.kind))
    ) throw new Error("INVALID_COMMAND");
    if (v.source.kind === "PARTNER_SERVICE" && v.competenceDate !== undefined) {
      fields.push("competenceDate");
      if (!date(v.competenceDate)) throw new Error("INVALID_COMMAND");
    }
  } else if (v.action === "PREVIEW") {
    fields.push(
      "partnerId",
      "modelId",
      "modelVersion",
      "amount",
      "competenceDate",
      "serviceDate",
    );
    if (
      !uuid.test(String(v.partnerId)) || !uuid.test(String(v.modelId)) ||
      !Number.isInteger(v.modelVersion) ||
      Number(v.modelVersion) < 1 || Number(v.modelVersion) > 2147483647 ||
      typeof v.amount !== "string" ||
      !/^(?:0|[1-9]\d{0,12})\.\d{2}$/.test(v.amount) || Number(v.amount) <= 0 ||
      !date(v.competenceDate) || !date(v.serviceDate)
    ) throw new Error("INVALID_COMMAND");
  } else {
    fields.push("previewId");
    if (!uuid.test(String(v.previewId))) throw new Error("INVALID_COMMAND");
    if (v.action === "ISSUE" || v.action === "CANCEL" || v.action === "RETRY_CANCEL") {
      fields.push("confirmed");
      if (v.confirmed !== true) throw new Error("INVALID_COMMAND");
    }
    if (v.action === "CANCEL_PREVIEW") {
      if ("cancellationModel" in v) {
        fields.push("cancellationModel", "detail");
        if (!object(v.cancellationModel) || Object.keys(v.cancellationModel).sort().join(",") !== "id,version" ||
          typeof v.cancellationModel.id !== "string" ||
          (!uuid.test(v.cancellationModel.id) && !/^SYSTEM:[A-Z_]{1,80}$/.test(v.cancellationModel.id)) ||
          !Number.isInteger(v.cancellationModel.version) || Number(v.cancellationModel.version) < 1 ||
          Number(v.cancellationModel.version) > 2147483647 ||
          (v.detail !== null && (typeof v.detail !== "string" || !v.detail.trim() || v.detail.length > 255 ||
            invalidFinalText(v.detail)))) throw new Error("INVALID_COMMAND");
      } else {
        fields.push("reasonCode", "justification");
        if (v.reasonCode !== "1" || typeof v.justification !== "string" || v.justification.trim().length < 15 ||
          v.justification.trim().length > 255 || invalidFinalText(v.justification)) throw new Error("INVALID_COMMAND");
      }
    } else if (["CANCEL", "RECONCILE_CANCEL", "RETRY_CANCEL", "OBSERVE_CANCEL"].includes(String(v.action))) {
      fields.push("cancelPreviewId");
      if (!uuid.test(String(v.cancelPreviewId))) {
        throw new Error("INVALID_COMMAND");
      }
      if (v.action === "RETRY_CANCEL") {
        fields.push("retryRequestId");
        if (!uuid.test(String(v.retryRequestId))) throw new Error("INVALID_COMMAND");
      }
    } else if (!["ISSUE", "RECONCILE", "OBSERVE"].includes(String(v.action))) {
      throw new Error("INVALID_COMMAND");
    }
  }
  if (
    Object.keys(v).some((key) => !fields.includes(key)) ||
    fields.some((key) => !(key in v))
  ) throw new Error("INVALID_COMMAND");
  return v as unknown as IndividualCommand;
}
export async function readIndividualCommand(
  req: Request,
): Promise<IndividualCommand> {
  if (
    !req.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    ) || !req.body ||
    Number(req.headers.get("content-length")) > 8192
  ) throw new Error("INVALID_COMMAND");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) throw new Error("INVALID_COMMAND");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return parseIndividualCommand(
    JSON.parse(new globalThis.TextDecoder().decode(bytes)),
  );
}
