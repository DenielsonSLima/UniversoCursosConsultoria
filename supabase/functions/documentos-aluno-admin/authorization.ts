import type { GestorAutorizado } from "../_shared/authz.ts";

interface AlunoScope {
  polo_id?: string | null;
  polo_ids?: unknown;
}

const normalizeIds = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

export const gestorCanManageAluno = (
  gestor: GestorAutorizado,
  aluno: AlunoScope,
) => {
  if (gestor.isGlobal) return true;

  const alunoPolos = new Set([
    String(aluno.polo_id || "").trim(),
    ...normalizeIds(aluno.polo_ids),
  ].filter(Boolean));

  return gestor.poloIds.some((poloId) => alunoPolos.has(poloId));
};
