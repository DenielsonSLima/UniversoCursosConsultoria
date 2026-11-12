import { type IndividualCommand, readIndividualCommand } from "./contract.ts";
import { cancellationRetryProof } from "./cancellation-retry.ts";
export interface IndividualRow {
  previewId: string;
  expiresAt: string;
  state: string;
  dispatch: boolean;
  snapshot: Record<string, unknown>;
  series: string;
  number: string;
  issuedAt: string;
  dpsId: string | null;
  fiscalInput: unknown;
  signedDpsXml: string | null;
  result: Record<string, unknown> | null;
  configurationVersion: number;
  certificateFingerprint: string;
  authorizedXml: string | null;
  cancelPreviewId?: string | null;
}
export interface CancellationRow {
  previewId: string;
  cancelPreviewId: string;
  expiresAt: string;
  state: string;
  dispatch: boolean;
  accessKey: string;
  number: string;
  reasonCode: "1" | "2" | "9";
  justification: string;
  cancellationModel?: Record<string, unknown> | null;
  detail?: string | null;
  retryAvailableAt?: string | null;
  retryUsed?: boolean;
  eventReferenceId: string;
  occurredAt: string;
  issuerCnpj: string;
  eventInput: unknown;
  signedEventXml: string | null;
  result: Record<string, unknown> | null;
}
export interface IndividualDependencies {
  authorize(req: Request, command: IndividualCommand): Promise<string>;
  ledger(
    command: IndividualCommand,
    actor: string,
    action:
      | "PREVIEW"
      | "PREVIEW_QUEUE"
      | "READ"
      | "PREPARE"
      | "CLAIM"
      | "FINISH",
    input?: unknown,
  ): Promise<IndividualRow>;
  cancellation(
    command: IndividualCommand,
    actor: string,
    action: "PREVIEW" | "READ" | "PREPARE" | "CLAIM" | "RETRY_CLAIM" | "FINISH",
    input?: unknown,
  ): Promise<CancellationRow>;
  prepare(
    command: IndividualCommand,
    actor: string,
    row: IndividualRow,
  ): Promise<{ fiscalInput: unknown; dpsId: string; signedDpsXml: string }>;
  execute(
    command: IndividualCommand,
    actor: string,
    row: IndividualRow,
    reconcile: boolean,
  ): Promise<Record<string, unknown>>;
  prepareCancellation(
    command: IndividualCommand,
    actor: string,
    row: CancellationRow,
  ): Promise<
    { eventInput: unknown; eventReferenceId: string; signedEventXml: string }
  >;
  executeCancellation(
    command: IndividualCommand,
    actor: string,
    row: CancellationRow,
    reconcile: boolean,
  ): Promise<Record<string, unknown>>;
  capability(
    command: IndividualCommand,
    actor: string,
    row: IndividualRow | CancellationRow,
  ): Promise<{ available: boolean; reason: string | null }>;
  payload(row: IndividualRow): Record<string, unknown>;
  respond(req: Request, body: unknown, status: number): Response;
  rateLimited(req: Request, command: IndividualCommand, actor: string): boolean;
}
const terminalIssue = ["AUTHORIZED", "REJECTED", "BLOCKED"];
const terminalCancel = [
  "CANCELLED",
  "CANCELLATION_REJECTED",
  "AWAITING_ANALYSIS",
  "BLOCKED",
];
const resultText = (
  row: { state: string; result: Record<string, unknown> | null },
) =>
  typeof row.result?.message === "string"
    ? row.result.message
    : "Consulte esta mesma operação antes de qualquer nova tentativa.";
