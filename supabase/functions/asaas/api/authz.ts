import {
  bearerTokenFromRequest,
  GestorAutorizado,
  requireGestorAtivo as requireSharedGestorAtivo,
  requireGestorForPolo as requireSharedGestorForPolo,
} from "../../_shared/authz.ts";

export type { GestorAutorizado };
export { bearerTokenFromRequest };

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

export const requireGestorAtivo = (req: Request, admin: any): Promise<GestorAutorizado> =>
  requireSharedGestorAtivo(req, admin);

export const requireGestorGlobal = (gestor: GestorAutorizado) => {
  if (!gestor.isGlobal || normalize(gestor.perfil) !== "gestor") {
    throw new Error("Apenas gestor global pode alterar a configuracao do Asaas.");
  }
};

export const requireFinanceWriteAccess = (gestor: GestorAutorizado) => {
  if (!["gestor", "financeiro"].includes(normalize(gestor.perfil)) || !gestor.modules.includes("financeiro")) {
    throw new Error("Usuario sem permissao para executar movimentacoes no modulo financeiro.");
  }
};

export const requireReceivablesSettlementAccess = (gestor: GestorAutorizado) => {
  const canUseFinance = ["gestor", "financeiro"].includes(normalize(gestor.perfil))
    && gestor.modules.includes("financeiro")
    && (gestor.tabs.financeiro || gestor.financeiroTabs).includes("receber");
  const canUseSecretaria = gestor.modules.includes("secretaria")
    && gestor.tabs.secretaria?.includes("recebimentos");
  if (!canUseFinance && !canUseSecretaria) {
    throw new Error("Usuario sem permissao para registrar baixa de recebimento.");
  }
};

export const requireGestorForPolo = requireSharedGestorForPolo;
