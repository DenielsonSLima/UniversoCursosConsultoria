import { findAuthUserByEmail, normalizeEmail } from "../auth-users.ts";
import type { HandlerContext, Partner } from "../types.ts";

export const handleConfirmPartnerEmail = async (
  context: HandlerContext,
  partner: Partner,
) => {
  const { admin, gestor, gestorEmail, json } = context;
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

  const auditPayload = {
    actor_id: gestor.id,
    actor_nome: gestor.nome || gestorEmail,
    actor_email: gestorEmail,
    actor_tipo: "Gestor",
    pessoa_id: partner.id,
    pessoa_nome: partner.nome,
    pessoa_tipo: partner.tipo,
    polo_id: partner.polo_id,
    modulo: "Parceiros",
    entidade: "auth.users",
    entidade_id: authUser.id,
    origem: "Aplicativo",
    detalhes: { partner_id: partner.id, auth_user_id: authUser.id },
  };

  const { data: auditEvent, error: auditError } = await admin
    .from("sistema_eventos")
    .insert({
      ...auditPayload,
      acao: "Solicitou confirmação manual de e-mail",
      descricao:
        `Gestor solicitou a confirmação manual do e-mail de ${partner.nome}.`,
    })
    .select("id")
    .single();

  if (auditError) {
    return json({
      success: false,
      error:
        "Não foi possível registrar a auditoria. O e-mail não foi alterado.",
    }, 500);
  }

  const { error: confirmError } = await admin.auth.admin.updateUserById(
    authUser.id,
    {
      email_confirm: true,
    },
  );

  if (confirmError) {
    await admin.from("sistema_eventos").update({
      acao: "Falha ao confirmar e-mail manualmente",
      descricao:
        `A confirmação manual do e-mail de ${partner.nome} falhou no serviço de autenticação.`,
      detalhes: { ...auditPayload.detalhes, erro: confirmError.message },
    }).eq("id", auditEvent.id);
    return json({ success: false, error: confirmError.message }, 500);
  }

  const { error: auditCompletionError } = await admin.from("sistema_eventos")
    .update({
      acao: "Confirmou e-mail manualmente",
      descricao:
        `E-mail de ${partner.nome} confirmado manualmente pelo gestor.`,
    }).eq("id", auditEvent.id);

  if (auditCompletionError) {
    return json({
      success: false,
      emailConfirmed: true,
      error:
        "O e-mail foi confirmado, mas não foi possível finalizar o registro de auditoria.",
    }, 500);
  }

  return json({
    success: true,
    action: "confirm-partner-email",
    userId: authUser.id,
    emailConfirmed: true,
    message: "E-mail confirmado manualmente com sucesso.",
  });
};
