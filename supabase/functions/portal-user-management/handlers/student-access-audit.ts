import type { HandlerContext, Partner } from "../types.ts";

type StudentAccessAuditInput = {
  action: string;
  description: string;
  details?: Record<string, boolean | number | string | null>;
};

/**
 * Registra apenas o fato administrativo. Senhas, links, tokens e marcadores
 * internos do Auth não podem fazer parte desta trilha.
 */
export const recordStudentAccessAudit = async (
  context: HandlerContext,
  partner: Partner,
  input: StudentAccessAuditInput,
) => {
  const { error } = await context.admin.from("sistema_eventos").insert({
    actor_id: context.gestor?.id || null,
    actor_nome: context.gestor?.nome || context.gestorEmail,
    actor_email: context.gestorEmail,
    actor_tipo: "Gestor",
    pessoa_id: partner.id,
    pessoa_nome: partner.nome,
    pessoa_tipo: "Aluno",
    polo_id: partner.polo_id || null,
    modulo: "Parceiros",
    entidade: "parceiros",
    entidade_id: partner.id,
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
