import { findAuthUserByEmail, normalizeEmail } from "../auth-users.ts";
import { getGestorScope } from "../gestor-access.ts";
import {
  gestorHasModule,
  normalizePermissionsPayload,
  normalizeStringArray,
} from "../permissions.ts";
import type { HandlerContext } from "../types.ts";

const COMMUNICATION_SECTORS = new Set([
  "todos",
  "pedagogico_coordenacao",
  "financeiro",
  "comercial_matriculas",
  "secretaria",
  "atendimento_geral",
]);

export const handleUpsertGestorUser = async (
  context: HandlerContext,
  incomingUser: Record<string, unknown>,
  passwordInput?: string | null,
) => {
  const { admin, gestor, json } = context;
  const scope = await getGestorScope(admin, gestor);
  if (!scope.global || !gestorHasModule(gestor, "configuracoes")) {
    return json({
      success: false,
      error:
        "Apenas gestor global com acesso a Configurações pode criar usuários.",
    }, 403);
  }

  const email = normalizeEmail(incomingUser.email as string | null);
  const password = String(passwordInput || "").trim();
  const phoneDigits = String(incomingUser.telefone || "")
    .replace(/\D/g, "")
    .slice(0, 11);
  const formattedPhone = phoneDigits.length === 11
    ? `(${phoneDigits.slice(0, 2)}) ${phoneDigits.slice(2, 7)}-${
      phoneDigits.slice(7)
    }`
    : "";
  const permissions = normalizePermissionsPayload(incomingUser.permissoes);
  const perfilAcessoId = typeof incomingUser.perfil_acesso_id === "string" &&
      incomingUser.perfil_acesso_id.trim().length > 0
    ? incomingUser.perfil_acesso_id
    : null;
  const personalizarPermissoes = Boolean(
    incomingUser.personalizar_permissoes && perfilAcessoId,
  );
  const allPolos = permissions.allPolos;
  const poloIds = allPolos ? [] : normalizeStringArray(incomingUser.polo_ids);
  const canViewAllCommunication = incomingUser.pode_visualizar_todos_setores ===
    true;
  const canViewAllCommunicationPolos = canViewAllCommunication ||
    incomingUser.pode_visualizar_todos_polos === true;
  const communicationSector = String(
    incomingUser.setor_comunicacao || "todos",
  ).trim();
  const communicationPoloId = canViewAllCommunicationPolos
    ? null
    : String(incomingUser.polo_comunicacao_id || "").trim() || null;
  let profilePermissions:
    | ReturnType<typeof normalizePermissionsPayload>
    | null = null;

  if (perfilAcessoId) {
    const { data: accessProfile, error: accessProfileError } = await admin
      .from("perfis_acesso")
      .select("id, permissoes")
      .eq("id", perfilAcessoId)
      .maybeSingle();
    if (accessProfileError || !accessProfile) {
      return json({
        success: false,
        error: "Perfil de acesso inválido ou inexistente.",
      }, 400);
    }
    profilePermissions = normalizePermissionsPayload(accessProfile.permissoes);
  }

  const effectivePermissions = profilePermissions && !personalizarPermissoes
    ? profilePermissions
    : permissions;

  if (!email) {
    return json(
      { success: false, error: "E-mail do usuário é obrigatório." },
      400,
    );
  }
  if (!formattedPhone) {
    return json({
      success: false,
      error: "Informe o telefone com DDD no formato (00) 00000-0000.",
    }, 400);
  }

  if (password.length < 6) {
    return json({
      success: false,
      error: "A senha precisa ter ao menos 6 caracteres.",
    }, 400);
  }

  if (!allPolos && poloIds.length === 0) {
    return json({
      success: false,
      error: "Selecione ao menos um polo para o usuário.",
    }, 400);
  }

  if (effectivePermissions.modules.length === 0) {
    return json({
      success: false,
      error: "Selecione ao menos um módulo para o usuário.",
    }, 400);
  }
  if (!COMMUNICATION_SECTORS.has(communicationSector)) {
    return json({
      success: false,
      error: "Setor de atendimento WhatsApp inválido.",
    }, 400);
  }
  if (
    effectivePermissions.modules.includes("comunicacao") &&
    effectivePermissions.tabs?.comunicacao?.includes("comunicacao-whatsapp") &&
    !canViewAllCommunication &&
    !canViewAllCommunicationPolos &&
    !communicationPoloId
  ) {
    return json({
      success: false,
      error: "Selecione o polo de atendimento WhatsApp do usuário.",
    }, 400);
  }

  if (
    effectivePermissions.modules.includes("financeiro") &&
    effectivePermissions.financeiroTabs.length === 0
  ) {
    return json({
      success: false,
      error: "Selecione ao menos uma aba financeira.",
    }, 400);
  }

  let authUser: any;
  let createdAuthUser = false;
  try {
    authUser = await findAuthUserByEmail(admin, email);
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error
        ? error.message
        : "Não foi possível localizar usuário no Supabase Auth.",
    }, 500);
  }

  if (!authUser?.id) {
    const { data: createdAuth, error: createAuthError } = await admin.auth.admin
      .createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nome: incomingUser.nome,
          origem: "usuarios_sistema",
        },
      });

    if (createAuthError) {
      return json({ success: false, error: createAuthError.message }, 500);
    }

    authUser = createdAuth?.user || null;
    createdAuthUser = Boolean(authUser?.id);
  }

  const isFinanceiro = effectivePermissions.modules.includes("financeiro") ||
    effectivePermissions.modules.includes("caixa");
  const isGestor = effectivePermissions.modules.includes("configuracoes") ||
    effectivePermissions.modules.includes("relatorios");
  const userPayload = {
    nome: String(incomingUser.nome || "").trim(),
    email,
    cpf: incomingUser.cpf ? String(incomingUser.cpf) : null,
    telefone: formattedPhone,
    perfil: isGestor ? "Gestor" : isFinanceiro ? "Financeiro" : "Operacional",
    status: String(incomingUser.status || "Ativo").trim(),
    context: String(incomingUser.context || "global").trim(),
    polo_ids: poloIds,
    permissoes: permissions,
    perfil_acesso_id: perfilAcessoId,
    personalizar_permissoes: personalizarPermissoes,
    restricao_horario: incomingUser.restricao_horario || null,
    setor_comunicacao: communicationSector,
    polo_comunicacao_id: communicationPoloId,
    pode_visualizar_todos_polos: canViewAllCommunicationPolos,
    pode_visualizar_todos_setores: canViewAllCommunication,
  };

  if (!userPayload.nome) {
    return json(
      { success: false, error: "Nome do usuário é obrigatório." },
      400,
    );
  }

  const { data: savedUser, error: saveUserError } = await admin
    .from("usuarios_sistema")
    .insert(userPayload)
    .select(
      "id, nome, email, cpf, telefone, perfil, status, context, polo_ids, permissoes, perfil_acesso_id, personalizar_permissoes, restricao_horario, setor_comunicacao, polo_comunicacao_id, pode_visualizar_todos_polos, pode_visualizar_todos_setores, created_at",
    )
    .single();

  if (saveUserError) {
    if (createdAuthUser && authUser?.id) {
      await admin.auth.admin.deleteUser(authUser.id).catch(() => undefined);
    }
    return json({ success: false, error: saveUserError.message }, 500);
  }

  return json({
    success: true,
    action: "upsert-gestor-user",
    userId: authUser?.id || null,
    user: savedUser,
    message: authUser?.id
      ? "Acesso de gestor cadastrado; as credenciais já existentes foram preservadas."
      : "Usuário cadastrado com acesso ao portal.",
  });
};
