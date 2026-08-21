import {
  isActiveGestor,
  isScheduleAllowed,
  isUuid,
  normalizePermissionsPayload,
  normalizeStringArray,
  resolveEffectiveGestor,
} from "./permissions.ts";
import type { JsonResponder, Partner } from "./types.ts";

export const ensureAuthorizedGestor = async (
  admin: any,
  bearer: string | null,
) => {
  if (!bearer) {
    return { authorized: false, error: "Não autenticado." };
  }

  const { data: authData, error: authError } = await admin.auth.getUser(bearer);
  if (authError || !authData?.user?.id || !authData.user.email) {
    return {
      authorized: false,
      error: "Sessão inválida para executar esta ação.",
    };
  }

  const { data: gestor, error: gestorError } = await admin
    .from("usuarios_sistema")
    .select(
      "id, auth_user_id, nome, email, status, context, polo_ids, permissoes, perfil_acesso_id, personalizar_permissoes, restricao_horario, perfis_acesso(permissoes, restricao_horario)",
    )
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  if (gestorError || !gestor || !isActiveGestor(gestor.status)) {
    return {
      authorized: false,
      error: "Acesso restrito para administradores.",
    };
  }

  const effectiveGestor = resolveEffectiveGestor(gestor);
  if (!isScheduleAllowed(effectiveGestor.restricao_horario)) {
    return {
      authorized: false,
      error: "Acesso fora dos dias ou horários permitidos.",
    };
  }

  return {
    authorized: true,
    gestor: effectiveGestor,
    gestorEmail: authData.user.email.toLowerCase(),
  };
};

export const getGestorScope = async (admin: any, gestor: any) => {
  const context = String(gestor?.context || "").trim();
  const permissions = normalizePermissionsPayload(gestor?.permissoes);
  const explicitPoloIds = normalizeStringArray(gestor?.polo_ids);
  if (!context || context.toLowerCase() === "global") {
    return {
      global: permissions.allPolos && explicitPoloIds.length === 0,
      poloId: explicitPoloIds[0] || null,
      allowedPoloIds: explicitPoloIds,
    };
  }

  if (!isUuid(context)) {
    return { global: false, poloId: null, allowedPoloIds: explicitPoloIds };
  }

  const { data: polo } = await admin
    .from("polos")
    .select("id, is_matriz")
    .eq("id", context)
    .maybeSingle();

  return {
    global: Boolean(polo?.is_matriz) && permissions.allPolos &&
      explicitPoloIds.length === 0,
    poloId: context,
    allowedPoloIds: explicitPoloIds.length > 0 ? explicitPoloIds : [context],
  };
};

export const isPartnerAllowedByScope = (scope: any, partner: any) => {
  if (scope.global) return true;
  if (!scope.poloId) return false;

  const partnerPoloId = partner?.polo_id || null;
  const partnerPoloIds = Array.isArray(partner?.polo_ids)
    ? partner.polo_ids
    : [];
  const allowedPoloIds = Array.isArray(scope.allowedPoloIds)
    ? scope.allowedPoloIds
    : [];

  return allowedPoloIds.includes(partnerPoloId) ||
    partnerPoloIds.some((poloId: string) => allowedPoloIds.includes(poloId));
};

export const isPartnerInGestorScope = async (
  admin: any,
  gestor: any,
  partner: any,
) => {
  const scope = await getGestorScope(admin, gestor);
  return isPartnerAllowedByScope(scope, partner);
};

export const loadManagedPartner = async (
  admin: any,
  gestor: any,
  partnerId: string,
  json: JsonResponder,
): Promise<Partner | Response> => {
  if (!partnerId || !isUuid(partnerId)) {
    return json(
      { success: false, error: "partnerId válido é obrigatório." },
      400,
    );
  }

  const { data: partner, error: partnerError } = await admin
    .from("parceiros")
    .select(
      "id, tipo, nome, status, email, cpf_cnpj, auth_user_id, acesso_status, acesso_erro, convite_enviado_em, acesso_ativado_em, troca_senha_obrigatoria, matricula_acesso, auth_login_email, polo_id, polo_ids",
    )
    .eq("id", partnerId)
    .maybeSingle();

  if (partnerError) {
    return json({ success: false, error: partnerError.message }, 500);
  }

  if (!partner) {
    return json({ success: false, error: "Parceiro não encontrado." }, 404);
  }

  const canManagePartner = await isPartnerInGestorScope(admin, gestor, partner);
  if (!canManagePartner) {
    return json({
      success: false,
      error: "Você não tem permissão para gerenciar este parceiro.",
    }, 403);
  }

  return partner as Partner;
};
