import { findAuthUserByEmail, normalizeEmail } from "../auth-users.ts";
import type { HandlerContext, Partner } from "../types.ts";

export const handleConfirmPartnerEmail = async (
  context: HandlerContext,
  partner: Partner,
) => {
  const { admin, json } = context;
  const email = normalizeEmail(partner.email);
  if (!email) {
    return json(
      { success: false, error: "Este cadastro não possui e-mail." },
      400,
    );
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

  if (!authUser?.id) {
    return json({
      success: false,
      error:
        "Este e-mail ainda não possui usuário de acesso. Envie o convite antes de confirmar.",
    }, 404);
  }

  if (authUser.email_confirmed_at || authUser.confirmed_at) {
    return json({
      success: true,
      action: "confirm-partner-email",
      userId: authUser.id,
      emailConfirmed: true,
      message: "Este e-mail já estava confirmado.",
    });
  }

  return json({
    success: false,
    action: "confirm-partner-email",
    userId: authUser.id,
    emailConfirmed: false,
    error:
      "A confirmação manual foi desativada. Reenvie o convite: o próprio aluno deve validar o e-mail pelo link recebido.",
  }, 409);
};
