import type { GestorAutorizado } from "./authz.ts";
import { settleReceivableManually } from "./manual-settlement.service.ts";
import type {
  AsaasRuntime,
  ManualSettlementResult,
  ManualSettlementServiceDependencies,
} from "./manual-settlement.types.ts";

export interface ManualSettlementActionInput {
  admin: any;
  actor: GestorAutorizado | null;
  body: Record<string, unknown>;
  requirePoloAccess: ManualSettlementServiceDependencies["requirePoloAccess"];
  getAsaasRuntime: (receivable: any) => Promise<AsaasRuntime>;
  syncFutureInstallments: NonNullable<
    ManualSettlementServiceDependencies["syncFutureInstallments"]
  >;
}

export const executeManualSettlementAction = async (
  input: ManualSettlementActionInput,
  settle: (
    dependencies: ManualSettlementServiceDependencies,
  ) => Promise<ManualSettlementResult> = settleReceivableManually,
) => {
  if (!input.actor) {
    throw new Error("Autenticação interna obrigatória para baixa manual.");
  }
  return await settle({
    admin: input.admin,
    actor: input.actor,
    body: input.body,
    requirePoloAccess: input.requirePoloAccess,
    getAsaasRuntime: input.getAsaasRuntime,
    syncFutureInstallments: input.syncFutureInstallments,
  });
};
