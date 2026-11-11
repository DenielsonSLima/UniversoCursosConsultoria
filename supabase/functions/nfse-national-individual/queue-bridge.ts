import type { IndividualCommand } from "./contract.ts";
import type {
  CancellationRow,
  IndividualDependencies,
  IndividualRow,
} from "./handler.ts";
type Data = Record<string, unknown>;
type Rpc = (name: string, args: Data, code: string) => Promise<unknown>;
const scope = (command: IndividualCommand, actor: string) => ({
  p_actor_id: actor,
  p_context_key: command.scope.contextKey,
  p_polo_id: command.scope.poloId,
  p_environment: command.scope.environment,
  p_month: command.scope.month,
});
export function queuePreviewInput(command: IndividualCommand): Data {
  return {
    source: command.source,
    ...(command.competenceDate === undefined
      ? {}
      : { competenceDate: command.competenceDate }),
  };
}
export function createIndividualLedgerAccess(
  rpc: Rpc,
): Pick<IndividualDependencies, "ledger" | "cancellation"> {
  return {
    async ledger(command, actor, action, input) {
      const preview = action === "PREVIEW" || action === "PREVIEW_QUEUE";
      const legacy = {
        partnerId: command.partnerId,
        modelId: command.modelId,
        modelVersion: command.modelVersion,
        amount: command.amount,
        competenceDate: command.competenceDate,
        serviceDate: command.serviceDate,
      };
      return await rpc("nfse_individual_operation_internal", {
        ...scope(command, actor),
        p_request_id: command.requestId,
        p_action: action,
        p_preview_id: preview ? null : command.previewId,
        p_input: action === "PREVIEW_QUEUE"
          ? queuePreviewInput(command)
          : action === "PREVIEW"
          ? legacy
          : input ?? null,
      }, "PRODUCTION_LEDGER_UNAVAILABLE") as IndividualRow;
    },
    async cancellation(command, actor, action, input) {
      return await rpc("nfse_individual_cancellation_internal", {
        ...scope(command, actor),
        p_request_id: command.requestId,
        p_action: action,
        p_preview_id: command.previewId,
        p_cancel_preview_id: action === "PREVIEW"
          ? null
          : command.cancelPreviewId,
        p_input: input ?? null,
      }, "PRODUCTION_CANCELLATION_LEDGER_UNAVAILABLE") as CancellationRow;
    },
  };
}
