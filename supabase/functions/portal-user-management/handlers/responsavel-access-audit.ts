import type { HandlerContext } from "../types.ts";
import type { PreparedResponsavelAccess } from "./responsavel-access-context.ts";

type ResponsavelAccessAuditInput = {
  action: string;
  description: string;
  details?: Record<string, boolean | number | string | null>;
};

/**
 * Registra somente a autorização administrativa. Senha, token, link de ação e
 * marcador técnico do Auth nunca são incluídos nos detalhes da auditoria.
 */
export const recordResponsavelAccessAudit = async (
  context: HandlerContext,
  responsavel: PreparedResponsavelAccess,
  input: ResponsavelAccessAuditInput,
) => {
  const { error } = await context.admin.from("sistema_eventos").insert({
    actor_id: context.gestor?.id || null,
    actor_nome: context.gestor?.nome || context.gestorEmail,
    actor_email: context.gestorEmail,
    actor_tipo: "Gestor",
    pessoa_id: responsavel.responsavelLegalId,
    pessoa_nome: responsavel.nome,
    pessoa_tipo: "Responsável Legal",
    polo_id: null,
    modulo: "Parceiros",
    entidade: "responsaveis_legais",
    entidade_id: responsavel.responsavelLegalId,
    acao: input.action,
    descricao: input.description,
    origem: "Aplicativo",
    detalhes: input.details || {},
  });

  if (error) {
    throw new Error(
      error.message || "Não foi possível registrar a auditoria de acesso.",
    );
  }
};
