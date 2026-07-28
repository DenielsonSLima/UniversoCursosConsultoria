import { getGestorScope } from "../gestor-access.ts";
import { gestorHasModule } from "../permissions.ts";
import type { HandlerContext, GestorUserManagementState } from "../types.ts";

const assertCanManageGestorUsers = async (context: HandlerContext) => {
  const scope = await getGestorScope(context.admin, context.gestor);
  if (!scope.global || !gestorHasModule(context.gestor, "configuracoes")) {
    return context.json({
      success: false,
      error:
        "Apenas gestor global com acesso a Configurações pode gerenciar usuários.",
    }, 403);
  }
  return null;
};

const loadTargets = async (
  context: HandlerContext,
  userIds: string[],
) => {
  const normalizedIds = [...new Set(
    userIds.map((id) => String(id || "").trim()).filter(Boolean),
  )].slice(0, 100);

  if (!normalizedIds.length) return [];

  const { data, error } = await context.admin
    .from("usuarios_sistema")
    .select("id, nome, email, status")
    .in("id", normalizedIds);

  if (error) throw new Error(error.message);
  return data || [];
};

const getManagementState = async (
  context: HandlerContext,
  user: Record<string, unknown>,
): Promise<GestorUserManagementState> => {
  const userId = String(user.id || "");
  const isSelf = userId === String(context.gestor?.id || "") ||
    String(user.email || "").toLowerCase() ===
      String(context.gestorEmail || "").toLowerCase();

  if (isSelf) {
    return {
      userId,
      canDelete: false,
      canChangeStatus: false,
      hasActivity: true,
      reason: "O usuário da sessão não pode ser inativado nem excluído.",
    };
  }

  const { data, error } = await context.admin.rpc(
    "usuario_sistema_tem_atividade",
    { p_usuario_id: userId },
  );
  if (error) throw new Error(error.message);

  const hasActivity = Boolean(data);
  return {
    userId,
    canDelete: !hasActivity,
    canChangeStatus: true,
    hasActivity,
    reason: hasActivity
      ? "Este usuário possui histórico de atividades e só pode ser inativado."
      : null,
  };
};

const recordAudit = async (
  context: HandlerContext,
  input: {
    action: string;
    description: string;
    targetId: string;
    targetName: string;
    details?: Record<string, unknown>;
  },
) => {
  await context.admin.from("sistema_eventos").insert({
    actor_id: context.gestor?.id || null,
    actor_nome: context.gestor?.nome || context.gestorEmail,
    actor_email: context.gestorEmail,
    actor_tipo: "Gestor",
    pessoa_id: input.targetId,
    pessoa_nome: input.targetName,
    pessoa_tipo: "Gestor",
    modulo: "Configurações",
    entidade: "usuarios_sistema",
    entidade_id: input.targetId,
    acao: input.action,
    descricao: input.description,
    origem: "Aplicativo",
    detalhes: input.details || {},
  });
};

export const handleListGestorUserManagementStates = async (
  context: HandlerContext,
  userIds: string[] | undefined,
) => {
  const authorizationError = await assertCanManageGestorUsers(context);
  if (authorizationError) return authorizationError;

  try {
    const users = await loadTargets(context, userIds || []);
    const managementStates = await Promise.all(
      users.map((user: Record<string, unknown>) =>
        getManagementState(context, user)
      ),
    );
    return context.json({
      success: true,
      action: "list-gestor-user-management-states",
      managementStates,
    });
  } catch (error) {
    return context.json({
      success: false,
      error: error instanceof Error
        ? error.message
        : "Não foi possível verificar o histórico dos usuários.",
    }, 500);
  }
};

export const handleSetGestorUserStatus = async (
  context: HandlerContext,
  userIdInput: string | undefined,
  statusInput: string | undefined,
) => {
  const authorizationError = await assertCanManageGestorUsers(context);
  if (authorizationError) return authorizationError;

  const userId = String(userIdInput || "").trim();
  const status = String(statusInput || "").trim();
  if (!userId || !["Ativo", "Inativo"].includes(status)) {
    return context.json({
      success: false,
      error: "Usuário ou status inválido.",
    }, 400);
  }

  try {
    const [target] = await loadTargets(context, [userId]);
    if (!target) {
      return context.json({
        success: false,
        error: "Usuário não encontrado.",
      }, 404);
    }

    const state = await getManagementState(context, target);
    if (!state.canChangeStatus) {
      return context.json({
        success: false,
        error: state.reason || "O status deste usuário não pode ser alterado.",
      }, 403);
    }

    const { error } = await context.admin
      .from("usuarios_sistema")
      .update({ status })
      .eq("id", userId);
    if (error) throw new Error(error.message);

    await recordAudit(context, {
      action: status === "Ativo" ? "Reativou usuário" : "Inativou usuário",
      description: `${status === "Ativo" ? "Reativou" : "Inativou"} o usuário gestor: ${target.nome}`,
      targetId: userId,
      targetName: String(target.nome || target.email || "Usuário"),
      details: { status },
    });

    return context.json({
      success: true,
      action: "set-gestor-user-status",
      user: { ...target, status },
      message: status === "Ativo"
        ? "Usuário reativado com sucesso."
        : "Usuário inativado com sucesso.",
    });
  } catch (error) {
    return context.json({
      success: false,
      error: error instanceof Error
        ? error.message
        : "Não foi possível alterar o status do usuário.",
    }, 500);
  }
};

export const handleDeleteGestorUser = async (
  context: HandlerContext,
  userIdInput: string | undefined,
) => {
  const authorizationError = await assertCanManageGestorUsers(context);
  if (authorizationError) return authorizationError;

  const userId = String(userIdInput || "").trim();
  if (!userId) {
    return context.json({
      success: false,
      error: "Usuário inválido.",
    }, 400);
  }

  try {
    const [target] = await loadTargets(context, [userId]);
    if (!target) {
      return context.json({
        success: false,
        error: "Usuário não encontrado.",
      }, 404);
    }

    const state = await getManagementState(context, target);
    if (!state.canDelete) {
      return context.json({
        success: false,
        error: state.reason ||
          "Este usuário possui histórico e deve ser apenas inativado.",
      }, 409);
    }

    const { error } = await context.admin
      .from("usuarios_sistema")
      .delete()
      .eq("id", userId);
    if (error) throw new Error(error.message);

    await recordAudit(context, {
      action: "Excluiu usuário sem atividade",
      description: `Excluiu o usuário gestor sem histórico operacional: ${target.nome}`,
      targetId: userId,
      targetName: String(target.nome || target.email || "Usuário"),
      details: { email: target.email, motivo: "sem_atividade" },
    });

    return context.json({
      success: true,
      action: "delete-gestor-user",
      userId,
      message: "Usuário sem atividade excluído com sucesso.",
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Não foi possível excluir o usuário.";
    const hasActivity = message.toLowerCase().includes("atividade") ||
      message.toLowerCase().includes("inativ");
    return context.json({
      success: false,
      error: hasActivity
        ? "Este usuário possui histórico de atividades e deve ser apenas inativado."
        : message,
    }, hasActivity ? 409 : 500);
  }
};
