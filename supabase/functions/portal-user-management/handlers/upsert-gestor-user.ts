import { findAuthUserByEmail, normalizeEmail } from "../auth-users.ts";
import { getGestorScope } from "../gestor-access.ts";
import {
  gestorHasModule,
  normalizePermissionsPayload,
  normalizeStringArray,
} from "../permissions.ts";
import { resolveRedirectTarget } from "../redirects.ts";
import type { HandlerContext } from "../types.ts";
import {
  buildGestorInviteOperationMetadata,
  hasValidGestorInviteOperationMarker,
  isLegacyPendingGestorInvite,
} from "./gestor-invite-reconciliation.ts";
import { findGestorIdentityConflict } from "./gestor-identity-links.ts";
import { checkGestorUserUniqueness } from "./gestor-user-preflight.ts";

const COMMUNICATION_SECTORS = new Set([
  "todos",
  "pedagogico_coordenacao",
  "financeiro",
  "comercial_matriculas",
  "secretaria",
  "atendimento_geral",
]);

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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

export const handleUpsertGestorUser = async (
  context: HandlerContext,
  incomingUser: Record<string, unknown>,
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

  const uniquenessConflict = await checkGestorUserUniqueness(
    admin,
    email,
    incomingUser.cpf,
  );
  if (uniquenessConflict) {
    return json({
      success: false,
      code: uniquenessConflict.code,
      error: uniquenessConflict.error,
    }, uniquenessConflict.status);
  }

  let authUser: any;
  let createdAuthUserId: string | null = null;
  let reusedPartnerIdentity = false;
  let reconciledPendingInvite = false;
  let institutionalInviteOperationId: string | null = null;

  const validateExistingIdentity = async (existingAuthUser: any) => {
    const identityConflict = await findGestorIdentityConflict(
      admin,
      existingAuthUser.id,
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
      return null;
    }

    let signedInviteIsValid: boolean;
    try {
      signedInviteIsValid = await hasValidGestorInviteOperationMarker(
        context,
        existingAuthUser,
        email,
        String(incomingUser.cpf || ""),
      );
    } catch {
      return json({
        success: false,
        code: "GESTOR_CONVITE_RECONCILIACAO_INDISPONIVEL",
        error:
          "A configuração segura de reconciliação do convite está indisponível.",
      }, 500);
    }
    if (
      signedInviteIsValid ||
      isLegacyPendingGestorInvite(existingAuthUser, email)
    ) {
      reconciledPendingInvite = true;
      institutionalInviteOperationId = String(
        existingAuthUser.user_metadata?.invite_operation_nonce || "",
      );
      return null;
    }

    return json({
      success: false,
      error:
        "Já existe uma identidade de acesso para este e-mail sem cadastro interno. Regularize essa identidade antes de criar o usuário.",
    }, 409);
  };

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
    // A rota /recuperar-senha já integra a allowlist hospedada do Auth.
    // O frontend identifica type=invite no retorno assinado e apresenta o
    // primeiro acesso institucional sem depender de uma nova configuração
    // remota de redirect.
    const redirectResolution = resolveRedirectTarget("/recuperar-senha");
    if (!redirectResolution.redirectTo) {
      return json({
        success: false,
        error: redirectResolution.error ||
          "Não foi possível preparar o link de primeiro acesso.",
      }, redirectResolution.status);
    }

    const invitationNonce = crypto.randomUUID();
    let invitationMetadata: Record<string, unknown>;
    try {
      invitationMetadata = await buildGestorInviteOperationMetadata(
        context,
        invitationNonce,
        email,
        String(incomingUser.cpf || ""),
        name,
      );
    } catch {
      return json({
        success: false,
        code: "GESTOR_CONVITE_RECONCILIACAO_INDISPONIVEL",
        error:
          "A configuração segura de reconciliação do convite está indisponível.",
      }, 500);
    }
    let inviteResult: any;
    try {
      inviteResult = await admin.auth.admin.inviteUserByEmail(email, {
        data: invitationMetadata,
        redirectTo: redirectResolution.redirectTo,
      });
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error
          ? error.message
          : "Não foi possível enviar o convite de primeiro acesso.",
      }, 500);
    }

    const invitedAuthUser = !inviteResult.error && inviteResult.data?.user
      ? inviteResult.data.user
      : null;
    if (invitedAuthUser) {
      // GoTrue pode reenviar convite para um Auth não confirmado já existente.
      // O marcador só é aceito quando a HMAC do banco comprova esta operação.
      let inviteMarkerIsValid: boolean;
      try {
        inviteMarkerIsValid = await hasValidGestorInviteOperationMarker(
          context,
          invitedAuthUser,
          email,
          String(incomingUser.cpf || ""),
        );
      } catch {
        return json({
          success: false,
          code: "GESTOR_CONVITE_RECONCILIACAO_INDISPONIVEL",
          error:
            "A configuração segura de reconciliação do convite está indisponível.",
        }, 500);
      }
      if (!inviteMarkerIsValid) {
        return json({
          success: false,
          code: "GESTOR_CONVITE_PROVA_INVALIDA",
          error:
            "Não foi possível comprovar que o convite criou uma nova identidade para este usuário. Regularize este e-mail antes de tentar novamente.",
        }, 409);
      }
      authUser = invitedAuthUser;
      createdAuthUserId = authUser?.id || null;
      institutionalInviteOperationId = invitationNonce;
    } else {
      // Uma requisição concorrente pode criar a mesma identidade entre a
      // consulta e o convite. Reconsultar impede que o retry gere duplicidade.
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
        return json({
          success: false,
          error: inviteResult.error?.message ||
            "Não foi possível enviar o convite de primeiro acesso.",
        }, 500);
      }

      const conflictResponse = await validateExistingIdentity(authUser);
      if (conflictResponse) return conflictResponse;
    }
  } else {
    const conflictResponse = await validateExistingIdentity(authUser);
    if (conflictResponse) return conflictResponse;
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
    acesso_institucional_origem: reusedPartnerIdentity
      ? "IDENTIDADE_EXISTENTE"
      : "CONVITE",
    primeiro_acesso_institucional_pendente: !reusedPartnerIdentity,
    primeiro_acesso_institucional_operacao_id: reusedPartnerIdentity
      ? null
      : institutionalInviteOperationId,
  };

  const { data: savedUser, error: saveUserError } = await admin
    .from("usuarios_sistema")
    .insert(userPayload)
    .select(
      "id, nome, email, auth_user_id, cpf, telefone, perfil, status, context, polo_ids, permissoes, perfil_acesso_id, personalizar_permissoes, restricao_horario, setor_comunicacao, polo_comunicacao_id, pode_visualizar_todos_polos, pode_visualizar_todos_setores, created_at",
    )
    .single();

  if (saveUserError) {
    // Auth e usuarios_sistema não participam da mesma transação. Excluir a
    // identidade recém-convidada depois de uma leitura/escrita que falhou
    // deixaria uma janela para outro fluxo tê-la vinculado a um parceiro.
    // Preserve-a para reconciliação: sem usuario_sistema ela não recebe
    // permissões institucionais, e nunca removemos uma conta de terceiro.
    if (saveUserError.code === "23505") {
      return json({
        success: false,
        code: "GESTOR_CONFLITO_APOS_CONVITE",
        error:
          "Um conflito de e-mail, CPF ou identidade foi detectado durante o cadastro. A identidade convidada foi preservada e nenhum novo convite deve ser enviado até a revisão dos dados.",
      }, 409);
    }
    if (createdAuthUserId) {
      return json({
        success: false,
        code: "GESTOR_CADASTRO_INTERNO_FALHOU",
        error:
          "O cadastro interno não foi concluído após o envio do convite. A identidade convidada foi preservada para reconciliação segura deste e-mail.",
      }, 500);
    }
    return json({ success: false, error: saveUserError.message }, 500);
  }

  return json({
    success: true,
    action: "upsert-gestor-user",
    userId: authUser?.id || null,
    inviteSent: Boolean(createdAuthUserId),
    user: savedUser,
    message: reusedPartnerIdentity
      ? "Usuário cadastrado e vinculado ao acesso existente. A senha atual foi preservada."
      : reconciledPendingInvite
      ? "Cadastro interno reconciliado com o convite já enviado. O link de primeiro acesso permanece válido."
      : "Usuário cadastrado. Enviamos um convite de primeiro acesso para o e-mail informado.",
  });
};
