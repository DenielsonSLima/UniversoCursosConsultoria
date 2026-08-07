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

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PASSWORD_REQUIREMENTS_ERROR =
  "A senha precisa ter ao menos 8 caracteres, 1 letra maiúscula, 1 letra minúscula e 1 número.";

const isStrongGestorPassword = (password: string) =>
  password.length >= 8 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /\d/.test(password);

const onlyDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

const isValidCpf = (value: unknown) => {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
};

const findGestorIdentityConflict = async (admin: any, authUserId: string) => {
  let partnerResult: any;
  let systemUserResult: any;
  try {
    [partnerResult, systemUserResult] = await Promise.all([
      admin
        .from("parceiros")
        .select("id, cpf_cnpj, email")
        .eq("auth_user_id", authUserId)
        .limit(1),
      admin
        .from("usuarios_sistema")
        .select("id")
        .eq("auth_user_id", authUserId)
        .limit(1),
    ]);
  } catch (error) {
    return {
      error: error instanceof Error
        ? error.message
        : "Não foi possível validar os vínculos da identidade de acesso.",
      conflict: null,
      partner: null,
    };
  }

  const queryError = partnerResult.error || systemUserResult.error;
  if (queryError) {
    return {
      error: queryError.message ||
        "Não foi possível validar os vínculos da identidade de acesso.",
      conflict: null,
      partner: null,
    };
  }

  if (partnerResult.data?.length) {
    return {
      error: null,
      conflict:
        "Este e-mail já está vinculado ao acesso de um aluno ou professor.",
      partner: partnerResult.data[0],
    };
  }

  if (systemUserResult.data?.length) {
    return {
      error: null,
      conflict:
        "Já existe um usuário interno vinculado a este e-mail. Edite o cadastro existente.",
      partner: null,
    };
  }

  return {
    error: null,
    conflict: null,
    partner: partnerResult.data?.[0] || null,
  };
};

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
  const name = String(incomingUser.nome || "").trim();
  const password = String(passwordInput || "");
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

  if (name.length < 3) {
    return json(
      { success: false, error: "Nome do usuário é obrigatório." },
      400,
    );
  }
  if (!email || !EMAIL_PATTERN.test(email)) {
    return json(
      { success: false, error: "Informe um e-mail válido para o usuário." },
      400,
    );
  }
  if (!formattedPhone) {
    return json({
      success: false,
      error: "Informe o telefone com DDD no formato (00) 00000-0000.",
    }, 400);
  }
  if (!isValidCpf(incomingUser.cpf)) {
    return json({
      success: false,
      error: "Informe um CPF válido para o usuário.",
    }, 400);
  }
  if (!isStrongGestorPassword(password)) {
    return json({
      success: false,
      error: PASSWORD_REQUIREMENTS_ERROR,
    }, 400);
  }

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
  let createdAuthUserId: string | null = null;
  let reusedPartnerIdentity = false;
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
          nome: name,
          origem: "usuarios_sistema",
        },
      });

    if (createAuthError) {
      return json({ success: false, error: createAuthError.message }, 500);
    }

    authUser = createdAuth?.user || null;
    createdAuthUserId = authUser?.id || null;
  } else {
    const identityConflict = await findGestorIdentityConflict(
      admin,
      authUser.id,
    );
    if (identityConflict.error) {
      return json({ success: false, error: identityConflict.error }, 500);
    }
    if (identityConflict.conflict && !identityConflict.partner) {
      return json({ success: false, error: identityConflict.conflict }, 409);
    }
    if (identityConflict.partner) {
      const informedCpf = onlyDigits(incomingUser.cpf);
      const partnerCpf = onlyDigits(identityConflict.partner.cpf_cnpj);
      if (!informedCpf || informedCpf !== partnerCpf) {
        return json({
          success: false,
          error:
            "O e-mail já pertence a um aluno ou professor, mas o CPF informado não confere com esse cadastro.",
        }, 409);
      }
      reusedPartnerIdentity = true;
    } else {
      return json({
        success: false,
        error:
          "Já existe uma identidade de acesso para este e-mail sem cadastro interno. Regularize essa identidade antes de criar o usuário.",
      }, 409);
    }
  }

  if (!authUser?.id) {
    return json({
      success: false,
      error: "O Auth não retornou a identidade criada para o usuário.",
    }, 500);
  }

  const isFinanceiro = effectivePermissions.modules.includes("financeiro") ||
    effectivePermissions.modules.includes("caixa");
  const isGestor = effectivePermissions.modules.includes("configuracoes") ||
    effectivePermissions.modules.includes("relatorios");
  const userPayload = {
    nome: name,
    email,
    auth_user_id: authUser.id,
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

  const { data: savedUser, error: saveUserError } = await admin
    .from("usuarios_sistema")
    .insert(userPayload)
    .select(
      "id, nome, email, auth_user_id, cpf, telefone, perfil, status, context, polo_ids, permissoes, perfil_acesso_id, personalizar_permissoes, restricao_horario, setor_comunicacao, polo_comunicacao_id, pode_visualizar_todos_polos, pode_visualizar_todos_setores, created_at",
    )
    .single();

  if (saveUserError) {
    if (createdAuthUserId) {
      let rollbackError: unknown;
      try {
        const rollbackResult = await admin.auth.admin.deleteUser(
          createdAuthUserId,
        );
        rollbackError = rollbackResult?.error || null;
      } catch (error) {
        rollbackError = error;
      }
      if (rollbackError) {
        return json({
          success: false,
          error:
            "O cadastro interno falhou e a identidade de acesso recém-criada não pôde ser revertida. Regularize este e-mail no Auth antes de tentar novamente.",
        }, 500);
      }
    }
    if (saveUserError.code === "23505") {
      return json({
        success: false,
        error:
          "Já existe um usuário interno com este e-mail, CPF ou identidade de acesso.",
      }, 409);
    }
    return json({ success: false, error: saveUserError.message }, 500);
  }

  return json({
    success: true,
    action: "upsert-gestor-user",
    userId: authUser?.id || null,
    user: savedUser,
    message: reusedPartnerIdentity
      ? "Usuário cadastrado e vinculado ao acesso existente. A senha atual foi preservada."
      : "Usuário cadastrado com acesso ao portal.",
  });
};
