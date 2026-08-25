import { findAuthUserByEmail, normalizeEmail } from "../auth-users.ts";
import { logPortalHandlerFailure } from "./handler-error-log.ts";
import type { HandlerContext, Partner } from "../types.ts";

const ACTION = "delete-partner";

export const handleDeletePartner = async (
  context: HandlerContext,
  partner: Partner,
) => {
  const { admin, gestorEmail, json } = context;
  const email = normalizeEmail(partner.auth_login_email || partner.email);
  const shouldDeleteAuthUser = ["Aluno", "Professor"].includes(partner.tipo) &&
    Boolean(email);
  let authUserDeleted = false;
  let authUserBefore: any = null;

  const { count: documentHistoryCount, error: documentHistoryError } =
    await admin
      .from("documentos_aluno_lotes")
      .select("id", { count: "exact", head: true })
      .eq("aluno_id", partner.id);
  if (documentHistoryError) {
    return json({
      success: false,
      error:
        "Não foi possível verificar o histórico documental antes da exclusão.",
    }, 500);
  }

  if ((documentHistoryCount || 0) > 0) {
    const { error: deactivateError } = await admin
      .from("parceiros")
      .update({ status: "INATIVO" })
      .eq("id", partner.id);
    if (deactivateError) {
      return json({
        success: false,
        error: deactivateError.message ||
          "Não foi possível inativar o parceiro com histórico documental.",
      }, 500);
    }
    return json({
      success: true,
      action: "deactivate-partner",
      partnerDeleted: false,
      partnerDeactivated: true,
      authUserDeleted: false,
      message:
        "Parceiro inativado. O cadastro, o login e o histórico documental foram preservados para auditoria.",
    });
  }

  if (shouldDeleteAuthUser) {
    if (email === gestorEmail) {
      return json({
        success: false,
        error:
          "Não é possível excluir o usuário de autenticação da sessão atual. Use outro administrador para esta remoção.",
      }, 400);
    }

    try {
      authUserBefore = await findAuthUserByEmail(admin, email);
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error
          ? error.message
          : "Não foi possível localizar o usuário no Supabase Auth.",
      }, 500);
    }
  }

  // O banco executa a remoção conservadora do Auth no mesmo DELETE de
  // parceiros. A ordem é intencional: se alguma FK de auditoria bloquear a
  // exclusão, o usuário continua com acesso e não fica órfão.
  const { error: deletePartnerError } = await admin
    .from("parceiros")
    .delete()
    .eq("id", partner.id);

  if (deletePartnerError) {
    const retryableConflict = ["40001", "40P01"].includes(
      deletePartnerError.code,
    );
    logPortalHandlerFailure(ACTION, "delete-partner", deletePartnerError);
    return json({
      success: false,
      error: retryableConflict
        ? "O vínculo de acesso mudou durante a exclusão. Atualize os dados e tente novamente."
        : "Não foi possível excluir o parceiro. Arquive e exclua os documentos administrativos antes de tentar novamente.",
    }, retryableConflict ? 409 : 500);
  }

  if (authUserBefore?.id) {
    try {
      const authUserAfter = await findAuthUserByEmail(admin, email);
      authUserDeleted = !authUserAfter;
    } catch {
      // A exclusão principal já foi confirmada. Uma falha apenas na leitura de
      // verificação não deve transformar o resultado transacional em erro.
      authUserDeleted = false;
    }
  }

  return json({
    success: true,
    action: "delete-partner",
    partnerDeleted: true,
    authUserDeleted,
    message: shouldDeleteAuthUser
      ? authUserDeleted
        ? "Parceiro e usuário de autenticação excluídos com sucesso."
        : "Parceiro excluído. O usuário de autenticação foi preservado pelas regras de vínculo."
      : "Parceiro excluído com sucesso.",
  });
};