function publicCodes(result: Record<string, unknown> | null): string[] {
  return Array.isArray(result?.codes)
    ? result.codes.filter((code): code is string =>
      typeof code === "string" && /^[A-Z0-9_-]{1,32}$/.test(code)
    ).slice(0, 100)
    : [];
}
/** HTTP exposes only canonical review fields and sanitized status. All signed XML stays server-side. */
export function createIndividualHandler(deps: IndividualDependencies) {
  return async (req: Request) => {
    if (req.method !== "POST") {
      return deps.respond(req, { error: "METHOD_NOT_ALLOWED" }, 405);
    }
    let command: IndividualCommand;
    try {
      command = await readIndividualCommand(req);
    } catch {
      return deps.respond(req, { error: "INVALID_INDIVIDUAL_COMMAND" }, 400);
    }
    let actor: string;
    try {
      actor = await deps.authorize(req, command);
    } catch {
      return deps.respond(req, { error: "INDIVIDUAL_SCOPE_DENIED" }, 403);
    }
    if (deps.rateLimited(req, command, actor)) {
      return deps.respond(req, { error: "RATE_LIMITED" }, 429);
    }
    const respond = (data: unknown) =>
      deps.respond(req, { version: 1, scope: command.scope, data }, 200);
    const publicIssue = (row: IndividualRow) => ({
      previewId: row.previewId,
      ...(command.action === "OBSERVE" ? { cancelPreviewId: row.cancelPreviewId ?? null } : {}),
      state: row.state === "PROCESSING" ? "AWAITING_CONFIRMATION" : row.state,
      message: resultText(row),
      codes: publicCodes(row.result),
      payload: deps.payload(row),
      ...(typeof row.result?.number === "string"
        ? { number: row.result.number }
        : {}),
      ...(typeof row.result?.accessKey === "string"
        ? { accessKey: row.result.accessKey }
        : {}),
    });
    const publicCancel = (row: CancellationRow) => ({
      previewId: row.previewId,
      cancelPreviewId: row.cancelPreviewId,
      state: row.state === "PROCESSING" ? "CANCELLATION_PENDING" : row.state,
      message: resultText(row),
      codes: publicCodes(row.result),
      payload: {
        number: row.number,
        accessKey: row.accessKey,
        reasonCode: row.reasonCode,
        justification: row.justification,
        cancellationModel: row.cancellationModel ?? null,
        detail: row.detail ?? null,
      },
      retry: { availableAt: row.retryAvailableAt ?? null, used: row.retryUsed ?? false },
    });
    try {
      if (command.action === "PREVIEW" || command.action === "PREVIEW_QUEUE") {
        const row = await deps.ledger(command, actor, command.action);
        return respond({
          previewId: row.previewId,
          expiresAt: row.expiresAt,
          state: row.state,
          payload: deps.payload(row),
          capability: await deps.capability(command, actor, row),
        });
      }
      if (command.action === "ISSUE" || command.action === "RECONCILE" || command.action === "OBSERVE") {
        let row = await deps.ledger(command, actor, "READ");
        if (terminalIssue.includes(row.state)) return respond(publicIssue(row));
        if (command.action === "OBSERVE") {
          return respond(row.state === "PREVIEWED" ? { ...publicIssue(row), expiresAt: row.expiresAt } : publicIssue(row));
        }
        if (command.action === "RECONCILE" && row.state === "PREVIEWED") {
          return respond({
            ...publicIssue(row),
            expiresAt: row.expiresAt,
            capability: await deps.capability(command, actor, row),
          });
        }
        if (command.action === "ISSUE" && row.state === "PREVIEWED") {
          const capability = await deps.capability(command, actor, row);
          if (!capability.available) {
            return respond({ ...publicIssue(row), capability });
          }
          if (!row.signedDpsXml) {
            row = await deps.ledger(
              command,
              actor,
              "PREPARE",
              await deps.prepare(command, actor, row),
            );
          }
          row = await deps.ledger(command, actor, "CLAIM");
        }
        const reconcile = command.action === "RECONCILE" || !row.dispatch;
        let result = await deps.execute(command, actor, row, reconcile);
        if (reconcile && result.state === "BLOCKED") {
          result = { ...result, state: "AWAITING_CONFIRMATION" };
        }
        row = await deps.ledger(command, actor, "FINISH", {
          ...result,
          dpsId: row.dpsId,
          message: issueMessage(result),
        });
        return respond(publicIssue(row));
      }
      if (command.action === "CANCEL_PREVIEW") {
        const row = await deps.cancellation(command, actor, "PREVIEW", command.cancellationModel
          ? { cancellationModel: command.cancellationModel, detail: command.detail }
          : { reasonCode: command.reasonCode, justification: command.justification });
        return respond({
          ...publicCancel(row),
          expiresAt: row.expiresAt,
          capability: await deps.capability(command, actor, row),
        });
      }
      let row = await deps.cancellation(command, actor, "READ");
      if (command.action === "OBSERVE_CANCEL") {
        return respond(row.state === "PREVIEWED" ? { ...publicCancel(row), expiresAt: row.expiresAt } : publicCancel(row));
      }
      if (terminalCancel.includes(row.state) && !(command.action === "RECONCILE_CANCEL" && row.state === "AWAITING_ANALYSIS")) return respond(publicCancel(row));
      if (command.action === "RECONCILE_CANCEL" && row.state === "PREVIEWED") {
        return respond({
          ...publicCancel(row),
          expiresAt: row.expiresAt,
          capability: await deps.capability(command, actor, row),
        });
      }
      if (command.action === "RETRY_CANCEL") {
        if (row.state !== "CANCELLATION_PENDING") return respond({ ...publicCancel(row), capability: {
          available: false, reason: "MANUAL_RETRY_REQUIRES_PENDING_EVENT" } });
        let probe = await deps.executeCancellation(command, actor, row, true);
        if (probe.state === "BLOCKED") probe = { ...probe, state: "CANCELLATION_PENDING" };
        const proof = await cancellationRetryProof(row, probe, command.retryRequestId!);
        if (!proof) {
          row = await deps.cancellation(command, actor, "FINISH", { ...probe, accessKey: row.accessKey, message: cancelMessage(probe) });
          return respond(publicCancel(row));
        }
        row = await deps.cancellation(command, actor, "RETRY_CLAIM", proof);
      }
      if (command.action === "CANCEL" && row.state === "PREVIEWED") {
        const capability = await deps.capability(command, actor, row);
        if (!capability.available) {
          return respond({ ...publicCancel(row), capability });
        }
        if (!row.signedEventXml) {
          row = await deps.cancellation(
            command,
            actor,
            "PREPARE",
            await deps.prepareCancellation(command, actor, row),
          );
        }
        row = await deps.cancellation(command, actor, "CLAIM");
      }
      const reconcile = command.action === "RECONCILE_CANCEL" || !row.dispatch;
      let result = await deps.executeCancellation(
        command,
        actor,
        row,
        reconcile,
      );
      if ((reconcile || command.action === "RETRY_CANCEL") && result.state === "BLOCKED") {
        result = { ...result, state: "CANCELLATION_PENDING" };
      }
      row = await deps.cancellation(command, actor, "FINISH", {
        ...result,
        accessKey: row.accessKey,
        message: cancelMessage(result),
      });
      return respond(publicCancel(row));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "INDIVIDUAL_OPERATION_SCOPE_DENIED") {
        return deps.respond(req, { error: "INDIVIDUAL_OPERATION_SCOPE_DENIED" }, 403);
      }
      return deps.respond(
        req,
        { error: "INDIVIDUAL_OPERATION_UNCONFIRMED" },
        503,
      );
    }
  };
}
function issueMessage(result: Record<string, unknown>) {
  if (result.state === "AUTHORIZED") return "NFS-e autorizada em produção.";
  if (result.state === "REJECTED") {
    return "Emissão rejeitada pelo ambiente fiscal. Confira os códigos de retorno.";
  }
  if (result.state === "BLOCKED") {
    return "Emissão bloqueada antes da transmissão.";
  }
  return "Acompanhando automaticamente o retorno desta mesma DPS, sem reenviar a emissão.";
}
function cancelMessage(result: Record<string, unknown>) {
  if (result.state === "CANCELLED") {
    return "Cancelamento confirmado por evento fiscal autorizado.";
  }
  if (result.state === "CANCELLATION_REJECTED") {
    return "Cancelamento rejeitado pelo ambiente fiscal.";
  }
  if (result.state === "BLOCKED") {
    return "Cancelamento bloqueado antes da transmissão.";
  }
  return "Acompanhando automaticamente os eventos de cancelamento desta mesma nota.";
}
