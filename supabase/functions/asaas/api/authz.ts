import {
  bearerTokenFromRequest,
  GestorAutorizado,
  requireGestorAtivo as requireSharedGestorAtivo,
  requireGestorForPolo as requireSharedGestorForPolo,
  requireGestorTab,
} from "../../_shared/authz.ts";

export type { GestorAutorizado };
export { bearerTokenFromRequest };

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

const resolveFinanceiroTabs = (gestor: GestorAutorizado) => {
  const legacy = (gestor.financeiroTabs || []).map((tab) => String(tab || "").trim()).filter(Boolean);
  const scoped = Object.prototype.hasOwnProperty.call(gestor.tabs, "financeiro")
    ? (Array.isArray(gestor.tabs.financeiro) ? gestor.tabs.financeiro : [])
    : [];
  const normalize = (values: string[]) =>
    [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
  const scopedTabs = normalize(scoped);

  if (!scopedTabs.length) return normalize(legacy);
  if (scopedTabs.includes("receber") && legacy.includes("receber") && !scopedTabs.includes("conciliacao-bancaria")) {
    return normalize([...scopedTabs, "conciliacao-bancaria"]);
  }
  return scopedTabs;
};

export const requireGestorAtivo = (
  req: Request,
  admin: any,
): Promise<GestorAutorizado> => requireSharedGestorAtivo(req, admin);

export const requireGestorGlobal = (gestor: GestorAutorizado) => {
  if (!gestor.isGlobal || normalize(gestor.perfil) !== "gestor") {
    throw new Error(
      "Apenas gestor global pode alterar a configuracao do Asaas.",
    );
  }
};

export const requireFinanceWriteAccess = (gestor: GestorAutorizado) => {
  if (
    !["gestor", "financeiro"].includes(normalize(gestor.perfil)) ||
    !gestor.modules.includes("financeiro")
  ) {
    throw new Error(
      "Usuario sem permissao para executar movimentacoes no modulo financeiro.",
    );
  }
};

export const requireReceivablesSettlementAccess = (
  gestor: GestorAutorizado,
) => {
  const canUseFinance =
    ["gestor", "financeiro"].includes(normalize(gestor.perfil)) &&
    gestor.modules.includes("financeiro") &&
    resolveFinanceiroTabs(gestor).includes("receber");
  const canUseSecretaria = gestor.modules.includes("secretaria") &&
    gestor.tabs.secretaria?.includes("recebimentos");
  if (!canUseFinance && !canUseSecretaria) {
    throw new Error(
      "Usuario sem permissao para registrar baixa de recebimento.",
    );
  }
};

export const requireOtherCreditsWriteAccess = (gestor: GestorAutorizado) => {
  requireFinanceWriteAccess(gestor);
  requireGestorTab(gestor, "financeiro", "outros-creditos");
};

export const requireGestorForPolo = requireSharedGestorForPolo;
