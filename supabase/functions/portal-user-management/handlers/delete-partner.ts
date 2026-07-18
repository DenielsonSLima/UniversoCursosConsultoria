import { findAuthUserByEmail, normalizeEmail } from "../auth-users.ts";
import type { HandlerContext, Partner } from "../types.ts";

export const handleDeletePartner = async (
  context: HandlerContext,
  partner: Partner,
) => {
  const { admin, gestorEmail, json } = context;
  const email = normalizeEmail(partner.email);
  const shouldDeleteAuthUser = ["Aluno", "Professor"].includes(partner.tipo) &&
    Boolean(email);
  let authUserDeleted = false;

  if (shouldDeleteAuthUser) {
    if (email === gestorEmail) {
      return json({
        success: false,
        error:
          "Não é possível excluir o usuário de autenticação da sessão atual. Use outro administrador para esta remoção.",
      }, 400);
    }

    let authUser: any;
    try {
      authUser = await findAuthUserByEmail(admin, email);
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error
          ? error.message
          : "Não foi possível localizar o usuário no Supabase Auth.",
      }, 500);
    }

    if (authUser?.id) {
      const { error: deleteAuthError } = await admin.auth.admin.deleteUser(
        authUser.id,
      );
      if (deleteAuthError) {
        return json({
          success: false,
          error: deleteAuthError.message ||
            "Não foi possível excluir o usuário no Supabase Auth.",
        }, 500);
      }
      authUserDeleted = true;
    }
  }

  const { error: deletePartnerError } = await admin
    .from("parceiros")
    .delete()
    .eq("id", partner.id);

  if (deletePartnerError) {
    return json({
      success: false,
      error: deletePartnerError.message ||
        "Não foi possível excluir o parceiro.",
    }, 500);
  }

  return json({
    success: true,
    action: "delete-partner",
    partnerDeleted: true,
    authUserDeleted,
    message: shouldDeleteAuthUser
      ? authUserDeleted
        ? "Parceiro e usuário de autenticação excluídos com sucesso."
        : "Parceiro excluído. Nenhum usuário correspondente foi encontrado no Supabase Auth."
      : "Parceiro excluído com sucesso.",
  });
};
